/**
 * Discord incoming webhook helper.
 * Uses embeds for readable alerts in any Discord channel.
 */

async function postToDiscord(webhookUrl: string, body: object): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Non-blocking — never let Discord errors fail the main request
  }
}

export async function sendDiscordSaveAlert(opts: {
  webhookUrl: string;
  subscriberId: string;
  subscriberEmail?: string | null;
  offerType: string;
  discountPct?: number | null;
  mrrSaved: number;
  tenantName: string;
}): Promise<void> {
  const { webhookUrl, subscriberId, subscriberEmail, offerType, discountPct, mrrSaved } = opts;
  const customer = subscriberEmail ?? subscriberId;

  const offerLabel =
    offerType === "discount" && discountPct
      ? `${discountPct}% discount`
      : offerType === "pause"
      ? "Subscription pause"
      : offerType === "extension"
      ? "Free extension"
      : offerType === "downgrade"
      ? "Plan downgrade"
      : "Empathy (no offer needed)";

  await postToDiscord(webhookUrl, {
    embeds: [
      {
        title: `✅ Subscriber retained`,
        color: 0x22c55e, // green
        fields: [
          { name: "Customer", value: customer, inline: true },
          { name: "Offer", value: offerLabel, inline: true },
          { name: "MRR saved", value: `$${mrrSaved.toFixed(2)}/mo`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function sendDiscordHighRiskAlert(opts: {
  webhookUrl: string;
  subscriberId: string;
  subscriberEmail?: string | null;
  riskScore: number;
  cancelAttempts: number;
  failedPayments: number;
  daysInactive: number;
  tenantName: string;
}): Promise<void> {
  const { webhookUrl, subscriberId, subscriberEmail, riskScore, cancelAttempts, failedPayments, daysInactive } = opts;
  const customer = subscriberEmail ?? subscriberId;
  const scorePct = Math.round(riskScore * 100);

  await postToDiscord(webhookUrl, {
    embeds: [
      {
        title: `⚠️ High-risk subscriber detected`,
        color: 0xf59e0b, // amber
        fields: [
          { name: "Customer", value: customer, inline: true },
          { name: "Risk score", value: `${scorePct}% (high)`, inline: true },
          { name: "Cancel attempts", value: String(cancelAttempts), inline: true },
          { name: "Failed payments", value: String(failedPayments), inline: true },
          { name: "Days inactive", value: `${Math.round(daysInactive)}d`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
