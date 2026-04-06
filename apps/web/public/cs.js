/**
 * ChurnShield embed  cancel intent + streaming Claude chat overlay + outcome tracking.
 * Script: data-app-id (App ID) + data-key (snippet key). Prefer data-app-id for public API id.
 * Identify: window.ChurnShield.identify({
 *   subscriberId, subscriptionMrr, subscriberEmail?, subscriptionId?,
 *   authHash? | getAuthHash?(cus) | authHashUrl?
 * })
 * cancel-intent always requires authHash; use getAuthHash or authHashUrl to fetch from your API.
 */
(function () {
  var API_CANCEL  = "/api/public/cancel-intent";
  var API_CHAT    = "/api/public/cancel-chat";
  var API_OUTCOME = "/api/public/cancel-outcome";
  var API_PAUSE   = "/api/public/pause";
  var API_STATUS  = "/api/public/subscriber-status";
  var DEFAULT_SELECTOR = "[data-churnshield-cancel], [data-churnshield-cancel='true']";

  function currentScript() { return document.currentScript; }

  function apiBase(script) {
    var base = script && script.getAttribute("data-api-base");
    if (base) return base.replace(/\/$/, "");
    if (script && script.src) {
      try { return new URL(script.src).origin; } catch (_) {}
    }
    return "";
  }

  /** Public tenant id: data-app-id (preferred) or data-key */
  function publicEmbedId(script) {
    return (script && (script.getAttribute("data-app-id") || script.getAttribute("data-key"))) || "";
  }
  function cancelSelector(script)  { return (script && script.getAttribute("data-cancel-selector")) || DEFAULT_SELECTOR; }

  var identifyState = {
    subscriberId: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    subscriberEmail: null,
    authHash: null,
    getAuthHashFn: null,
    authHashUrl: null,
    subscriptionMrr: 0,
    bound: false,
  };
  var wallState = { paymentWallActive: false, pauseWallActive: false };
  var _base = "";
  var _key  = "";

  var overlayEls = { root: null, messages: null, input: null, send: null, outcomeBar: null, typing: null };

  // Design tokens  ChurnShield brand (DM Sans, premium SaaS)
  var T = {
    primary:     "#09090b",
    primaryDk:   "#18181b",
    primaryGlow: "rgba(9,9,11,0.12)",
    green:       "#16a34a",
    greenDk:     "#15803d",
    greenGlow:   "rgba(22,163,74,0.15)",
    border:      "#e2e8f0",
    borderLight: "#f1f5f9",
    bg:          "#f8fafc",
    surface:     "#ffffff",
    text:        "#0f172a",
    textMuted:   "#64748b",
    textLight:   "#94a3b8",
    userBg:      "#09090b",
    userText:    "#ffffff",
    aiBg:        "#ffffff",
    aiBorder:    "#e8edf2",
    aiText:      "#0f172a",
    headerBg:    "#ffffff",
    headerText:  "#09090b",
    shadow:      "0 32px 80px rgba(15,23,42,0.32), 0 8px 24px rgba(15,23,42,0.10)",
    font:        "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  };

  var chatState = {
    messages: [],
    sessionId: null,
    base: "",
    key: "",
    busy: false,
    outcomeSent: false,
    firstAssistantDone: false,
    cancelEl: null,   // original element that was clicked  re-fired on confirmed cancel
  };

  // Flag to let the next cancel click pass through without ChurnShield intercepting it
  var _bypassNext = false;

  // ── Cancel intent ────────────────────────────────────────────────────────────

  function resolveAuthHashUrl(pathOrUrl) {
    try { return new URL(pathOrUrl, window.location.href).href; } catch (_) { return pathOrUrl; }
  }

  function postCancelIntent(base, key) {
    if (!key || !identifyState.subscriberId) {
      console.warn("[ChurnShield] missing data-app-id/data-key or identify(subscriberId)");
      return Promise.resolve(null);
    }

    function doPost() {
      return fetch(base + API_CANCEL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snippetKey: key,
          subscriberId: identifyState.subscriberId,
          subscriptionMrr: identifyState.subscriptionMrr || 0,
          subscriberEmail: identifyState.subscriberEmail || undefined,
          subscriptionId: identifyState.stripeSubscriptionId || undefined,
          authHash: identifyState.authHash || undefined,
        }),
      }).then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || r.statusText);
          return data;
        });
      });
    }

    var chain = Promise.resolve();
    if (typeof identifyState.getAuthHashFn === "function") {
      chain = Promise.resolve(identifyState.getAuthHashFn(identifyState.subscriberId)).then(function (h) {
        identifyState.authHash = h != null && String(h).trim() ? String(h).trim() : null;
      });
    } else if (identifyState.authHashUrl) {
      var url = resolveAuthHashUrl(identifyState.authHashUrl);
      chain = fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriberId: identifyState.subscriberId }),
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          identifyState.authHash = j && j.authHash ? String(j.authHash).trim() : null;
        });
    }
    return chain.then(function () { return doPost(); });
  }

  // ── Outcome reporting ────────────────────────────────────────────────────────
  // detectOffer() heuristic removed  offerType/discountPct now come from the
  // server-side makeOffer tool call stored in save_sessions.pending_offer.
  // The client only sends the last assistant message as offerMade for display.

  function lastAssistantMessage(messages) {
    for (var i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content || "";
    }
    return "";
  }

  function postOutcome(outcome) {
    if (chatState.outcomeSent || !chatState.sessionId) return Promise.resolve(null);
    chatState.outcomeSent = true;

    var lastMsg = lastAssistantMessage(chatState.messages);

    return fetch(chatState.base + API_OUTCOME, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snippetKey:      chatState.key,
        sessionId:       chatState.sessionId,
        outcome:         outcome,
        offerMade:       lastMsg.slice(0, 500),
        subscriberEmail: identifyState.subscriberEmail || undefined,
      }),
    }).catch(function (err) {
      console.error("[ChurnShield] cancel-outcome failed", err);
    });
  }

  // ── Overlay UI ───────────────────────────────────────────────────────────────

  // Load DM Sans from Google Fonts (best-effort  falls back to system font)
  if (!document.getElementById("cs-dmfont")) {
    var _font = document.createElement("link");
    _font.id = "cs-dmfont";
    _font.rel = "stylesheet";
    _font.href = "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap";
    document.head.appendChild(_font);
  }

  var _style = document.createElement("style");
  _style.textContent = [
    "@keyframes cs-slide-up{from{opacity:0;transform:translateY(28px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}",
    "@keyframes cs-slide-up-mobile{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}",
    "@keyframes cs-fade-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}",
    "@keyframes cs-backdrop-in{from{opacity:0}to{opacity:1}}",
    "@keyframes cs-dot{0%,60%,100%{transform:translateY(0);opacity:0.35}30%{transform:translateY(-5px);opacity:1}}",
    "@keyframes cs-tri-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}",
    "#churnshield-overlay{animation:cs-backdrop-in 200ms ease both}",
    "#churnshield-overlay *{box-sizing:border-box;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}",
    "#churnshield-overlay .cs-panel-desktop{animation:cs-slide-up 300ms cubic-bezier(0.34,1.4,0.64,1) both}",
    "#churnshield-overlay .cs-panel-mobile{animation:cs-slide-up-mobile 320ms cubic-bezier(0.22,1,0.36,1) both}",
    "#churnshield-overlay .cs-bubble{animation:cs-fade-in 200ms ease-out both}",
    "#churnshield-overlay .cs-messages::-webkit-scrollbar{width:4px}",
    "#churnshield-overlay .cs-messages::-webkit-scrollbar-track{background:transparent}",
    "#churnshield-overlay .cs-messages::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:99px}",
    "#churnshield-overlay .cs-keep:hover:not(:disabled){background:" + T.greenDk + "!important;transform:translateY(-1px);box-shadow:0 6px 20px " + T.greenGlow + "!important}",
    "#churnshield-overlay .cs-keep:active:not(:disabled){transform:translateY(0)!important}",
    "#churnshield-overlay .cs-cancel:hover{background:#f8fafc!important;color:#475569!important}",
    "#churnshield-overlay .cs-send:hover:not(:disabled){background:" + T.primaryDk + "!important;transform:scale(1.05)}",
    "#churnshield-overlay .cs-send:active:not(:disabled){transform:scale(0.97)!important}",
    "#churnshield-overlay .cs-close:hover{background:#f4f4f5!important}",
    "#churnshield-overlay .cs-input:focus{outline:none!important;border:none!important;box-shadow:none!important}",
    "#churnshield-overlay .cs-keep,.cs-send{transition:background 150ms ease,transform 150ms ease,box-shadow 150ms ease!important}",
    "@media(prefers-reduced-motion:reduce){#churnshield-overlay .cs-panel-desktop,#churnshield-overlay .cs-panel-mobile,#churnshield-overlay .cs-bubble,#churnshield-overlay{animation:none!important}}",
  ].join("");
  document.head.appendChild(_style);

  // Basic markdown → safe HTML (bold, italic, newlines only  no XSS vectors)
  function renderMarkdown(text) {
    if (!text) return "";
    // Escape HTML entities first
    var safe = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    // Bold **text**
    safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic *text* (not inside **)
    safe = safe.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
    // Newlines → <br>
    safe = safe.replace(/\n/g, "<br>");
    return safe;
  }

  function clearMessagesUi() {
    while (overlayEls.messages && overlayEls.messages.firstChild) {
      overlayEls.messages.removeChild(overlayEls.messages.firstChild);
    }
  }

  function appendMessage(role, text) {
    hideTypingIndicator();
    var isUser = role === "user";
    var row = document.createElement("div");
    row.className = "cs-bubble";
    row.style.cssText = "display:flex;align-items:flex-end;gap:8px;margin-bottom:14px;" + (isUser ? "flex-direction:row-reverse;" : "flex-direction:row;");

    if (!isUser) {
      var avatar = document.createElement("div");
      avatar.style.cssText = "width:28px;height:28px;border-radius:50%;background:#f4f4f5;border:1px solid #e4e4e7;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
      // HugeIcons-style AI sparkle icon (Stars icon path)
      avatar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#09090b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/></svg>';
      row.appendChild(avatar);
    }

    var bubble = document.createElement("div");
    bubble.style.cssText = [
      "max-width:78%;padding:11px 15px;word-break:break-word;white-space:pre-wrap;",
      "font-size:14px;line-height:1.6;font-family:" + T.font + ";",
      isUser
        ? "background:linear-gradient(135deg," + T.primary + "," + T.primaryDk + ");color:#fff;border-radius:18px 18px 4px 18px;box-shadow:0 2px 10px rgba(37,99,235,0.22);"
        : "background:#eef2f7;color:" + T.aiText + ";border-radius:4px 18px 18px 18px;",
    ].join("");
    if (text && !isUser) {
      bubble.innerHTML = renderMarkdown(text);
    } else {
      bubble.textContent = text || "";
    }
    row.appendChild(bubble);
    overlayEls.messages.appendChild(row);
    overlayEls.messages.scrollTop = overlayEls.messages.scrollHeight;
    return bubble;
  }

  function renderHistory() {
    clearMessagesUi();
    for (var i = 0; i < chatState.messages.length; i++) {
      appendMessage(chatState.messages[i].role, chatState.messages[i].content);
    }
    overlayEls.messages.scrollTop = overlayEls.messages.scrollHeight;
  }

  function showTypingIndicator() {
    if (!overlayEls.messages || overlayEls.typing) return;
    var row = document.createElement("div");
    row.className = "cs-bubble";
    row.style.cssText = "display:flex;align-items:flex-end;gap:8px;flex-direction:row;margin-bottom:14px;";

    var avatar = document.createElement("div");
    avatar.style.cssText = "width:28px;height:28px;border-radius:50%;background:#09090b;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.18);";
    avatar.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
    row.appendChild(avatar);

    var bubble = document.createElement("div");
    bubble.style.cssText = "padding:13px 18px;border-radius:4px 18px 18px 18px;background:" + T.aiBg + ";border:1px solid " + T.aiBorder + ";box-shadow:0 1px 4px rgba(0,0,0,0.06);display:flex;align-items:center;gap:5px;";
    for (var d = 0; d < 3; d++) {
      var dot = document.createElement("span");
      dot.style.cssText = "display:inline-block;width:6px;height:6px;border-radius:50%;background:" + T.primary + ";opacity:0.35;animation:cs-dot 1.1s ease-in-out " + (d * 0.18) + "s infinite;";
      bubble.appendChild(dot);
    }
    row.appendChild(bubble);
    overlayEls.messages.appendChild(row);
    overlayEls.messages.scrollTop = overlayEls.messages.scrollHeight;
    overlayEls.typing = row;
  }

  function hideTypingIndicator() {
    if (overlayEls.typing && overlayEls.typing.parentNode) {
      overlayEls.typing.parentNode.removeChild(overlayEls.typing);
    }
    overlayEls.typing = null;
  }

  function showOutcomeBar() {
    if (!overlayEls.outcomeBar || chatState.firstAssistantDone) return;
    chatState.firstAssistantDone = true;
    overlayEls.outcomeBar.style.display = "flex";
  }

  function closeOverlay() {
    if (overlayEls.root) overlayEls.root.remove();
    overlayEls.root     = null;
    overlayEls.messages = null;
    overlayEls.input    = null;
    overlayEls.send     = null;
    overlayEls.outcomeBar = null;
    overlayEls.typing   = null;
    chatState.sessionId = null;
    chatState.messages  = [];
    chatState.busy      = false;
    chatState.outcomeSent = false;
    chatState.firstAssistantDone = false;
  }

  function ensureOverlay() {
    if (overlayEls.root) return;

    var isMobile = window.innerWidth < 520;

    // ── Backdrop ──
    var root = document.createElement("div");
    root.id = "churnshield-overlay";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "ChurnShield retention assistant");
    root.style.cssText = [
      "position:fixed;inset:0;z-index:2147483647;",
      "background:rgba(15,23,42,0.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);",
      "display:flex;align-items:" + (isMobile ? "flex-end" : "center") + ";justify-content:center;",
      "padding:" + (isMobile ? "0" : "20px") + ";",
      "font-family:" + T.font + ";",
    ].join("");

    // ── Panel ──
    var panel = document.createElement("div");
    panel.className = isMobile ? "cs-panel-mobile" : "cs-panel-desktop";
    panel.style.cssText = [
      "background:" + T.surface + ";",
      "width:" + (isMobile ? "100%" : "min(460px,calc(100vw - 32px))") + ";",
      "height:" + (isMobile ? "min(93dvh,93vh)" : "min(600px,90vh)") + ";",
      "display:flex;flex-direction:column;",
      "box-shadow:" + T.shadow + ";",
      "border-radius:" + (isMobile ? "24px 24px 0 0" : "20px") + ";",
      "overflow:hidden;",
    ].join("");

    // ── Header ──
    var header = document.createElement("div");
    header.style.cssText = [
      "padding:18px 18px 16px;",
      "background:" + T.headerBg + ";",
      "border-bottom:1px solid #f0f0f0;",
      "display:flex;align-items:center;gap:12px;flex-shrink:0;",
    ].join("");

    var hText = document.createElement("div");
    hText.style.cssText = "flex:1;min-width:0;";
    var hTitle = document.createElement("div");
    hTitle.style.cssText = "font-size:15px;font-weight:700;color:#09090b;line-height:1.25;letter-spacing:-0.3px;";
    hTitle.textContent = "Aria · Retention Assistant";
    var hSub = document.createElement("div");
    hSub.style.cssText = "font-size:12px;color:#64748b;margin-top:2px;display:flex;align-items:center;gap:5px;";
    var statusDot = document.createElement("span");
    statusDot.style.cssText = "width:6px;height:6px;border-radius:50%;background:#4ade80;display:inline-block;flex-shrink:0;box-shadow:0 0 6px rgba(74,222,128,0.6);";
    hSub.appendChild(statusDot);
    hSub.appendChild(document.createTextNode("ChurnShield · Active"));
    hText.appendChild(hTitle);
    hText.appendChild(hSub);

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "cs-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.style.cssText = "border:1px solid #e4e4e7;background:#f4f4f5;width:34px;height:34px;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background 150ms;";
    closeBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#71717a" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeBtn.onclick = function () {
      postOutcome("cancelled").then(function () {
        var el = chatState.cancelEl;
        closeOverlay();
        if (el && el.isConnected) { _bypassNext = true; el.click(); }
      });
    };

    header.appendChild(hText);
    header.appendChild(closeBtn);

    // ── Messages ──
    var messages = document.createElement("div");
    messages.className = "cs-messages";
    messages.style.cssText = "flex:1;overflow-y:auto;padding:20px 16px 12px;background:" + T.bg + ";scroll-behavior:smooth;";

    // ── Outcome bar ──
    var outcomeBar = document.createElement("div");
    outcomeBar.style.cssText = "display:none;padding:10px 14px 12px;gap:8px;border-top:1px solid " + T.borderLight + ";background:" + T.surface + ";flex-direction:row;align-items:center;flex-shrink:0;";

    var keepBtn = document.createElement("button");
    keepBtn.type = "button";
    keepBtn.className = "cs-keep";
    keepBtn.setAttribute("aria-label", "Keep my subscription");
    keepBtn.style.cssText = "flex:1;padding:10px 14px;border-radius:10px;border:none;background:linear-gradient(135deg," + T.green + "," + T.greenDk + ");color:#fff;font-weight:600;cursor:pointer;font-size:13px;font-family:" + T.font + ";display:flex;align-items:center;justify-content:center;gap:6px;min-height:40px;box-shadow:0 3px 10px " + T.greenGlow + ";letter-spacing:-0.1px;";
    keepBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Keep my subscription';
    keepBtn.onclick = function () {
      keepBtn.disabled = true;
      keepBtn.style.opacity = "0.7";
      postOutcome("saved").then(function () {
        clearMessagesUi();
        appendMessage("assistant", "Your subscription continues  nothing changes. Thank you for staying!");
        outcomeBar.style.display = "none";
        if (overlayEls.input) overlayEls.input.disabled = true;
        if (overlayEls.send)  overlayEls.send.disabled = true;
        setTimeout(closeOverlay, 3000);
      });
    };

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "cs-cancel";
    cancelBtn.style.cssText = "flex-shrink:0;padding:10px 12px;border-radius:10px;border:1.5px solid " + T.border + ";background:transparent;color:" + T.textMuted + ";font-weight:500;cursor:pointer;font-size:12px;font-family:" + T.font + ";transition:background 150ms,color 150ms;min-height:40px;white-space:nowrap;";
    cancelBtn.textContent = "No thanks";
    cancelBtn.onclick = function () {
      postOutcome("cancelled").then(function () {
        var el = chatState.cancelEl;
        closeOverlay();
        if (el && el.isConnected) { _bypassNext = true; el.click(); }
      });
    };

    outcomeBar.appendChild(keepBtn);
    outcomeBar.appendChild(cancelBtn);

    // ── Input area ──
    var inputWrap = document.createElement("div");
    inputWrap.style.cssText = "padding:10px 14px 14px;background:" + T.surface + ";flex-shrink:0;";

    var inputRow = document.createElement("div");
    inputRow.style.cssText = "display:flex;align-items:center;gap:6px;background:#fff;border-radius:10px;border:1px solid #e2e8f0;padding:6px 6px 6px 12px;transition:border-color 150ms,box-shadow 150ms;";

    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Message…";
    input.className = "cs-input";
    input.style.cssText = "flex:1;border:none;outline:none;box-shadow:none;-webkit-appearance:none;appearance:none;background:transparent;font-size:13px;font-family:" + T.font + ";color:" + T.text + ";padding:4px 0;min-width:0;";

    input.addEventListener("input", function () {
      send.style.background = input.value.trim() ? T.primary : "#d1d5db";
      send.style.cursor = input.value.trim() ? "pointer" : "default";
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    var send = document.createElement("button");
    send.type = "button";
    send.className = "cs-send";
    send.setAttribute("aria-label", "Send message");
    send.style.cssText = "width:30px;height:30px;border-radius:8px;border:none;background:#d1d5db;color:#fff;cursor:default;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background 150ms,transform 150ms;";
    // Arrow up icon (HugeIcons style)
    send.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

    function sendMessage() {
      var t = (input.value || "").trim();
      if (!t || chatState.busy) return;
      input.value = "";
      send.style.background = "#d1d5db";
      send.style.cursor = "default";
      chatState.messages.push({ role: "user", content: t });
      renderHistory();
      runChatStream();
    }
    send.onclick = sendMessage;

    inputRow.appendChild(input);
    inputRow.appendChild(send);
    inputWrap.appendChild(inputRow);

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(outcomeBar);
    panel.appendChild(inputWrap);
    root.appendChild(panel);
    document.body.appendChild(root);

    setTimeout(function () { if (input) input.focus(); }, 300);

    overlayEls.root       = root;
    overlayEls.messages   = messages;
    overlayEls.input      = input;
    overlayEls.send       = send;
    overlayEls.outcomeBar = outcomeBar;
  }

  // ── Chat streaming ───────────────────────────────────────────────────────────

  function buildOfferLabel(offer) {
    if (!offer || !offer.type) return null;
    if (offer.type === "discount" && offer.discountPct) {
      var months = offer.discountMonths ? " for " + offer.discountMonths + " month" + (offer.discountMonths > 1 ? "s" : "") : "";
      return "Claim " + offer.discountPct + "% off" + months + " — stay subscribed";
    }
    if (offer.type === "pause") return "Pause my subscription — stay subscribed";
    if (offer.type === "extension") return "Claim free extension — stay subscribed";
    if (offer.type === "downgrade") return "Switch to a smaller plan — stay subscribed";
    return null;
  }

  function runChatStream() {
    if (chatState.busy || !chatState.sessionId) return;
    chatState.busy = true;
    if (overlayEls.send) { overlayEls.send.disabled = true; overlayEls.send.style.opacity = "0.5"; }

    showTypingIndicator();
    var assistantBody = null;

    fetch(chatState.base + API_CHAT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snippetKey: chatState.key,
        sessionId: chatState.sessionId,
        messages: chatState.messages,
        locale: (navigator.language || "").slice(0, 20) || undefined,
      }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (t) {
            var msg = res.statusText || "request_failed";
            try { var j = JSON.parse(t); if (j && j.error) msg = j.error; } catch (_) {}
            throw new Error(msg);
          });
        }
        assistantBody = appendMessage("assistant", "");
        var reader = res.body.getReader();
        var dec = new TextDecoder();
        var acc = "";
        function readChunk() {
          return reader.read().then(function (result) {
            if (result.done) {
              chatState.messages.push({ role: "assistant", content: acc });
              // Upgrade plain text to rendered markdown now that streaming is complete
              if (assistantBody) assistantBody.innerHTML = renderMarkdown(acc);
              chatState.busy = false;
              if (overlayEls.send) { overlayEls.send.disabled = false; overlayEls.send.style.opacity = "1"; }
              showOutcomeBar();
              // Fetch pending offer and update keep button label
              if (chatState.sessionId && chatState.key) {
                fetch(chatState.base + "/api/public/cancel-chat/offer?sessionId=" + encodeURIComponent(chatState.sessionId) + "&key=" + encodeURIComponent(chatState.key))
                  .then(function (r) { return r.json(); })
                  .then(function (data) {
                    var offer = data && data.offer;
                    if (!offer || !overlayEls.outcomeBar) return;
                    var keepBtn = overlayEls.outcomeBar.querySelector(".cs-keep");
                    if (!keepBtn) return;
                    var label = buildOfferLabel(offer);
                    if (label) {
                      keepBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' + label;
                    }
                  })
                  .catch(function () { /* non-blocking */ });
              }
              return;
            }
            acc += dec.decode(result.value, { stream: true });
            if (assistantBody) assistantBody.textContent = acc;
            overlayEls.messages.scrollTop = overlayEls.messages.scrollHeight;
            return readChunk();
          });
        }
        return readChunk();
      })
      .catch(function (err) {
        console.error("[ChurnShield] cancel-chat failed", err);
        hideTypingIndicator();
        chatState.busy = false;
        if (overlayEls.send) { overlayEls.send.disabled = false; overlayEls.send.style.opacity = "1"; }
        var errMsg = "Sorry  something went wrong. Please try again.";
        if (assistantBody) assistantBody.textContent = errMsg;
        else appendMessage("assistant", errMsg);
      });
  }

  function openCancelOverlay(base, key, sessionId) {
    if (overlayEls.root) closeOverlay();
    chatState.base = base;
    chatState.key = key;
    chatState.sessionId = sessionId;
    chatState.messages = [{ role: "user", content: "I was about to cancel my subscription." }];
    ensureOverlay();
    renderHistory();
    runChatStream();
  }

  // ── Subscriber status (payment wall / pause wall) ────────────────────────────

  function fetchSubscriberStatus() {
    if (!_key || !identifyState.subscriberId) return;
    fetch(
      _base + API_STATUS +
      "?snippetKey=" + encodeURIComponent(_key) +
      "&subscriberId=" + encodeURIComponent(identifyState.subscriberId)
    )
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        wallState.paymentWallActive = !!data.paymentWallActive;
        wallState.pauseWallActive   = !!data.pauseWallActive;
        if (wallState.paymentWallActive) {
          document.dispatchEvent(new CustomEvent("churnshield:payment-wall-active", {
            detail: { subscriberId: identifyState.subscriberId },
          }));
        }
      })
      .catch(function () {});
  }

  // ── Pause wall ────────────────────────────────────────────────────────────────

  var pauseOverlayEl = null;

  function closePauseOverlay() {
    if (pauseOverlayEl) pauseOverlayEl.remove();
    pauseOverlayEl = null;
  }

  function showPauseOverlay() {
    if (pauseOverlayEl) return;
    if (!_key || !identifyState.subscriberId) {
      console.warn("[ChurnShield] pauseWall() called before identify()");
      return;
    }

    var root = document.createElement("div");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:rgba(15,23,42,0.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,sans-serif;";

    var panel = document.createElement("div");
    panel.style.cssText =
      "background:#fff;border-radius:14px;width:min(420px,calc(100vw - 24px));padding:28px 24px;box-shadow:0 25px 60px rgba(0,0,0,0.35);display:flex;flex-direction:column;gap:16px;";

    var title = document.createElement("div");
    title.style.cssText = "font-size:17px;font-weight:700;color:#0f172a;";
    title.textContent = "Need a break?";

    var body = document.createElement("div");
    body.style.cssText = "font-size:14px;color:#475569;line-height:1.55;";
    body.textContent =
      "Pause your subscription for a month  no charges, no cancellation. Resume anytime from your account.";

    var btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:4px;";

    var pauseBtn = document.createElement("button");
    pauseBtn.type = "button";
    pauseBtn.textContent = "Pause for 1 month";
    pauseBtn.style.cssText =
      "padding:11px 16px;border-radius:9px;border:none;background:#09090b;color:#fff;font-weight:600;cursor:pointer;font-size:14px;";

    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "I still want to cancel";
    cancelBtn.style.cssText =
      "padding:11px 16px;border-radius:9px;border:1px solid #d1d5db;background:#fff;color:#374151;font-weight:500;cursor:pointer;font-size:14px;";

    var status = document.createElement("div");
    status.style.cssText = "font-size:13px;color:#64748b;min-height:20px;text-align:center;";

    pauseBtn.onclick = function () {
      pauseBtn.disabled = true;
      pauseBtn.textContent = "Pausing…";
      status.textContent = "";
      fetch(_base + API_PAUSE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snippetKey:      _key,
          subscriberId:    identifyState.subscriberId,
          subscriptionMrr: identifyState.subscriptionMrr,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok) {
            wallState.pauseWallActive = true;
            body.textContent = "Your subscription is paused. No charges for the next month. See you soon!";
            btnRow.style.display = "none";
            status.textContent = "";
            setTimeout(closePauseOverlay, 3000);
          } else {
            pauseBtn.disabled = false;
            pauseBtn.textContent = "Pause for 1 month";
            status.textContent = "Something went wrong  please try again.";
          }
        })
        .catch(function () {
          pauseBtn.disabled = false;
          pauseBtn.textContent = "Pause for 1 month";
          status.textContent = "Could not reach server  please try again.";
        });
    };

    cancelBtn.onclick = closePauseOverlay;

    btnRow.appendChild(pauseBtn);
    btnRow.appendChild(cancelBtn);
    panel.appendChild(title);
    panel.appendChild(body);
    panel.appendChild(btnRow);
    panel.appendChild(status);
    root.appendChild(panel);
    document.body.appendChild(root);
    pauseOverlayEl = root;
  }

  // ── Bind cancel buttons ──────────────────────────────────────────────────────

  function bindCancelCapture(script) {
    if (identifyState.bound) return;
    identifyState.bound = true;
    var base = apiBase(script);
    var key = publicEmbedId(script);
    var selector = cancelSelector(script);
    _base = base;
    _key  = key;

    document.addEventListener("click", function (ev) {
      // Let through re-fired clicks after confirmed cancellation
      if (_bypassNext) { _bypassNext = false; return; }
      var el = ev.target && ev.target.closest ? ev.target.closest(selector) : null;
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      chatState.cancelEl = el; // store so we can re-fire if subscriber confirms cancel
      // Re-read key each click  avoids race when data-key is set after the bundle loads (e.g. async cs.js).
      var keyNow = publicEmbedId(script);
      var effKey = keyNow || key;
      postCancelIntent(base, effKey)
        .then(function (data) {
          document.dispatchEvent(new CustomEvent("churnshield:cancel-intent", { detail: data }));
          if (data && data.sessionId) openCancelOverlay(base, effKey, data.sessionId);
        })
        .catch(function (err) {
          console.error("[ChurnShield] cancel-intent failed", err);
        });
    }, true);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  window.ChurnShield = window.ChurnShield || {
    setAuthHash: function (hex) {
      var h = hex != null ? String(hex).trim() : "";
      identifyState.authHash = h || null;
    },
    identify: function (opts) {
      opts = opts || {};
      var stripeCus = (opts.stripeCustomerId || opts.stripe_customer_id || "").toString().trim();
      var sub = (opts.subscriberId || opts.subscriber_id || "").toString().trim();
      var emailOpt = (opts.subscriberEmail || opts.email || opts.customerEmail || "").toString().trim();
      var subIdOpt = (opts.subscriptionId || opts.stripeSubscriptionId || opts.subscription_id || "").toString().trim();
      if (subIdOpt && subIdOpt.indexOf("sub_") === 0) {
        identifyState.stripeSubscriptionId = subIdOpt.slice(0, 64);
      } else if (subIdOpt) {
        identifyState.stripeSubscriptionId = null;
        console.warn("[ChurnShield] subscriptionId should be Stripe sub_...; got:", subIdOpt.slice(0, 24));
      } else if (opts.subscriptionId != null || opts.stripeSubscriptionId != null) {
        identifyState.stripeSubscriptionId = null;
      }
      var ah = (opts.authHash || opts.auth_hash || "").toString().trim();
      if (ah) identifyState.authHash = ah;
      if (opts.getAuthHash !== undefined) {
        identifyState.getAuthHashFn = typeof opts.getAuthHash === "function" ? opts.getAuthHash : null;
      }
      if (opts.authHashUrl !== undefined) {
        identifyState.authHashUrl = opts.authHashUrl ? String(opts.authHashUrl).trim() : null;
      }
      if (emailOpt) {
        identifyState.subscriberEmail = emailOpt.slice(0, 320);
      }
      if (stripeCus) {
        identifyState.subscriberId = stripeCus;
        identifyState.stripeCustomerId = stripeCus;
      } else if (sub) {
        identifyState.subscriberId = sub;
        identifyState.stripeCustomerId = null;
        if (sub.indexOf("@") >= 0) {
          console.warn(
            "[ChurnShield] subscriberId looks like an email. Stripe APIs need the Customer id (cus_...). " +
              "Pass subscriberEmail for dashboard display and subscriberId: subscription.customer (cus_...)."
          );
        } else if (sub.indexOf("cus_") !== 0) {
          console.warn(
            "[ChurnShield] subscriberId should be a Stripe Customer id (cus_...). Got: " + sub.slice(0, 20)
          );
        }
      }
      if (opts.subscriptionMrr != null) identifyState.subscriptionMrr = Number(opts.subscriptionMrr) || 0;
      fetchSubscriberStatus();
    },
    pauseWall: function () {
      showPauseOverlay();
    },
    isPaymentWallActive: function () {
      return wallState.paymentWallActive;
    },
  };

  var sc = currentScript();
  // Dynamically injected scripts have no currentScript  find our tag.
  if (!sc) {
    sc =
      document.querySelector('script[src*="cs.js"][data-app-id]') ||
      document.querySelector('script[src*="cs.js"][data-key]') ||
      document.querySelector('script[src*="cs.js"]') ||
      document.getElementById("cs-script");
  }
  if (sc) bindCancelCapture(sc);
})();
