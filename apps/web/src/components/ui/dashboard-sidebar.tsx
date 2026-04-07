"use client";
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  DashboardCircleIcon,
  UserGroupIcon,
  Clock01Icon,
  BarChartIcon,
  BubbleChatSparkIcon,
  SourceCodeIcon,
  AccountSetting01Icon,
  HelpCircleIcon,
  ArrowRight01Icon,
  ArrowLeft01Icon,
  Plug01Icon,
} from "@hugeicons/core-free-icons";
import {
  InfoCard,
  InfoCardContent,
  InfoCardTitle,
  InfoCardDescription,
  InfoCardFooter,
  InfoCardDismiss,
  InfoCardAction,
} from "@/components/ui/info-card";

const V = "var(--cs-accent, #18181b)";
const VL = "var(--cs-accent-soft, #f4f4f5)";

type NavItem = {
  icon: IconSvgElement;
  title: string;
  href: string;
  notifs?: number;
};

const mainNav: NavItem[] = [
  { icon: DashboardCircleIcon, title: "Overview",        href: "/dashboard" },
  { icon: UserGroupIcon,       title: "Subscribers",     href: "/dashboard/subscribers" },
  { icon: Clock01Icon,         title: "Recent Sessions", href: "/dashboard/sessions" },
  { icon: BarChartIcon,        title: "Offer Analytics", href: "/dashboard/offer-analytics" },
  { icon: BubbleChatSparkIcon, title: "AI Analyst",      href: "/dashboard/feedback" },
  { icon: SourceCodeIcon,      title: "Integration",     href: "/dashboard/integration" },
  { icon: Plug01Icon,          title: "Connections",     href: "/dashboard/connections" },
];

const bottomNav: NavItem[] = [
  { icon: AccountSetting01Icon, title: "Settings",      href: "/dashboard/settings" },
  { icon: HelpCircleIcon,       title: "Help & Support", href: "#" },
];

function NavOption({ item, selected, open }: { item: NavItem; selected: boolean; open: boolean }) {
  const baseStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    height: 44,
    width: "100%",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
    transition: "background 0.15s, color 0.15s",
    position: "relative",
    boxSizing: "border-box",
    ...(selected
      ? {
          background: VL,
          color: V,
          borderLeft: `2px solid ${V}`,
          paddingLeft: open ? 10 : 0,
        }
      : {
          background: "transparent",
          color: "var(--cs-text-muted, #71717a)",
          paddingLeft: open ? 12 : 0,
        }),
  };

  return (
    <Link href={item.href} style={baseStyle}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLAnchorElement).style.background = "var(--cs-bg, #fafafa)"; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLAnchorElement).style.background = "transparent"; }}
    >
      <div style={{
        width: 44,
        height: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <HugeiconsIcon icon={item.icon} size={20} strokeWidth={1.5} />
      </div>
      {open && (
        <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>
          {item.title}
        </span>
      )}
      {item.notifs && open && (
        <span style={{
          position: "absolute",
          right: 12,
          height: 20,
          minWidth: 20,
          padding: "0 5px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 99,
          background: V,
          color: "#fff",
          fontSize: 11,
          fontWeight: 600,
        }}>
          {item.notifs}
        </span>
      )}
    </Link>
  );
}

export function DashboardSidebar() {
  const [open, setOpen] = useState(true);
  const pathname = usePathname();

  const isSelected = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <nav style={{
      position: "sticky",
      top: 0,
      height: "100vh",
      flexShrink: 0,
      width: open ? 224 : 64,
      transition: "width 0.25s ease",
      borderRight: "1px solid var(--cs-border, #e4e4e7)",
      background: "var(--cs-surface, #fff)",
      padding: "0 8px",
      display: "flex",
      flexDirection: "column",
      boxSizing: "border-box",
      overflow: "hidden",
    }}>

      {/* Brand header */}
      <div style={{
        padding: open ? "16px 8px 12px" : "16px 0 12px",
        borderBottom: "1px solid var(--cs-border, #e4e4e7)",
        marginBottom: 8,
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 64,
      }}>
        {/* Logo  spinning triangle loader */}
        <div style={{
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          marginLeft: open ? 4 : 6,
        }}>
          <style>{`
            @keyframes cs-tri-spin {
              0%   { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            .cs-logo-tri {
              animation: cs-tri-spin 2.4s cubic-bezier(0.37, 0, 0.63, 1) infinite;
            }
          `}</style>
          <svg
            className="cs-logo-tri"
            width="28"
            height="28"
            viewBox="0 0 28 28"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            {/* Outer triangle track */}
            <polygon
              points="14,2 26,24 2,24"
              fill="none"
              stroke="#e4e4e7"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Spinning arc  one side highlighted */}
            <polygon
              points="14,2 26,24 2,24"
              fill="none"
              stroke="#09090b"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="24 60"
              strokeDashoffset="0"
            />
          </svg>
        </div>
        {open && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--cs-text, #18181b)", letterSpacing: "-0.02em" }}>
              <span style={{ color: V }}>Churn</span>Shield
            </div>
            <div style={{ fontSize: 11, color: "var(--cs-text-muted, #71717a)", marginTop: 1 }}>Retention Platform</div>
          </div>
        )}
      </div>

      {/* Scrollable middle: main nav + info card + bottom nav */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", paddingBottom: 48 }}>
        {/* Main nav */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
          {mainNav.map(item => (
            <NavOption key={item.href + item.title} item={item} selected={isSelected(item.href)} open={open} />
          ))}
        </div>

        {/* Info card  dismissible tip, only shown when sidebar is expanded */}
        {open && (
          <div style={{ padding: "0 4px 8px" }}>
            <InfoCard
              storageKey="sidebar-integration-tip"
              dismissType="forever"
              className="border-[var(--cs-border,#e4e4e7)] bg-[var(--cs-bg,#fafafa)] text-[var(--cs-text,#18181b)]"
            >
              <InfoCardContent className="text-xs">
                <InfoCardTitle className="text-xs font-semibold text-[var(--cs-text,#18181b)]">
                  Connect your billing
                </InfoCardTitle>
                <InfoCardDescription className="text-[var(--cs-text-muted,#71717a)]">
                  Link Stripe or Paddle to start saving subscribers automatically.
                </InfoCardDescription>
                <InfoCardFooter className="mt-1 text-[var(--cs-text-muted,#71717a)]">
                  <InfoCardDismiss className="hover:text-[var(--cs-text,#18181b)] transition-colors">
                    Dismiss
                  </InfoCardDismiss>
                  <InfoCardAction>
                    <Link
                      href="/dashboard/integration"
                      className="flex items-center gap-1 underline hover:text-[var(--cs-accent,#18181b)] transition-colors"
                    >
                      Set up <ExternalLink size={10} />
                    </Link>
                  </InfoCardAction>
                </InfoCardFooter>
              </InfoCardContent>
            </InfoCard>
          </div>
        )}

        {/* Bottom nav */}
        <div style={{ borderTop: "1px solid var(--cs-border, #e4e4e7)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
          {open && (
            <div style={{ padding: "4px 12px 4px", fontSize: 10, fontWeight: 600, color: "var(--cs-text-muted, #71717a)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Account
            </div>
          )}
          {bottomNav.map(item => (
            <NavOption key={item.href + item.title} item={item} selected={isSelected(item.href)} open={open} />
          ))}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        onClick={() => setOpen(!open)}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          borderTop: "1px solid var(--cs-border, #e4e4e7)",
          background: "none",
          borderLeft: "none",
          borderRight: "none",
          borderBottom: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          padding: "10px 4px",
          color: "var(--cs-text-muted, #71717a)",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--cs-bg, #fafafa)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
      >
        <div style={{ width: 44, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <HugeiconsIcon
            icon={open ? ArrowLeft01Icon : ArrowRight01Icon}
            size={16}
            strokeWidth={1.5}
          />
        </div>
        {open && (
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--cs-text-secondary, #52525b)" }}>Collapse</span>
        )}
      </button>
    </nav>
  );
}
