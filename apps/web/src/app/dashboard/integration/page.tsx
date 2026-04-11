import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { generateEmbedAppId, generateEmbedHmacSecret } from "@/lib/tenant-embed";
import { EmbedSigningControls } from "@/app/dashboard/settings/embed-signing-controls";
import { CopyButton } from "./copy-button";

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div>
      {label && (
        <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </div>
      )}
      <div style={{ position: "relative" }}>
        <pre style={{
          background: "#0f172a",
          color: "#e2e8f0",
          borderRadius: 8,
          padding: "14px 44px 14px 16px",
          fontSize: 12,
          fontFamily: "monospace",
          overflowX: "auto",
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          lineHeight: 1.65,
        }}>
          {code}
        </pre>
        <CopyButton text={code} />
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 20, marginBottom: 0 }}>
      {/* Timeline spine */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "#7C3AED", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {n}
        </div>
        {n < 4 && <div style={{ width: 2, flex: 1, background: "#e2e8f0", marginTop: 6 }} />}
      </div>
      {/* Content */}
      <div style={{ flex: 1, paddingBottom: n < 4 ? 32 : 0 }}>
        <h2 style={{ margin: "4px 0 12px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "9px 13px", fontSize: 12, color: "#1e40af", marginTop: 10, lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function Desc({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b", lineHeight: 1.65 }}>{children}</p>;
}

export default async function IntegrationPage() {
  const { userId, orgId } = auth();
  if (!userId) redirect("/sign-in");

  let tenant = orgId
    ? await prisma.tenant.findUnique({ where: { clerkOrgId: orgId } })
    : await prisma.tenant.findUnique({ where: { clerkUserId: userId } });

  if (!tenant) redirect("/dashboard");

  const appIdOk = Boolean(tenant.embedAppId?.trim());
  const secretOk = Boolean(tenant.embedHmacSecret?.trim());
  if (!appIdOk || !secretOk) {
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        embedAppId: appIdOk ? tenant.embedAppId! : generateEmbedAppId(),
        embedHmacSecret: secretOk ? tenant.embedHmacSecret! : generateEmbedHmacSecret(),
      },
    });
  }

  const appId      = tenant.embedAppId  ?? "";
  const snippetKey = tenant.snippetKey  ?? "";

  const scriptTag    = `<script\n  src="https://cdn.ChurnQ.dev/cs.js"\n  data-app-id="${appId}"\n  data-key="${snippetKey}"\n  defer\n></script>`;
  const nextjsScript = `import Script from "next/script";\n\n<Script\n  src="https://cdn.ChurnQ.dev/cs.js"\n  data-app-id="${appId}"\n  data-key="${snippetKey}"\n  strategy="afterInteractive"\n/>`;
  const identifyCode = `window.ChurnQ.identify({\n  subscriberId: subscription.customer,   // Stripe cus_...\n  subscriptionId: subscription.id,       // Stripe sub_...\n  subscriberEmail: user.email,\n  subscriptionMrr: plan.price,           // number, in dollars\n  planName: plan.name,                   // optional; same labels as Settings → downgrade plans\n  getAuthHash: async (cus) => {\n    const r = await fetch("/api/ChurnQ-auth", {\n      method: "POST",\n      headers: { "Content-Type": "application/json" },\n      body: JSON.stringify({ subscriberId: cus }),\n    });\n    return (await r.json()).authHash;\n  },\n});`;
  const nextjsAuth   = `// app/api/ChurnQ-auth/route.ts\nimport crypto from "crypto";\nimport { NextResponse } from "next/server";\n\nexport async function POST(req: Request) {\n  const secret = process.env.ChurnQ_EMBED_SECRET;\n  if (!secret) return NextResponse.json({ error: "misconfigured" }, { status: 500 });\n  const { subscriberId } = await req.json();\n  const cus = typeof subscriberId === "string" ? subscriberId.trim() : "";\n  if (!cus.startsWith("cus_"))\n    return NextResponse.json({ error: "invalid" }, { status: 400 });\n  // TODO: verify cus belongs to the signed-in user\n  const authHash = crypto.createHmac("sha256", secret).update(cus).digest("hex");\n  return NextResponse.json({ authHash });\n}`;
  const expressAuth  = `const crypto = require("crypto");\n\napp.post("/api/ChurnQ-auth", (req, res) => {\n  const secret = process.env.ChurnQ_EMBED_SECRET;\n  const { subscriberId } = req.body;\n  // TODO: verify subscriberId belongs to req.user\n  const authHash = crypto\n    .createHmac("sha256", secret)\n    .update(subscriberId)\n    .digest("hex");\n  res.json({ authHash });\n});`;
  const pythonAuth   = `import hmac, hashlib, os\n\n@router.post("/api/ChurnQ-auth")\nasync def ChurnQ_auth(body: dict):\n    secret = os.environ["ChurnQ_EMBED_SECRET"].encode()\n    subscriber_id = body.get("subscriberId", "").strip()\n    # TODO: verify subscriber_id belongs to current user\n    auth_hash = hmac.new(secret, subscriber_id.encode(), hashlib.sha256).hexdigest()\n    return {"authHash": auth_hash}`;
  const cancelCode   = `<button data-ChurnQ-cancel>\n  Cancel subscription\n</button>`;

  return (
    <div style={{ width: "100%" }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: "#0f172a" }}>Integration</h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
          Add ChurnQ to your app in 4 steps.
        </p>
      </div>

      {/* Unsecured banner */}
      {!tenant.embedSecretActivated && (
        <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "11px 16px", marginBottom: 24, fontSize: 13, color: "#92400e", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }}>⚠</span>
          <div>
            <strong>Your embed is unsecured.</strong> Complete Step 3 and click <strong>Rotate embed secret</strong> to lock it down.
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 32, alignItems: "start" }}>

        {/* LEFT  steps */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "32px 32px 32px" }}>

          <Step n={1} title="Add the script tag">
            <Desc>
              Paste this into the <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>&lt;head&gt;</code> of every page where your subscribers are logged in.
            </Desc>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <CodeBlock code={scriptTag} label="HTML / all frameworks" />
              <CodeBlock code={nextjsScript} label="Next.js App Router" />
            </div>
            <Note>
              Use <code>strategy="afterInteractive"</code> in Next.js App Router so <code>data-app-id</code> is set before the script runs. A plain <code>defer</code> works everywhere else.
            </Note>
          </Step>

          <Step n={2} title="Identify the subscriber after login">
            <Desc>
              Call <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>window.ChurnQ.identify()</code> once the user is logged in and their subscription is available. <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>getAuthHash</code> fires automatically when they click cancel  you do not need to call it yourself.
            </Desc>
            <CodeBlock code={identifyCode} />
            <Note>
              <strong>subscriptionId</strong> (sub_...) is optional but recommended  ChurnQ targets the exact subscription when applying offers, which matters if a customer has more than one.
            </Note>
          </Step>

          <Step n={3} title="Create a server-side signing endpoint">
            <Desc>
              Every cancel request must include a hash signed by <em>your</em> server. This stops anyone from faking sessions. First, generate your secret below  then add it to your server and create the endpoint.
            </Desc>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px", marginBottom: 16 }}>
              <EmbedSigningControls embedAppId={appId} snippetKey={snippetKey} activated={tenant.embedSecretActivated} />
            </div>
            <Desc>
              After rotating, set <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>ChurnQ_EMBED_SECRET</code> on your server, then add this endpoint:
            </Desc>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <CodeBlock code={nextjsAuth} label="Next.js App Router" />
              <CodeBlock code={expressAuth} label="Express / Node.js" />
              <CodeBlock code={pythonAuth} label="Python (FastAPI)" />
            </div>
            <Note>
              <strong>Security:</strong> Always verify <code>subscriberId</code> belongs to the currently signed-in user before signing  otherwise a user could request a hash for someone else&apos;s account.
            </Note>
          </Step>

          <Step n={4} title="Mark your cancel button">
            <Desc>
              ChurnQ intercepts clicks on elements with the <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>data-ChurnQ-cancel</code> attribute. Add it to your cancel button.
            </Desc>
            <CodeBlock code={cancelCode} />
            <Note>
              Using a different selector? Pass <code>data-cancel-selector="#my-btn"</code> on the script tag to override the default.
            </Note>
          </Step>

        </div>

        {/* RIGHT  sticky sidebar */}
        <div style={{ position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Embed keys */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Your embed keys
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "App ID", value: appId },
                { label: "Snippet key", value: snippetKey },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginBottom: 4 }}>{label}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <code style={{
                      flex: 1, display: "block", fontSize: 11,
                      background: "#f8fafc", border: "1px solid #e2e8f0",
                      borderRadius: 6, padding: "7px 10px",
                      color: "#0f172a", wordBreak: "break-all", lineHeight: 1.5,
                    }}>
                      {value || ""}
                    </code>
                    <CopyButton text={value || ""} variant="inline" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Security status */}
          <div style={{ background: "#fff", border: `1px solid ${tenant.embedSecretActivated ? "#86efac" : "#fcd34d"}`, borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: tenant.embedSecretActivated ? "#22c55e" : "#f59e0b",
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                {tenant.embedSecretActivated ? "Embed secured" : "Embed unsecured"}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
              {tenant.embedSecretActivated
                ? "HMAC signing is active. Only signed requests from your server are accepted."
                : "Complete Step 3 to require signed requests. Until then, anyone with your snippet key can call the API."}
            </p>
          </div>

          {/* Verify checklist */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Verify it works
            </div>
            <ol style={{ margin: 0, padding: "0 0 0 16px", fontSize: 12, color: "#475569", lineHeight: 1.9 }}>
              <li>Log in as a subscriber in your app.</li>
              <li>Click the cancel button  overlay should appear.</li>
              <li>Check <a href="/dashboard" style={{ color: "#7C3AED", textDecoration: "none", fontWeight: 500 }}>Overview</a>  session shows within seconds.</li>
              <li>Security status above turns green after Step 3.</li>
            </ol>
          </div>

          {/* Troubleshooting */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Troubleshooting
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { err: "Overlay missing", fix: "Check console. Ensure identify() runs before cancel click. Use defer not async." },
                { err: "unknown_embed_key", fix: "Check data-app-id and data-key match the keys above exactly." },
                { err: "auth_hash_required", fix: "getAuthHash is not returning. Check your signing endpoint is deployed and secret is set." },
                { err: "invalid_auth_hash", fix: "Rotate the secret, copy the new value, update ChurnQ_EMBED_SECRET on your server." },
                { err: "No sessions in dashboard", fix: "Pass subscriptionMrr as a number (e.g. 49), not a string." },
              ].map(({ err, fix }) => (
                <div key={err} style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: 10 }}>
                  <code style={{ fontSize: 11, background: "#fef2f2", color: "#dc2626", padding: "1px 5px", borderRadius: 4 }}>{err}</code>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b", lineHeight: 1.5 }}>{fix}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
