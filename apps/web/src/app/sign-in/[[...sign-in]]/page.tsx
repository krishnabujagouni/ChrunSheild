import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div style={{
      display: "flex",
      minHeight: "100vh",
      fontFamily: "var(--font-inter, system-ui, sans-serif)",
    }}>
      {/* Left branding panel */}
      <div style={{
        display: "none",
        flex: 1,
        background: "#ffffff",
        borderRight: "1px solid #e4e4e7",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "48px",
        position: "relative",
        overflow: "hidden",
      }} className="auth-left-panel">
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, background: "#f4f4f5", borderRadius: 10, border: "1px solid #e4e4e7", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 512 512" fill="none">
              <line x1="68" y1="400" x2="256" y2="88" stroke="#d4d4d8" strokeWidth="40" strokeLinecap="round"/>
              <line x1="68" y1="400" x2="444" y2="400" stroke="#d4d4d8" strokeWidth="40" strokeLinecap="round"/>
              <line x1="256" y1="88" x2="444" y2="400" stroke="#18181b" strokeWidth="40" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={{ color: "#09090b", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
            ChurnShield
          </span>
        </div>

        {/* Center content */}
        <div>
          <p style={{ color: "#71717a", fontSize: 13, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 16 }}>
            Retention Platform
          </p>
          <h2 style={{ color: "#09090b", fontSize: 36, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.03em", marginBottom: 32 }}>
            Stop losing revenue<br />every time someone<br />clicks cancel.
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              "AI agent intercepts every cancel click",
              "Personalised retention offers in seconds",
              "15% fee only when we save a subscriber",
              "Zero flat fee  no risk to start",
            ].map((item) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#f4f4f5", border: "1px solid #e4e4e7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#18181b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span style={{ color: "#3f3f46", fontSize: 14 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom quote */}
        <div style={{ borderTop: "1px solid #e4e4e7", paddingTop: 24 }}>
          <p style={{ color: "#71717a", fontSize: 13, lineHeight: 1.6 }}>
            "Performance-only pricing sealed it. No flat fee meant we could try it with zero risk."
          </p>
          <p style={{ color: "#a1a1aa", fontSize: 12, marginTop: 8 }}> Early access founder</p>
        </div>
      </div>

      {/* Right form panel */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        background: "#fafafa",
      }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <div style={{ marginBottom: 32, textAlign: "center" }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#09090b", letterSpacing: "-0.02em", marginBottom: 6 }}>
              Welcome back
            </h1>
            <p style={{ fontSize: 14, color: "#71717a" }}>Sign in to your ChurnShield dashboard</p>
          </div>
          <SignIn appearance={{
            elements: {
              rootBox: { width: "100%" },
              card: { boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)", border: "1px solid #e4e4e7", borderRadius: 16 },
              headerTitle: { display: "none" },
              headerSubtitle: { display: "none" },
              socialButtonsBlockButton: { borderRadius: 8, border: "1px solid #e4e4e7", fontWeight: 500 },
              formButtonPrimary: { background: "#18181b", borderRadius: 8, fontWeight: 600 },
              footerActionLink: { color: "#18181b", fontWeight: 600 },
            },
          }} />
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .auth-left-panel { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
