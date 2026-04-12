export default function FeatureRequestsPage() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 64px)",
      padding: "0 40px",
      boxSizing: "border-box",
    }}>
      {/* Header */}
      <div style={{
        paddingBottom: 16,
        borderBottom: "1px solid #f1f5f9",
        flexShrink: 0,
      }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#0f172a" }}>Feature Requests</h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: "2px 0 0" }}>
          Vote on ideas or suggest new features for ChurnQ
        </p>
      </div>

      {/* Embedded UserJot board */}
      <div style={{ flex: 1, paddingTop: 24 }}>
        <iframe
          src="https://churnsheild.userjot.com"
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            borderRadius: 12,
          }}
          title="Feature Requests"
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}
