"use client";

import { useState, useMemo } from "react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getPaginationRowModel, type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import {
  DataGrid, DataGridContainer, DataGridTable,
  DataGridColumnHeader,
} from "@/components/ui/data-grid-table";
import SlidingPagination from "@/components/ui/sliding-pagination";
import { Skeleton } from "@/components/ui/skeleton";

const OFFER_COLORS: Record<string, { bg: string; text: string }> = {
  discount:  { bg: "bg-zinc-100",   text: "text-zinc-900" },
  pause:     { bg: "bg-sky-100",    text: "text-sky-700" },
  extension: { bg: "bg-yellow-100", text: "text-yellow-800" },
  downgrade: { bg: "bg-pink-100",   text: "text-pink-800" },
  empathy:   { bg: "bg-green-50",   text: "text-green-800" },
};

function OfferPill({ type }: { type: string | null }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  const c = OFFER_COLORS[type] ?? { bg: "bg-slate-100", text: "text-slate-600" };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

export type BillingRow = {
  sessionId: string;
  subscriberId: string;
  subscriberEmail: string | null;
  offerType: string | null;
  mrrSaved: number;
  fee: number;
  status: "billed" | "pending";
  date: string; // ISO
  stripeChargeId: string | null;
};

const columns: ColumnDef<BillingRow>[] = [
  {
    accessorKey: "subscriberEmail",
    meta: { headerTitle: "Subscriber", skeleton: <Skeleton className="h-4 w-36" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Subscriber" />,
    cell: ({ row }) => (
      <div>
        <div className="font-medium text-sm text-foreground">
          {row.original.subscriberEmail ?? row.original.subscriberId}
        </div>
        {row.original.stripeChargeId && (
          <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
            {row.original.stripeChargeId}
          </div>
        )}
      </div>
    ),
    size: 220,
  },
  {
    accessorKey: "offerType",
    meta: { headerTitle: "Offer", skeleton: <Skeleton className="h-5 w-20 rounded-full" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Offer" />,
    cell: ({ getValue }) => <OfferPill type={getValue() as string | null} />,
    size: 110,
  },
  {
    accessorKey: "mrrSaved",
    meta: { headerTitle: "MRR Saved", skeleton: <Skeleton className="h-4 w-16" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="MRR Saved" />,
    cell: ({ getValue }) => (
      <span className="font-medium">${(getValue() as number).toFixed(2)}</span>
    ),
    size: 110,
  },
  {
    accessorKey: "fee",
    meta: { headerTitle: "Fee (15%)", skeleton: <Skeleton className="h-4 w-16" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Fee (15%)" />,
    cell: ({ row }) => (
      <span className={`font-semibold ${row.original.status === "billed" ? "text-green-700" : "text-amber-600"}`}>
        ${(row.original.fee).toFixed(2)}
      </span>
    ),
    size: 100,
  },
  {
    accessorKey: "status",
    meta: { headerTitle: "Status", skeleton: <Skeleton className="h-5 w-20 rounded-full" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Status" />,
    cell: ({ getValue }) => {
      const s = getValue() as string;
      return s === "billed"
        ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">Charged</span>
        : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">Pending</span>;
    },
    size: 100,
  },
  {
    accessorKey: "date",
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

export function BillingTable({ rows, billedThisMonth, pendingTotal }: {
  rows: BillingRow[];
  billedThisMonth: number;
  pendingTotal: number;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [statusFilter, setStatusFilter] = useState<"all" | "billed" | "pending">("all");

  const filtered = useMemo(() =>
    statusFilter === "all" ? rows : rows.filter(r => r.status === statusFilter),
    [rows, statusFilter]
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } },
  });

  return (
    <div className="space-y-4">

      {/* Stat pills */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: "Charged this month", value: `$${billedThisMonth.toFixed(2)}`, cls: "bg-green-50 text-green-700" },
          { label: "Pending", value: `$${pendingTotal.toFixed(2)}`, cls: pendingTotal > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-700" },
        ].map(p => (
          <div key={p.label} className={`${p.cls} rounded-lg px-4 py-2.5 flex flex-col gap-0.5`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{p.label}</span>
            <span className="text-xl font-bold">{p.value}</span>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 items-center bg-white border border-border rounded-lg p-3">
        <div className="flex gap-1.5">
          {(["all", "billed", "pending"] as const).map(o => (
            <button key={o} type="button" onClick={() => setStatusFilter(o)}
              className={`px-3 h-8 rounded-md text-xs font-medium border transition-colors ${statusFilter === o ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-input hover:bg-muted"}`}>
              {o === "all" ? "All" : o === "billed" ? "Charged" : "Pending"}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-2">
          {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="bg-white border border-border rounded-xl p-16 text-center">
          <div className="text-4xl mb-3">💳</div>
          <div className="text-sm font-semibold text-foreground mb-1">No charges yet</div>
          <div className="text-sm text-muted-foreground">
            Fees appear here as soon as a saved subscriber's invoice pays in Stripe.
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
}
