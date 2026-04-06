import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { embedVoyageQuery } from "@/lib/voyage-embed";

export type DigestForAnalyst = {
  id: string;
  digestText: string;
  periodDays: number;
  transcriptCount: number;
  clusters: Prisma.JsonValue;
  createdAt: Date;
};

type FeedbackDigestRow = {
  id: string;
  digest_text: string;
  period_days: number;
  transcript_count: number;
  clusters: Prisma.JsonValue;
  created_at: Date;
};

function scoreDigestKeyword(digestText: string, clusters: Prisma.JsonValue, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return 0;
  const haystack = [digestText, JSON.stringify(clusters ?? "")].join(" ").toLowerCase();
  const hits = words.filter(w => haystack.includes(w)).length;
  return hits / words.length;
}

function rowToDigest(r: FeedbackDigestRow): DigestForAnalyst {
  return {
    id: r.id,
    digestText: r.digest_text,
    periodDays: r.period_days,
    transcriptCount: r.transcript_count,
    clusters: r.clusters,
    createdAt: r.created_at,
  };
}

/** Safe SQL literal for pgvector: embedding values are finite floats only. */
function vectorSqlLiteral(embedding: number[]): Prisma.Sql {
  for (const n of embedding) {
    if (!Number.isFinite(n)) {
      throw new Error("invalid embedding value");
    }
  }
  const inner = embedding.join(",");
  return Prisma.raw(`'[${inner}]'::vector`);
}

/**
 * Nearest digests by cosine distance (<=>). Requires pgvector + populated `embedding` column.
 */
async function fetchSemanticDigestRows(
  tenantId: string,
  queryEmbedding: number[],
  limit: number,
  traceId: string,
): Promise<FeedbackDigestRow[]> {
  console.log(`[feedback-search ${traceId}] [digest-retrieval] step=5 pgvector query start`, {
    tenantShort: tenantId.slice(0, 8),
    embeddingDims: queryEmbedding.length,
    limit,
  });
  const t0 = Date.now();
  const vec = vectorSqlLiteral(queryEmbedding);
  const rows = await prisma.$queryRaw<FeedbackDigestRow[]>`
    SELECT id, digest_text, period_days, transcript_count, clusters, created_at
    FROM feedback_digests
    WHERE tenant_id = ${tenantId}::uuid
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vec}
    LIMIT ${limit}
  `;
  console.log(`[feedback-search ${traceId}] [digest-retrieval] step=5 pgvector query OK`, {
    ms: Date.now() - t0,
    rowCount: rows.length,
    idsPreview: rows.slice(0, 5).map((r) => r.id.slice(0, 8)),
  });
  return rows;
}

/**
 * Hybrid: pgvector similarity when VOYAGE_API_KEY + embeddings exist; keyword match fills remaining slots.
 */
export async function selectDigestsForAnalyst(
  tenantId: string,
  query: string,
  traceId = "--------",
): Promise<DigestForAnalyst[]> {
  console.log(`[feedback-search ${traceId}] [digest-retrieval] step=1 load digests (Prisma findMany, take 90)`, {
    tenantShort: tenantId.slice(0, 8),
    queryCharCount: query.length,
  });

  const allDigests = await prisma.feedbackDigest.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 90,
  });

  console.log(`[feedback-search ${traceId}] [digest-retrieval] step=2 loaded`, {
    totalDigests: allDigests.length,
  });

  const apiKey = process.env.VOYAGE_API_KEY?.trim() ?? "";
  console.log(`[feedback-search ${traceId}] [digest-retrieval] step=3 VOYAGE_API_KEY`, {
    present: Boolean(apiKey),
  });

  let semanticRows: FeedbackDigestRow[] = [];

  if (apiKey) {
    const embedding = await embedVoyageQuery(query, apiKey, traceId);
    if (embedding?.length) {
      try {
        semanticRows = await fetchSemanticDigestRows(tenantId, embedding, 12, traceId);
      } catch (e) {
        console.warn(`[feedback-search ${traceId}] [digest-retrieval] step=5 FAIL pgvector/SQL`, e);
      }
    } else {
      console.log(`[feedback-search ${traceId}] [digest-retrieval] step=4 skip semantic  no query embedding`);
    }
  } else {
    console.log(`[feedback-search ${traceId}] [digest-retrieval] step=3 skip Voyage  keyword path only`);
  }

  const seen = new Set<string>();
  const out: DigestForAnalyst[] = [];

  for (const row of semanticRows) {
    if (out.length >= 3) break;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(rowToDigest(row));
  }

  console.log(`[feedback-search ${traceId}] [digest-retrieval] step=6 after semantic cap(3)`, {
    pickedFromSemantic: out.length,
    digestIds: out.map((d) => d.id.slice(0, 8)),
  });

  if (out.length >= 3) {
    console.log(`[feedback-search ${traceId}] [digest-retrieval] step=7 done mode=semantic_only`, {
      finalCount: out.length,
    });
    return out;
  }

  console.log(`[feedback-search ${traceId}] [digest-retrieval] step=7 keyword fill start`, {
    need: 3 - out.length,
  });

  const scored = allDigests
    .filter((d) => !seen.has(d.id))
    .map((d) => ({ d, score: scoreDigestKeyword(d.digestText, d.clusters, query) }))
    .sort((a, b) => b.score - a.score);

  const keywordPool =
    scored.filter((x) => x.score > 0).length > 0 ? scored.filter((x) => x.score > 0) : scored;

  const topScores = keywordPool.slice(0, 5).map((x) => ({
    idShort: x.d.id.slice(0, 8),
    score: Math.round(x.score * 1000) / 1000,
  }));
  console.log(`[feedback-search ${traceId}] [digest-retrieval] step=7 keyword candidates (top 5)`, {
    usedPositiveScoresOnly: scored.some((x) => x.score > 0),
    topScores,
  });

  for (const { d } of keywordPool) {
    if (out.length >= 3) break;
    seen.add(d.id);
    out.push({
      id: d.id,
      digestText: d.digestText,
      periodDays: d.periodDays,
      transcriptCount: d.transcriptCount,
      clusters: d.clusters,
      createdAt: d.createdAt,
    });
  }

  const semanticIdSet = new Set(semanticRows.map((r) => r.id));
  const countFromSemantic = out.filter((d) => semanticIdSet.has(d.id)).length;
  const mode =
    countFromSemantic === 0 ? "keyword_only" : countFromSemantic === out.length ? "semantic_only" : "hybrid";

  console.log(`[feedback-search ${traceId}] [digest-retrieval] step=8 done`, {
    mode,
    finalCount: out.length,
    countFromSemantic,
    digestIds: out.map((d) => d.id.slice(0, 8)),
  });

  return out;
}
