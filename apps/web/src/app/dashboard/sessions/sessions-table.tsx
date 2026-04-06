"use client";

import { useMemo, useState } from "react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  getPaginationRowModel, type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import {
  DataGrid, DataGridContainer, DataGridTable,
  DataGridColumnHeader,
} from "@/components/ui/data-grid-table";
import SlidingPagination from "@/components/ui/sliding-pagination";
import { Skeleton } from "@/components/ui/skeleton";

export type SessionRow = {
  sessionId: string;
  subscriberId: string;
  subscriberEmail: string | null;
  subscriptionMrr: number;
  offerAccepted: boolean;
  offerType: string | null;
  offerMade: string | null;
  savedValue: number | null;
  createdAt: string;
};

const OFFER_TYPES = ["All", "discount", "pause", "extension", "downgrade", "empathy"] as const;

function OutcomeBadge({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
      {ok ? "Saved" : "Cancelled"}
    </span>
  );
}

const OFFER_COLORS: Record<string, { bg: string; text: string }> = {
  discount:  { bg: "bg-zinc-100",   text: "text-zinc-900" },
  pause:     { bg: "bg-sky-100",    text: "text-sky-700" },
  extension: { bg: "bg-yellow-100", text: "text-yellow-800" },
  downgrade: { bg: "bg-pink-100",   text: "text-pink-800" },
  empathy:   { bg: "bg-green-50",   text: "text-green-800" },
};

function OfferPill({ type }: { type: string | null }) {
  if (!type) return <span className="text-muted-foreground"></span>;
  const c = OFFER_COLORS[type] ?? { bg: "bg-slate-100", text: "text-slate-600" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

function exportSessionsCSV(rows: SessionRow[]) {
  const headers = ["Date", "Email", "Subscriber ID", "MRR", "Outcome", "Offer Type", "Offer Made", "Value Saved"];
  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((s) =>
      [new Date(s.createdAt).toISOString().slice(0, 10), s.subscriberEmail, s.subscriberId,
        s.subscriptionMrr.toFixed(2), s.offerAccepted ? "saved" : "cancelled",
        s.offerType, s.offerMade, s.offerAccepted ? (s.savedValue ?? 0).toFixed(2) : ""].map(escape).join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `churnshield-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const columns: ColumnDef<SessionRow>[] = [
  {
    accessorKey: "subscriberEmail",
    meta: { headerTitle: "Customer", skeleton: <Skeleton className="h-4 w-32" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Customer" />,
    cell: ({ row }) => (
      <div className="font-medium text-sm text-foreground">{row.original.subscriberEmail ?? ""}</div>
    ),
    size: 220,
  },
  {
    accessorKey: "subscriptionMrr",
    meta: { headerTitle: "MRR", skeleton: <Skeleton className="h-4 w-16" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="MRR" />,
    cell: ({ getValue }) => <span className="font-medium">${(getValue() as number).toFixed(2)}</span>,
    size: 90,
  },
  {
    accessorKey: "offerAccepted",
    meta: { headerTitle: "Outcome", skeleton: <Skeleton className="h-5 w-20 rounded-full" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Outcome" />,
    cell: ({ getValue }) => <OutcomeBadge ok={getValue() as boolean} />,
    size: 110,
  },
  {
    accessorKey: "offerType",
    meta: { headerTitle: "Offer Type", skeleton: <Skeleton className="h-5 w-20 rounded-full" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Offer Type" />,
    cell: ({ getValue }) => <OfferPill type={getValue() as string | null} />,
    size: 120,
  },
  {
    accessorKey: "offerMade",
    meta: { headerTitle: "Offer Made", skeleton: <Skeleton className="h-4 w-36" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Offer Made" />,
    cell: ({ getValue }) => (
      <span className="text-muted-foreground text-sm truncate block max-w-[180px]">
        {(getValue() as string | null) ?? ""}
      </span>
    ),
    size: 200,
  },
  {
    accessorKey: "savedValue",
    meta: { headerTitle: "Value Saved", skeleton: <Skeleton className="h-4 w-16" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Value Saved" />,
    cell: ({ row }) => (
      <span className={row.original.offerAccepted ? "font-semibold text-green-700" : "text-muted-foreground"}>
        {row.original.offerAccepted ? `$${(row.original.savedValue ?? 0).toFixed(2)}` : ""}
      </span>
    ),
    size: 110,
  },
  {
    accessorKey: "createdAt",
    meta: { headerTitle: "Date", skeleton: <Skeleton className="h-4 w-24" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Date" />,
    cell: ({ getValue }) => (
      <span className="text-muted-foreground text-sm whitespace-nowrap">
        {new Date(getValue() as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </span>
    ),
    size: 120,
  },
];

export function SessionsTable({ sessions }: { sessions: SessionRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [outcome, setOutcome] = useState<"all" | "saved" | "cancelled">("all");
  const [offerType, setOfferType] = useState<(typeof OFFER_TYPES)[number]>("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (outcome === "saved" && !s.offerAccepted) return false;
      if (outcome === "cancelled" && s.offerAccepted) return false;
      if (offerType !== "All" && s.offerType !== offerType) return false;
      if (globalFilter) {
        const q = globalFilter.trim().toLowerCase();
        if (!(s.subscriberEmail ?? "").toLowerCase().includes(q) && !s.subscriberId.toLowerCase().includes(q)) return false;
      }
      if (dateFrom) {
        const [y, m, d] = dateFrom.split("-").map(Number);
        if (new Date(s.createdAt) < new Date(y, m - 1, d)) return false;
      }
      if (dateTo) {
        const [y, m, d] = dateTo.split("-").map(Number);
        if (new Date(s.createdAt) > new Date(y, m - 1, d, 23, 59, 59, 999)) return false;
      }
      return true;
    });
  }, [sessions, globalFilter, outcome, offerType, dateFrom, dateTo]);

  const saved = filtered.filter((s) => s.offerAccepted).length;
  const saveRate = filtered.length > 0 ? Math.round((saved / filtered.length) * 1000) / 10 : 0;

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const filtersActive = globalFilter.trim() !== "" || outcome !== "all" || offerType !== "All" || dateFrom !== "" || dateTo !== "";

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "Total", value: filtered.length, cls: "bg-slate-50 text-slate-700" },
          { label: "Saved", value: saved, cls: "bg-green-50 text-green-700" },
          { label: "Cancelled", value: filtered.length - saved, cls: "bg-red-50 text-red-700" },
          { label: "Save rate", value: `${saveRate}%`, cls: "bg-zinc-50 text-zinc-800" },
        ].map((p) => (
          <div key={p.label} className={`${p.cls} rounded-lg px-4 py-2.5 flex flex-col gap-0.5`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{p.label}</span>
            <span className="text-xl font-bold">{p.value}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center bg-white border border-border rounded-lg p-3">
        <input
          type="text"
          placeholder="Search email or subscriber ID…"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="flex-1 min-w-[180px] h-8 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex gap-1.5">
          {(["all", "saved", "cancelled"] as const).map((o) => (
            <button key={o} type="button" onClick={() => setOutcome(o)}
              className={`px-3 h-8 rounded-md text-xs font-medium border transition-colors ${outcome === o ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-input hover:bg-muted"}`}>
              {o === "all" ? "All" : o.charAt(0).toUpperCase() + o.slice(1)}
            </button>
          ))}
        </div>
        <select value={offerType} onChange={(e) => setOfferType(e.target.value as typeof offerType)}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
          {OFFER_TYPES.map((t) => <option key={t} value={t}>{t === "All" ? "All offer types" : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          <span className="text-muted-foreground text-xs">→</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        {filtersActive && (
          <button type="button" onClick={() => { setGlobalFilter(""); setOutcome("all"); setOfferType("All"); setDateFrom(""); setDateTo(""); }}
            className="h-8 px-3 rounded-md border border-input bg-background text-muted-foreground text-xs hover:bg-muted">
            Clear
          </button>
        )}
        <button type="button" onClick={() => exportSessionsCSV(filtered)} disabled={filtered.length === 0}
          className="ml-auto h-8 px-3 rounded-md bg-foreground text-background text-xs font-medium disabled:opacity-40">
          Export CSV
        </button>
      </div>

      {/* Data Grid */}
      <DataGrid table={table} recordCount={filtered.length} tableLayout={{ headerSticky: true }}>
        <DataGridContainer>
          <div className="overflow-x-auto">
            <DataGridTable />
          </div>
          <div className="border-t border-border px-4 py-3 flex justify-center">
            <SlidingPagination
              totalPages={table.getPageCount()}
              currentPage={table.getState().pagination.pageIndex + 1}
              onPageChange={(p) => table.setPageIndex(p - 1)}
            />
          </div>
        </DataGridContainer>
      </DataGrid>
    </div>
  );
}
