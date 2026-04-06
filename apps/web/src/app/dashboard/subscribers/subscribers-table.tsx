"use client";

import { useState } from "react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getPaginationRowModel,
  type ColumnDef, type SortingState,
} from "@tanstack/react-table";
import {
  DataGrid, DataGridContainer, DataGridTable,
  DataGridColumnHeader,
} from "@/components/ui/data-grid-table";
import SlidingPagination from "@/components/ui/sliding-pagination";
import { Skeleton } from "@/components/ui/skeleton";

export type SubscriberRow = {
  subscriberId: string;
  displayEmail: string | null;
  riskScore: number | null;
  riskClass: string | null;
  cancelAttempts: number | string;
  failedPayments: number | string;
  daysInactive: number | string;
  lastScored: string | null;
};

const RISK_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  high:   { bg: "bg-red-100",    text: "text-red-800",    bar: "#991b1b" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-800", bar: "#854d0e" },
  low:    { bg: "bg-green-100",  text: "text-green-800",  bar: "#166534" },
};

const columns: ColumnDef<SubscriberRow>[] = [
  {
    accessorKey: "displayEmail",
    meta: { headerTitle: "Customer", skeleton: <Skeleton className="h-4 w-36" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Customer" />,
    cell: ({ row }) => (
      <div className="font-medium text-sm text-foreground">{row.original.displayEmail ?? ""}</div>
    ),
    size: 220,
  },
  {
    accessorKey: "riskScore",
    meta: { headerTitle: "Risk Score", skeleton: <Skeleton className="h-4 w-24" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Risk Score" />,
    cell: ({ row }) => {
      const score = row.original.riskScore;
      if (score == null) return <span className="text-muted-foreground"></span>;
      const cls = row.original.riskClass ?? "low";
      const c = RISK_COLORS[cls] ?? RISK_COLORS.low;
      return (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.round(score * 100)}%`, background: c.bar }} />
          </div>
          <span className="font-semibold text-sm" style={{ color: c.bar }}>{Math.round(score * 100)}</span>
        </div>
      );
    },
    size: 140,
  },
  {
    accessorKey: "riskClass",
    meta: { headerTitle: "Risk Class", skeleton: <Skeleton className="h-5 w-20 rounded-full" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Risk Class" />,
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      if (!v) return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">Not scored</span>;
      const c = RISK_COLORS[v] ?? { bg: "bg-muted", text: "text-muted-foreground" };
      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${c.bg} ${c.text}`}>{v}</span>
      );
    },
    size: 120,
  },
  {
    accessorKey: "cancelAttempts",
    meta: { headerTitle: "Cancel Attempts", skeleton: <Skeleton className="h-4 w-8" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Cancel Attempts" />,
    cell: ({ getValue }) => <span className="text-sm">{String(getValue())}</span>,
    size: 130,
  },
  {
    accessorKey: "failedPayments",
    meta: { headerTitle: "Failed Payments", skeleton: <Skeleton className="h-4 w-8" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Failed Payments" />,
    cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{String(getValue())}</span>,
    size: 130,
  },
  {
    accessorKey: "daysInactive",
    meta: { headerTitle: "Days Inactive", skeleton: <Skeleton className="h-4 w-12" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Days Inactive" />,
    cell: ({ getValue }) => {
      const v = getValue();
      return <span className="text-sm text-muted-foreground">{v === "" ? "" : `${v}d`}</span>;
    },
    size: 120,
  },
  {
    accessorKey: "lastScored",
    meta: { headerTitle: "Last Scored", skeleton: <Skeleton className="h-4 w-24" /> },
    header: ({ column }) => <DataGridColumnHeader column={column} title="Last Scored" />,
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      if (!v) return <span className="text-muted-foreground"></span>;
      return <span className="text-sm text-muted-foreground whitespace-nowrap">{v.slice(0, 10)}</span>;
    },
    size: 120,
  },
];

export function SubscribersTable({ rows }: { rows: SubscriberRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "riskScore", desc: true }]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  });

  return (
    <DataGrid table={table} recordCount={rows.length}
      tableLayout={{ headerSticky: true }}
      emptyMessage="No subscribers yet. Run a cancel flow or wait for churn scoring  then they appear here."
    >
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
  );
}
