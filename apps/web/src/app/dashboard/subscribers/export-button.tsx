"use client";

export function ExportSubscribersButton() {
  return (
    <a
      href="/api/dashboard/export/subscribers"
      download
      style={{
        display: "inline-block",
        padding: "7px 16px",
        background: "#0f172a",
        color: "#fff",
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 500,
        textDecoration: "none",
        whiteSpace: "nowrap",
        lineHeight: 1.5,
      }}
    >
      Export CSV
    </a>
  );
}
