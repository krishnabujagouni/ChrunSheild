import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ClerkUserButton } from "@/components/clerk-auth-header";
import { DashboardSidebar } from "@/components/ui/dashboard-sidebar";
import "./hide-scroll.css";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      background: "var(--cs-bg, #fafafa)",
      overflow: "hidden",
      fontFamily: "var(--cs-font, var(--font-inter, 'Inter', system-ui, sans-serif))",
    }}>
      <DashboardSidebar />

      <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Floating account button  top-right of content, no bar */}
        <div style={{ position: "absolute", top: 28, right: 32, zIndex: 10 }}>
          <ClerkUserButton afterSignOutUrl="/" />
        </div>

        <main style={{
          flex: 1,
          overflowY: "auto",
          padding: "28px 72px 32px 28px",
          boxSizing: "border-box",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        } as React.CSSProperties}>
          {children}
        </main>
      </div>
    </div>
  );
}
