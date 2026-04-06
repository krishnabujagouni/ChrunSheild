/**
 * Slack incoming webhook helper.
 * Uses Block Kit for readable alerts in any Slack channel.
 */

async function postToSlack(webhookUrl: string, body: object): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Non-blocking — never let Slack errors fail the main request
  }
}

export async function sendSlackSaveAlert(opts: {
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

  await postToSlack(webhookUrl, {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:white_check_mark: *Subscriber retained*`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Customer*\n${customer}` },
          { type: "mrkdwn", text: `*Offer*\n${offerLabel}` },
          { type: "mrkdwn", text: `*MRR saved*\n$${mrrSaved.toFixed(2)}/mo` },
        ],
      },
      { type: "divider" },
    ],
  });
}

export async function sendSlackHighRiskAlert(opts: {
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

  await postToSlack(webhookUrl, {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:warning: *High-risk subscriber detected*`,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Customer*\n${customer}` },
          { type: "mrkdwn", text: `*Risk score*\n${scorePct}% (high)` },
          { type: "mrkdwn", text: `*Cancel attempts*\n${cancelAttempts}` },
          { type: "mrkdwn", text: `*Failed payments*\n${failedPayments}` },
          { type: "mrkdwn", text: `*Days inactive*\n${Math.round(daysInactive)}d` },
        ],
      },
      { type: "divider" },
    ],
  });
}
