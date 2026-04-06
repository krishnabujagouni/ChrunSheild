/**
 * Voyage AI embeddings  matches apps/agents feedback_analyser (voyage-3-lite, 512 dims).
 * Uses input_type "query" for retrieval; digests were stored with input_type "document".
 */

const VOYAGE_EMBED_URL = "https://api.voyageai.com/v1/embeddings";

type VoyageEmbedResponse = {
  data?: Array<{ embedding?: number[] }>;
  detail?: string;
};

const log = (traceId: string, msg: string, extra?: Record<string, unknown>) => {
  const base = `[feedback-search ${traceId}] [voyage-embed] ${msg}`;
  if (extra && Object.keys(extra).length > 0) {
    console.log(base, extra);
  } else {
    console.log(base);
  }
};

export async function embedVoyageQuery(
  text: string,
  apiKey: string,
  traceId = "--------",
): Promise<number[] | null> {
  const trimmed = text.trim().slice(0, 8000);
  log(traceId, "step=1 enter", { queryCharCount: trimmed.length });
  if (!trimmed) {
    log(traceId, "step=1 abort empty query after trim");
    return null;
  }

  try {
    log(traceId, "step=2 POST https://api.voyageai.com/v1/embeddings", {
      model: "voyage-3-lite",
      input_type: "query",
    });
    const t0 = Date.now();
    const res = await fetch(VOYAGE_EMBED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: [trimmed],
        model: "voyage-3-lite",
        input_type: "query",
      }),
    });
    const ms = Date.now() - t0;
    log(traceId, "step=3 HTTP response", { status: res.status, ms });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`[feedback-search ${traceId}] [voyage-embed] step=3 FAIL`, {
        status: res.status,
        bodyPreview: errBody.slice(0, 300),
      });
      return null;
    }

    const data = (await res.json()) as VoyageEmbedResponse;
    const emb = data.data?.[0]?.embedding;
    if (!Array.isArray(emb) || emb.length === 0) {
      console.warn(`[feedback-search ${traceId}] [voyage-embed] step=4 FAIL empty embedding`, {
        detail: data.detail,
      });
      return null;
    }
    log(traceId, "step=4 OK", { dimensions: emb.length });
    return emb;
  } catch (e) {
    console.warn(`[feedback-search ${traceId}] [voyage-embed] step=2-4 FAIL network/parse`, e);
    return null;
  }
}
