# ChurnQ Integration Guide

Add ChurnQ to your app in 4 steps. Total time: ~15 minutes.

---

## Before you start

Log in to your ChurnQ dashboard and go to **Settings → Embed Snippet**. You will need:

- **App ID**  looks like `cs_app_xxxxxxxxxxxxxxxxxx`
- **Snippet key**  looks like `cs_live_xxxxxxxxxxxxxxxxxx`
- **Embed secret**  click **Rotate embed secret** to generate one. Copy it immediately  it is only shown once.

---

## Step 1  Add the script tag

Paste this into the `<head>` of every page where your subscribers are logged in.

```html
<script
  src="https://cdn.ChurnQ.dev/cs.js"
  data-app-id="cs_app_YOUR_APP_ID"
  data-key="cs_live_YOUR_SNIPPET_KEY"
  defer
></script>
```

> **Next.js App Router:** use `next/script` with `strategy="afterInteractive"` instead of a plain `<script>` tag so attributes are set before the script runs.

```tsx
import Script from "next/script";

<Script
  src="https://cdn.ChurnQ.dev/cs.js"
  data-app-id="cs_app_YOUR_APP_ID"
  data-key="cs_live_YOUR_SNIPPET_KEY"
  strategy="afterInteractive"
/>
```

---

## Step 2  Create a server-side signing endpoint

ChurnQ requires every cancel request to include a signed hash from **your** server. This prevents anyone from faking cancel sessions.

Store your embed secret as an environment variable on your server:

```
ChurnQ_EMBED_SECRET=your_secret_here
```

Then create a POST route that returns the hash. Examples below.

### Next.js App Router
```ts
// app/api/ChurnQ-auth/route.ts
import crypto from "crypto";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const secret = process.env.ChurnQ_EMBED_SECRET;
  if (!secret) return NextResponse.json({ error: "misconfigured" }, { status: 500 });

  const { subscriberId } = await req.json();
  const cus = typeof subscriberId === "string" ? subscriberId.trim() : "";

  // Only allow Stripe customer IDs  ensure it belongs to the signed-in user
  if (!cus.startsWith("cus_")) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // TODO: verify cus matches the currently signed-in user before signing
  const authHash = crypto.createHmac("sha256", secret).update(cus).digest("hex");
  return NextResponse.json({ authHash });
}
```

### Express / Node.js
```js
const crypto = require("crypto");

app.post("/api/ChurnQ-auth", (req, res) => {
  const secret = process.env.ChurnQ_EMBED_SECRET;
  const { subscriberId } = req.body;

  // TODO: verify subscriberId belongs to req.user
  const authHash = crypto
    .createHmac("sha256", secret)
    .update(subscriberId)
    .digest("hex");

  res.json({ authHash });
});
```

### Python (FastAPI)
```python
import hmac, hashlib, os
from fastapi import APIRouter
router = APIRouter()

@router.post("/api/ChurnQ-auth")
async def ChurnQ_auth(body: dict):
    secret = os.environ["ChurnQ_EMBED_SECRET"].encode()
    subscriber_id = body.get("subscriberId", "").strip()

    # TODO: verify subscriber_id belongs to the current user
    auth_hash = hmac.new(secret, subscriber_id.encode(), hashlib.sha256).hexdigest()
    return {"authHash": auth_hash}
```

> **Security note:** Always verify the `subscriberId` belongs to the currently signed-in user before signing. Otherwise a user could request a hash for someone else's customer ID.

---

## Step 3  Identify the subscriber

Call `window.ChurnQ.identify()` after your user logs in and their subscription data is available.

```js
window.ChurnQ.identify({
  subscriberId: subscription.customer,      // Stripe customer ID (cus_...)
  subscriptionId: subscription.id,          // Stripe subscription ID (sub_...)  optional but recommended
  subscriberEmail: user.email,              // shown in your ChurnQ dashboard
  subscriptionMrr: plan.price,             // monthly value in dollars, e.g. 49
  getAuthHash: async (cus) => {
    const r = await fetch("/api/ChurnQ-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriberId: cus }),
    });
    return (await r.json()).authHash;
  },
});
```

`getAuthHash` is called automatically when a subscriber clicks cancel. It fetches the signed hash from your server in the background  you do not need to call it yourself.

---

## Step 4  Mark your cancel button (optional)

By default ChurnQ intercepts any click on elements matching:

```
[data-ChurnQ-cancel], [data-ChurnQ-cancel="true"]
```

Add the attribute to your cancel button:

```html
<button data-ChurnQ-cancel>Cancel subscription</button>
```

If your cancel button uses a different selector, pass it via `data-cancel-selector` on the script tag:

```html
<script
  src="https://cdn.ChurnQ.dev/cs.js"
  data-app-id="cs_app_YOUR_APP_ID"
  data-key="cs_live_YOUR_SNIPPET_KEY"
  data-cancel-selector="#cancel-btn, .cancel-link"
  defer
></script>
```

---

## Verify it works

1. Open your app, log in as a subscriber.
2. Click the cancel button  a **"Before you go"** chat overlay should appear.
3. In your ChurnQ dashboard → **Overview**, you should see the session appear within a few seconds.
4. Check **Settings**  the "Unsecured" badge should now show **Secured** (green) after you rotated your secret in Step 2.

---

## Optional  Pause wall and payment wall

### Pause wall
Show a pause modal instead of letting the subscriber cancel immediately:

```js
// Call this instead of showing your normal cancel UI
window.ChurnQ.pauseWall();
```

### Payment wall
Check if a subscriber's payment has failed and block access accordingly:

```js
const blocked = window.ChurnQ.isPaymentWallActive();
if (blocked) {
  // redirect to billing update page
}

// Or listen for the event
window.addEventListener("ChurnQ:payment-wall-active", () => {
  // show payment update prompt
});
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Overlay does not appear | Check DevTools console for errors. Make sure `identify()` is called before the subscriber clicks cancel. Use `defer` (not `async`) on the script tag. |
| `unknown_embed_key` error | Double-check `data-app-id` and `data-key` match what is shown in your dashboard. |
| `auth_hash_required` error | Your `getAuthHash` function is not returning a hash. Check your signing endpoint is deployed and `ChurnQ_EMBED_SECRET` is set. |
| `invalid_auth_hash` error | The secret used to sign does not match the one in ChurnQ. Rotate the secret in Settings, copy the new value, update `ChurnQ_EMBED_SECRET` on your server. |
| Sessions not appearing in dashboard | Confirm `subscriptionMrr` is passed as a number (dollars), not a string. |
