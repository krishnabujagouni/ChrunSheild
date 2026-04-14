import Link from "next/link";
import { privacyPolicyHtml } from "@/content/privacy-policy";

export const metadata = {
  title: "Privacy Policy | ChurnQ",
  description: "ChurnQ Privacy Policy  how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <>
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(16px)",
        borderBottom: "1px solid #e4e4e7", padding: "0 5vw", height: 56,
        display: "flex", alignItems: "center",
      }}>
        <Link href="/" style={{
          fontWeight: 700, fontSize: 16, color: "#09090b",
          textDecoration: "none", letterSpacing: "-0.3px",
        }}>
          ← ChurnQ
        </Link>
      </nav>
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px 96px" }}>
        <div dangerouslySetInnerHTML={{ __html: privacyPolicyHtml }} />
      </main>
    </>
  );
}
