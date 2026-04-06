"use client";

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

type DailyPoint = { date: string; saved: number; cancelled: number; mrr: number };
type RiskPoint = { class: string; count: number };

const PURPLE   = "#9152EE";
const TEAL     = "#40E5D1";
const BLUE     = "#4C86FF";
const RED      = "#E84045";
const AMBER    = "#f59e0b";
const GREEN    = "#22c55e";
const GRID     = "rgba(126,126,143,0.18)";
const TICK     = "#9A9AAF";

const tooltipStyle = {
  backgroundColor: "#1a1a2e",
  border: "1px solid rgba(145,82,238,0.3)",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2e8f0",
};

function EmptyState({ label }: { label?: string }) {
  return (
    <div style={{
      height: 180,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#9A9AAF",
      fontSize: 13,
    }}>
      {label ?? "No data yet  sessions will appear here once subscribers use your cancel flow."}
    </div>
  );
}

export function SaveRateChart({ data }: { data: DailyPoint[] }) {
  if (!data.length) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="savedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={PURPLE} stopOpacity={0.4} />
            <stop offset="95%" stopColor={PURPLE} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="cancelGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={RED} stopOpacity={0.25} />
            <stop offset="95%" stopColor={RED} stopOpacity={0} />
          </linearGradient>
          <filter id="glowPurple">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: TICK }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: TICK }} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => [Number(v ?? 0), String(name) === "saved" ? "Saved" : "Cancelled"]}
        />
        <Area
          type="monotone" dataKey="saved"
          stroke={PURPLE} strokeWidth={2}
          fill="url(#savedGrad)" dot={false}
          style={{ filter: "drop-shadow(0 0 6px rgba(145,82,238,0.7))" }}
        />
        <Area
          type="monotone" dataKey="cancelled"
          stroke={RED} strokeWidth={2}
          fill="url(#cancelGrad)" dot={false}
          strokeDasharray="4 2"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MrrSavedChart({ data }: { data: DailyPoint[] }) {
  if (!data.length) return <EmptyState label="No data yet." />;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={PURPLE} stopOpacity={1} />
            <stop offset="100%" stopColor={TEAL}   stopOpacity={0.8} />
          </linearGradient>
          <filter id="barGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: TICK }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: TICK }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [`$${Number(v ?? 0).toFixed(2)}`, "MRR Saved"]}
        />
        <Bar
          dataKey="mrr" fill="url(#barGrad)"
          radius={[4, 4, 0, 0]}
          style={{ filter: "drop-shadow(0 0 8px rgba(145,82,238,0.6))" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RiskChart({ data }: { data: RiskPoint[] }) {
  const colors: Record<string, string> = { high: RED, medium: AMBER, low: GREEN };
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: TICK }} tickLine={false} axisLine={false} />
        <YAxis
          type="category" dataKey="class"
          tick={{ fontSize: 12, fill: TICK, fontWeight: 600 }}
          tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
          tickLine={false} axisLine={false} width={55}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v) => [Number(v ?? 0), "Subscribers"]}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.class}
              fill={colors[entry.class] ?? BLUE}
              style={{ filter: `drop-shadow(0 0 6px ${colors[entry.class] ?? BLUE}99)` }}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
