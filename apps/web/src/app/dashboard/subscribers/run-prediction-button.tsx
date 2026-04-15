"use client";

import { useState, useTransition } from "react";
import { runChurnPrediction } from "./actions";

export function RunPredictionButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; total_scored?: number; error?: string } | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const r = await runChurnPrediction();
      setResult(r);
    });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {result && (
        <span style={{ fontSize: 12, color: result.ok ? "#166534" : "#991b1b" }}>
          {result.ok ? `Scored ${result.total_scored} subscriber${result.total_scored === 1 ? "" : "s"}` : result.error}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={isPending}
        style={{
          padding: "7px 16px",
          background: isPending ? "#94a3b8" : "#0f172a",
          color: "#fff",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          border: "none",
          cursor: isPending ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
          lineHeight: 1.5,
        }}
      >
        {isPending ? "Scoring…" : "Run Prediction"}
      </button>
    </div>
  );
}
