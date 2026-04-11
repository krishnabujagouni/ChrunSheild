"use client";

import { useMemo, useState } from "react";
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

export type ChargeHistoryRow = {
  id: string;
  stripeChargeId: string | null;
  chargedAt: string;
  totalFee: number;
  saveCount: number;
  isLegacy: boolean;
};

export type UnbilledRow = {
  sessionId: string;
  subscriberId: string;
  subscriberEmail: string | null;
  offerType: string | null;
  mrrSaved: number | null;
  fee: number | null;
  status: "queued" | "confirming";
  date: string | null;
  sortTimestamp: number;
  sessionStartedAt: string | null;
};

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

type UnbilledFilter = "all" | "queued" | "confirming";

function UnbilledStatusPill({ status }: { status: UnbilledRow["status"] }) {
  if (status === "queued") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
        Queued
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
      Confirming
    </span>
  );
}

const chargeColumns: ColumnDef<ChargeHistoryRow>[] = [
  {
    id: "chargedAt",
    accessorFn: (row) => new Date(row.chargedAt).getTime(),
    meta: { headerTitle: "Charged", skeleton: <Skeleton className="h-4 w-24" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Charged" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm whitespace-nowrap">
        {new Date(row.original.chargedAt).toLocaleDateString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
        })}
      </span>
    ),
    size: 130,
  },
  {
    accessorKey: "totalFee",
    meta: { headerTitle: "Amount", skeleton: <Skeleton className="h-4 w-20" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Amount" />,
    cell: ({ getValue }) => (
      <span className="font-semibold text-green-700">${(getValue() as number).toFixed(2)}</span>
    ),
    size: 110,
  },
  {
    accessorKey: "saveCount",
    meta: { headerTitle: "Saves", skeleton: <Skeleton className="h-4 w-12" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Saves" />,
    cell: ({ getValue }) => (
      <span className="text-sm font-medium">{getValue() as number}</span>
    ),
    size: 80,
  },
  {
    accessorKey: "stripeChargeId",
    meta: { headerTitle: "Payment ref", skeleton: <Skeleton className="h-4 w-32" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Payment ref" />,
    cell: ({ row }) => {
      const { stripeChargeId, isLegacy } = row.original;
      if (stripeChargeId) {
        return <span className="font-mono text-xs text-muted-foreground">{stripeChargeId}</span>;
      }
      return (
        <span className="text-xs text-muted-foreground italic">
          {isLegacy ? "No ref (legacy)" : ""}
        </span>
      );
    },
    size: 220,
  },
];

const unbilledColumns: ColumnDef<UnbilledRow>[] = [
  {
    accessorKey: "subscriberEmail",
    meta: { headerTitle: "Subscriber", skeleton: <Skeleton className="h-4 w-36" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Subscriber" />,
    cell: ({ row }) => (
      <div className="font-medium text-sm text-foreground">
        {row.original.subscriberEmail ?? row.original.subscriberId}
      </div>
    ),
    size: 200,
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
    meta: { headerTitle: "MRR saved", skeleton: <Skeleton className="h-4 w-16" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="MRR saved" />,
    cell: ({ getValue }) => {
      const v = getValue() as number | null;
      if (v === null) return <span className="text-muted-foreground text-sm"></span>;
      return <span className="font-medium">${v.toFixed(2)}</span>;
    },
    size: 100,
  },
  {
    accessorKey: "fee",
    meta: { headerTitle: "Fee (15%)", skeleton: <Skeleton className="h-4 w-16" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Fee (15%)" />,
    cell: ({ row }) => {
      const f = row.original.fee;
      if (f === null) {
        return <span className="text-muted-foreground text-sm"></span>;
      }
      const isEst = row.original.status === "confirming";
      return (
        <div>
          <span className={`font-semibold ${row.original.status === "queued" ? "text-amber-600" : "text-slate-600"}`}>
            ${f.toFixed(2)}
          </span>
          {isEst && (
            <div className="text-[10px] text-muted-foreground mt-0.5">Until Stripe confirms</div>
          )}
        </div>
      );
    },
    size: 110,
  },
  {
    accessorKey: "status",
    meta: { headerTitle: "Status", skeleton: <Skeleton className="h-5 w-20 rounded-full" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <UnbilledStatusPill status={row.original.status} />,
    size: 110,
  },
  {
    id: "date",
    accessorFn: (row) => row.sortTimestamp,
    meta: { headerTitle: "Date", skeleton: <Skeleton className="h-4 w-24" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Date" />,
    cell: ({ row }) => {
      const { date, sessionStartedAt, status } = row.original;
      if (date) {
        return (
          <span className="text-muted-foreground text-sm whitespace-nowrap">
            {new Date(date).toLocaleDateString("en-GB", {
              day: "numeric", month: "short", year: "numeric",
            })}
          </span>
        );
      }
      if (status === "confirming" && sessionStartedAt) {
        return (
          <div className="text-sm">
            <span className="text-muted-foreground"></span>
            <div className="text-[11px] text-muted-foreground mt-0.5 whitespace-nowrap">
              Session{" "}
              {new Date(sessionStartedAt).toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric",
              })}
            </div>
          </div>
        );
      }
      return <span className="text-muted-foreground text-sm"></span>;
    },
    size: 120,
  },
];

export function BillingDashboard({
  chargeHistory,
  unbilledRows,
  billedThisMonth,
  queuedTotal,
  confirmingCount,
  hasActivity,
}: {
  chargeHistory: ChargeHistoryRow[];
  unbilledRows: UnbilledRow[];
  billedThisMonth: number;
  queuedTotal: number;
  confirmingCount: number;
  hasActivity: boolean;
}) {
  const [chargeSorting, setChargeSorting] = useState<SortingState>([{ id: "chargedAt", desc: true }]);
  const [unbilledSorting, setUnbilledSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [unbilledFilter, setUnbilledFilter] = useState<UnbilledFilter>("all");

  const filteredUnbilled = useMemo(
    () =>
      unbilledFilter === "all"
        ? unbilledRows
        : unbilledRows.filter((r) => r.status === unbilledFilter),
    [unbilledRows, unbilledFilter],
  );

  const chargeTable = useReactTable({
    data: chargeHistory,
    columns: chargeColumns,
    state: { sorting: chargeSorting },
    onSortingChange: setChargeSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 12 } },
  });

  const unbilledTable = useReactTable({
    data: filteredUnbilled,
    columns: unbilledColumns,
    state: { sorting: unbilledSorting },
    onSortingChange: setUnbilledSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const pills: { label: string; value: string; cls: string }[] = [
    { label: "Charged this month", value: `$${billedThisMonth.toFixed(2)}`, cls: "bg-green-50 text-green-700" },
    {
      label: "Queued for next bill",
      value: `$${queuedTotal.toFixed(2)}`,
      cls: queuedTotal > 0 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-700",
    },
  ];
  if (confirmingCount > 0) {
    pills.push({
      label: "Awaiting confirmation",
      value: `${confirmingCount} save${confirmingCount === 1 ? "" : "s"}`,
      cls: "bg-slate-100 text-slate-800",
    });
  }

  const unbilledFilters: { key: UnbilledFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "queued", label: "Queued" },
    { key: "confirming", label: "Confirming" },
  ];

  if (!hasActivity) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3 flex-wrap">
          {pills.map((p) => (
            <div key={p.label} className={`${p.cls} rounded-lg px-4 py-2.5 flex flex-col gap-0.5`}>
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{p.label}</span>
              <span className="text-xl font-bold">{p.value}</span>
            </div>
          ))}
        </div>
        <div className="bg-white border border-border rounded-xl p-16 text-center">
          <div className="text-4xl mb-3">💳</div>
          <div className="text-sm font-semibold text-foreground mb-1">No billing activity yet</div>
          <div className="text-sm text-muted-foreground max-w-md mx-auto">
            Completed charges appear here as <strong>one row per Stripe payment</strong> after each
            monthly run. Upcoming fees show below once saves are in progress. Per-save detail is in{" "}
            <a href="/dashboard/sessions" className="text-foreground font-semibold underline">
              Recent sessions
            </a>
            .
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex gap-3 flex-wrap">
        {pills.map((p) => (
          <div key={p.label} className={`${p.cls} rounded-lg px-4 py-2.5 flex flex-col gap-0.5`}>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{p.label}</span>
            <span className="text-xl font-bold">{p.value}</span>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Charge history</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            One row per collection from ChurnQ (same Stripe payment ref = same batch).
          </p>
        </div>
        {chargeHistory.length === 0 ? (
          <div className="bg-white border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
            No completed charges yet. After the 1st-of-month run, payments appear here.
          </div>
        ) : (
          <DataGrid table={chargeTable} recordCount={chargeHistory.length} tableLayout={{ headerSticky: true }}>
            <DataGridContainer>
              <div className="overflow-x-auto">
                <DataGridTable />
              </div>
              <div className="border-t border-border px-4 py-3 flex justify-center">
                <SlidingPagination
                  totalPages={chargeTable.getPageCount()}
                  currentPage={chargeTable.getState().pagination.pageIndex + 1}
                  onPageChange={(p) => chargeTable.setPageIndex(p - 1)}
                />
              </div>
            </DataGridContainer>
          </DataGrid>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Upcoming fees</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Not yet collected  included on the next monthly charge once confirmed.
          </p>
        </div>
        {unbilledRows.length === 0 ? (
          <div className="bg-white border border-border rounded-lg p-8 text-center text-sm text-muted-foreground">
            Nothing queued. All caught up.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 items-center bg-white border border-border rounded-lg p-3">
              <div className="flex gap-1.5 flex-wrap">
                {unbilledFilters.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setUnbilledFilter(key)}
                    className={`px-3 h-8 rounded-md text-xs font-medium border transition-colors ${
                      unbilledFilter === key
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-muted-foreground border-input hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground ml-2">
                {filteredUnbilled.length} save{filteredUnbilled.length !== 1 ? "s" : ""}
              </span>
            </div>
            <DataGrid table={unbilledTable} recordCount={filteredUnbilled.length} tableLayout={{ headerSticky: true }}>
              <DataGridContainer>
                <div className="overflow-x-auto">
                  <DataGridTable />
                </div>
                <div className="border-t border-border px-4 py-3 flex justify-center">
                  <SlidingPagination
                    totalPages={unbilledTable.getPageCount()}
                    currentPage={unbilledTable.getState().pagination.pageIndex + 1}
                    onPageChange={(p) => unbilledTable.setPageIndex(p - 1)}
                  />
                </div>
              </DataGridContainer>
            </DataGrid>
          </>
        )}
      </section>
    </div>
  );
}
