"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TestimonialsColumn, type Testimonial } from "@/components/ui/testimonials-columns-1";
import { AnimatedNavigationTabs } from "@/components/ui/animated-navigation-tabs";
import { HeroSection } from "@/components/ui/hero-section";
import { BentoGrid, type BentoItem } from "@/components/ui/bento-grid";
import { HowItWorks } from "@/components/blocks/how-it-works";
import { PricingCard } from "@/components/ui/pricing-card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Feature108 } from "@/components/blocks/shadcnblocks-com-feature108";
import { ModemAnimatedFooter } from "@/components/ui/modem-animated-footer";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Shield01Icon,
  CheckmarkCircle01Icon,
  Cancel01Icon,
  Menu01Icon,
  BubbleChatIcon,
  CreditCardIcon,
  ChartLineData01Icon,
  Robot01Icon,
  BarChartIcon,
  Settings02Icon,
  Mail01Icon,
} from "@hugeicons/core-free-icons";

/* ─── Design tokens (aligned with globals.css) ─────────────────────────── */
const VL = "var(--cs-accent-soft)";
const E = "var(--cs-success)";
const EL = "var(--cs-success-soft)";



function useMobileNav() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(max-width: 768px)");
    const sync = () => setIsMobile(q.matches);
    sync();
    q.addEventListener("change", sync);
    return () => q.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!isMobile) setOpen(false);
  }, [isMobile]);
  return { open, setOpen, isMobile };
}

/* ─── Testimonials data ─────────────────────────────────────────────────── */
const testimonials: Testimonial[] = [
  {
    text: "ChurnQ saved us $4,200 in MRR last month alone. The AI handles cancellations better than our best support rep.",
    name: "Briana Patton",
    role: "Founder, Taskfully",
  },
  {
    text: "We went from 12% monthly churn to under 7% in 6 weeks. Setup took 10 minutes and we haven't touched it since.",
    name: "Bilal Ahmed",
    role: "CTO, PlanFlow",
  },
  {
    text: "The performance-only pricing sealed it. No flat fee meant we could try it with zero risk. Now it's in our standard stack.",
    name: "Saman Malik",
    role: "CEO, Calmly",
  },
  {
    text: "At-risk outreach alone is worth it  we're reaching subscribers before they even think about cancelling.",
    name: "Omar Raza",
    role: "Founder, Notified",
  },
  {
    text: "Our subscribers actually thank us after the cancel flow. The AI is empathetic in a way I didn't expect from a tool.",
    name: "Zainab Hussain",
    role: "Head of Growth, Loopify",
  },
  {
    text: "I was sceptical but the numbers don't lie. 41% of cancel attempts are now saves. It pays for itself in week one.",
    name: "Aliza Khan",
    role: "Co-founder, Funnelbase",
  },
  {
    text: "Payment recovery was a manual nightmare. ChurnQ's retry sequences recovered $1,800 last quarter without us touching a thing.",
    name: "Farhan Siddiqui",
    role: "Founder, Stackr",
  },
  {
    text: "The weekly digest keeps me informed without constant dashboard checking. Exactly what a solo founder needs.",
    name: "Sana Sheikh",
    role: "Founder, Writepath",
  },
  {
    text: "Switched from Churnkey  same quality AI flow, but I only pay when it actually saves revenue.",
    name: "Hassan Ali",
    role: "Founder, Invoicely",
  },
];

const firstColumn = testimonials.slice(0, 3);
const secondColumn = testimonials.slice(3, 6);
const thirdColumn = testimonials.slice(6, 9);

/* ─── Mock AI chat card (hero visual) ──────────────────────────────────── */
function ChatCard() {
  return (
    <div style={{
      background: "#ffffff",
      borderRadius: 20,
      border: "1px solid #e4e4e7",
      boxShadow: "0 2px 4px rgba(0,0,0,0.04), 0 16px 48px rgba(0,0,0,0.10)",
      padding: 20,
      maxWidth: 320,
      width: "100%",
      fontFamily: "inherit",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "#f4f4f5", border: "1px solid #e4e4e7", display: "flex", alignItems: "center", justifyContent: "center", color: "#09090b" }}>
          <HugeiconsIcon icon={Shield01Icon} size={18} strokeWidth={1.5} aria-hidden />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#09090b" }}>Aria · Retention Assistant</div>
          <div style={{ fontSize: 11, color: "#059669", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#059669" }} aria-hidden /> Active
          </div>
        </div>
      </div>
      {/* messages */}
      {[
        { role: "ai",   text: "Hey! Before you go  we've loved having you. Can I ask what's not working?" },
        { role: "user", text: "It's too expensive for me right now." },
        { role: "ai",   text: "Totally get it. How about 40% off for the next 3 months? That's just $17/mo  no commitment." },
      ].map((m, i) => (
        <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
          <div style={{
            background: m.role === "user" ? "#3f3f46" : "#ffffff",
            color: m.role === "user" ? "#ffffff" : "#09090b",
            padding: "9px 14px",
            borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            fontSize: 12.5,
            lineHeight: 1.6,
            maxWidth: "85%",
            border: m.role === "ai" ? "1px solid #e4e4e7" : "none",
          }}>{m.text}</div>
        </div>
      ))}
      {/* offer button */}
      <button type="button" style={{
        width: "100%",
        marginTop: 10,
        background: "#d1fae5",
        color: "#059669",
        border: "1px solid #a7f3d0",
        borderRadius: 12,
        padding: "12px 14px",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        fontFamily: "inherit",
        letterSpacing: "-0.01em",
      }}>
        <HugeiconsIcon icon={CheckmarkCircle01Icon} size={16} strokeWidth={1.5} aria-hidden />
        Claim 40% off  stay subscribed
      </button>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════════════ */
const NAV_TABS = [
  { id: 1, tile: "Product", href: "#product" },
  { id: 2, tile: "Features", href: "#features" },
  { id: 3, tile: "Pricing", href: "#pricing" },
];

export default function LandingPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { open: navOpen, setOpen: setNavOpen, isMobile } = useMobileNav();

  return (
    <div style={{ fontFamily: "var(--cs-font)", overflowX: "hidden", background: "var(--cs-bg)" }}>

      {/* ── NAV ────────────────────────────────────────────────────────── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid var(--cs-border)",
      }}>
        <div style={{
          padding: "0 5vw",
          height: 60,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 18, letterSpacing: "-0.4px", color: "var(--cs-text)", textDecoration: "none" }}>
            <style>{`
              @keyframes cs-tri-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              .cs-nav-logo-tri { animation: cs-tri-spin 2.4s cubic-bezier(0.37, 0, 0.63, 1) infinite; }
            `}</style>
            <svg className="cs-nav-logo-tri" width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
              <polygon points="14,2 26,24 2,24" fill="none" stroke="#e4e4e7" strokeWidth="2.5" strokeLinejoin="round" />
              <polygon points="14,2 26,24 2,24" fill="none" stroke="#09090b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="24 60" strokeDashoffset="0" />
            </svg>
            <span style={{ color: "var(--cs-accent)" }}>ChurnQ</span>
          </Link>
          <div className="lnd-desktop items-center" style={{ gap: 0 }}>
            <div style={{ "--primary": "240 6% 10%", "--muted-foreground": "240 4% 46%" } as React.CSSProperties}>
              <AnimatedNavigationTabs items={NAV_TABS} activeHref={pathname} />
            </div>
            <Link href="/sign-in" style={{ fontSize: 13, fontWeight: 500, color: "var(--cs-text-secondary)", padding: "10px 12px", borderRadius: 8, textDecoration: "none" }}>Log in</Link>
            <Link href="/sign-up" style={{
              fontSize: 13, fontWeight: 600, color: "#fff",
              background: "var(--cs-accent)",
              padding: "8px 16px", borderRadius: 99, textDecoration: "none",
              marginLeft: 8,
              boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
            }}>Get started free</Link>
          </div>
          <button
            type="button"
            className="lnd-mobile-toggle"
            aria-expanded={navOpen}
            aria-label={navOpen ? "Close menu" : "Open menu"}
            onClick={() => setNavOpen(!navOpen)}
          >
            {navOpen ? <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={1.5} /> : <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={1.5} />}
          </button>
        </div>
        <div className="lnd-mobile-panel" data-open={isMobile && navOpen ? "true" : "false"}>
          <Link href="#product" className="lnd-link" onClick={() => setNavOpen(false)}>Product</Link>
          <Link href="#features" className="lnd-link" onClick={() => setNavOpen(false)}>Features</Link>
          <Link href="#pricing" className="lnd-link" onClick={() => setNavOpen(false)}>Pricing</Link>
          <Link href="/sign-in" className="lnd-link" onClick={() => setNavOpen(false)}>Log in</Link>
          <Link href="/sign-up" style={{
            fontSize: 13, fontWeight: 600, color: "#fff",
            background: "var(--cs-accent)",
            padding: "12px 16px", borderRadius: 10, textDecoration: "none", textAlign: "center",
          }} onClick={() => setNavOpen(false)}>Get started free</Link>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <HeroSection
        badge={{
          text: "For SaaS founders losing subscribers",
        }}
        title="Stop losing revenue every time someone clicks cancel."
        description="When someone clicks cancel, ChurnQ starts a conversation, figures out why they're leaving, and makes them an offer. It also chases failed payments and shows you who's at risk before they decide to leave. One script tag and it handles the rest."
        actions={[
          { text: "Start for free", href: "/sign-up", variant: "default" },
        ]}
      >
        <ChatCard />
      </HeroSection>

      {/* ── BASELINE METRICS ─────────────────────────────────────────────── */}
      <section style={{ background: "var(--cs-surface)", borderBottom: "1px solid var(--cs-border)" }}>
        <div className="lnd-shell" style={{ padding: "40px 0" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 0,
          }}>
            {[
              { n: "40%", l: "Voluntary churn reduction", sub: "typical cohorts" },
              { n: "$2.4k", l: "Avg. MRR saved per month", sub: "founder-reported" },
              { n: "5 min", l: "Time to first live intercept", sub: "median setup time" },
              { n: "15%", l: "Our fee, on saved revenue", sub: "zero flat cost" },
            ].map((row, i) => (
              <div key={row.n} style={{
                padding: "0 28px",
                borderLeft: i > 0 ? "1px solid var(--cs-border)" : undefined,
              }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: "var(--cs-text)", letterSpacing: "-0.04em", lineHeight: 1 }}>{row.n}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--cs-text-secondary)", marginTop: 8, lineHeight: 1.3 }}>{row.l}</div>
                <div style={{ fontSize: 11, color: "var(--cs-text-muted)", marginTop: 4 }}>{row.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>



{/* ── PRODUCT FEATURES (tabbed) ───────────────────────────────────── */}
      <div id="product" style={{ scrollMarginTop: 72 }}>
        <Feature108
          heading="Cancel flows, payment recovery, and churn signals — in one place."
          description="Instead of four separate tools that don't talk to each other, ChurnQ handles all of it."
          tabs={[
            {
              value: "cancel",
              icon: <HugeiconsIcon icon={BubbleChatIcon} size={16} strokeWidth={1.5} className="shrink-0" />,
              label: "Cancel flows",
              content: {
                badge: "AI cancel flow",
                title: "When someone clicks cancel, ChurnQ talks to them.",
                description: "Most cancel flows are a dead-end form. ChurnQ opens a real conversation — asks why they're leaving, offers something that fits, and only lets them go if they really want to. You stay on-brand the whole time.",
                bullets: [
                  "Adapts to the reason: price complaints, missing features, taking a break, or switching to a competitor.",
                  "You set the limits — what it can offer, how deep a discount, which plans — so it never goes further than you want.",
                  "Every conversation is logged so you can see exactly what's making people leave.",
                ],
                stat: "40%+",
                statLabel: "of cancel attempts end in a save",
                buttonText: "See how it works",
                buttonHref: "#features",
              },
            },
            {
              value: "payments",
              icon: <HugeiconsIcon icon={CreditCardIcon} size={16} strokeWidth={1.5} className="shrink-0" />,
              label: "Payment recovery",
              content: {
                badge: "Payment recovery",
                title: "Chase failed payments automatically.",
                description: "Cards fail for different reasons — expired, blocked by the bank, not enough funds. Most tools send one generic email and leave it. ChurnQ sends the right message for each failure type and retries at a sensible time.",
                bullets: [
                  "Different email copy for expired cards, bank blocks, and insufficient funds — not one blast for all.",
                  "Retry timing you can tune to match how your payment processor behaves.",
                  "Recovered payments appear in the same dashboard as your saved subscribers.",
                ],
                stat: "35%",
                statLabel: "reduction in failed-payment churn",
                buttonText: "See how it works",
                buttonHref: "#features",
              },
            },
            {
              value: "prediction",
              icon: <HugeiconsIcon icon={ChartLineData01Icon} size={16} strokeWidth={1.5} className="shrink-0" />,
              label: "Churn prediction",
              content: {
                badge: "Daily risk scores",
                title: "See who's about to leave before they hit cancel.",
                description: "Every day, ChurnQ looks across your subscribers and flags the ones going quiet, dropping usage, or hitting payment friction. You see who's at risk with enough time to actually do something about it.",
                bullets: [
                  "Scores update from your existing data — no new tracking to add.",
                  "Focus outreach on the accounts that actually move the needle.",
                  "Lives in the same dashboard as your saves and recoveries — not a separate tool to check.",
                ],
                stat: "Days earlier",
                statLabel: "you'll spot at-risk accounts before they reach the cancel button",
                buttonText: "See how it works",
                buttonHref: "#features",
              },
            },
            {
              value: "feedback",
              icon: <HugeiconsIcon icon={Robot01Icon} size={16} strokeWidth={1.5} className="shrink-0" />,
              label: "Feedback & AI analyst",
              content: {
                badge: "Ask your data",
                title: "Find out why people are really leaving.",
                description: "ChurnQ reads through every cancellation conversation and pulls out the common threads. You get a weekly digest, and you can just ask it questions — 'why do annual users cancel?' — and it answers from your actual data.",
                bullets: [
                  "Themes come from real conversations, not surveys people rush through.",
                  "Ask plain questions and get answers — no SQL, no manual tagging.",
                  "The language matches what subscribers actually said, not a summarised version.",
                ],
                stat: "3×",
                statLabel: "faster from 'why are people leaving?' to a product decision",
                buttonText: "See how it works",
                buttonHref: "#features",
              },
            },
          ]}
        />
      </div>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <HowItWorks />

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section id="features" style={{ background: "var(--cs-bg)", padding: "72px 0", borderTop: "1px solid var(--cs-border)", scrollMarginTop: 72 }}>
        <div className="lnd-shell">
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ display: "inline-block", background: EL, color: E, fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 99, marginBottom: 14, letterSpacing: "0.02em", border: "1px solid rgba(5,150,105,0.2)" }}>Features</div>
            <h2 style={{ fontSize: "clamp(26px, 3.5vw, 36px)", fontWeight: 700, color: "var(--cs-text)", margin: 0, letterSpacing: "-0.03em" }}>
              Everything you need to stop losing subscribers
            </h2>
            <p style={{ fontSize: 15, color: "var(--cs-text-secondary)", margin: "14px auto 0", maxWidth: 520, lineHeight: 1.6 }}>
              One platform. Cancel flows, payment recovery, churn prediction, and product insights  all talking to each other.
            </p>
          </div>

          <BentoGrid
            items={([
              {
                title: "AI Cancel Agent",
                meta: "40%+ save rate",
                description: "When someone clicks cancel, Aria starts a conversation — asks what's wrong, then makes a personalised offer before they go. Discount, pause, or plan change.",
                icon: <HugeiconsIcon icon={BubbleChatIcon} size={16} strokeWidth={1.5} style={{ color: "#18181b" }} />,
                status: "Core",
                tags: ["Cancel flow", "Aria AI Agent", "Personalised"],
                cta: "See it live →",
                colSpan: 2,
                hasPersistentHover: true,
              },
              {
                title: "Payment Recovery",
                meta: "35% recovery",
                description: "Different emails for different card failures — expired, blocked, or short on funds. Smart retries recover most failed payments without the subscriber ever opening a ticket.",
                icon: <HugeiconsIcon icon={CreditCardIcon} size={16} strokeWidth={1.5} style={{ color: "#18181b" }} />,
                status: "Active",
                tags: ["Dunning", "Smart retry"],
              },
              {
                title: "Churn Prediction",
                meta: "Daily scores",
                description: "Risk scores refresh daily from usage signals. Surface at-risk accounts before they reach the cancel button.",
                icon: <HugeiconsIcon icon={ChartLineData01Icon} size={16} strokeWidth={1.5} style={{ color: "#18181b" }} />,
                status: "Daily",
                tags: ["Risk scores", "Alerts"],
              },
              {
                title: "Feedback Digest",
                meta: "Weekly AI summary",
                description: "Themes, complaints, and product signals extracted from real cancellation transcripts  delivered to your inbox every week.",
                icon: <HugeiconsIcon icon={BarChartIcon} size={16} strokeWidth={1.5} style={{ color: "#18181b" }} />,
                status: "Weekly",
                tags: ["Themes", "Product signal"],
                colSpan: 2,
              },
              {
                title: "AI Feedback Chat",
                meta: "Plain English",
                description: "Ask 'Why do annual users cancel at month 11?' and get answers grounded in your actual transcript data  not generic benchmarks.",
                icon: <HugeiconsIcon icon={Robot01Icon} size={16} strokeWidth={1.5} style={{ color: "#18181b" }} />,
                status: "AI",
                tags: ["Ask anything", "Your data"],
                colSpan: 2,
              },
              {
                title: "Full Customisation",
                meta: "Your rules",
                description: "Set exactly what Aria can offer: discount amounts, pause lengths, custom messages, and per-plan limits. It behaves like part of your product, not a third-party widget dropped in.",
                icon: <HugeiconsIcon icon={Settings02Icon} size={16} strokeWidth={1.5} className="text-gray-400" />,
                status: "Config",
                tags: ["Guardrails", "Segments"],
              },
            ] as BentoItem[])}
          />
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ background: "#fff", padding: "80px 0", borderTop: "1px solid #e2e8f0", scrollMarginTop: 72 }}>
        <div className="lnd-shell" style={{ maxWidth: 900 }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ display: "inline-block", background: "#f4f4f5", color: "#18181b", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 99, marginBottom: 14, letterSpacing: "0.02em", border: "1px solid #e4e4e7" }}>Pricing</div>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 800, color: "#09090b", margin: "0 0 12px", letterSpacing: "-0.03em" }}>
              We only win when you win
            </h2>
            <p style={{ color: "#64748b", fontSize: 16, margin: 0 }}>No monthly fees. No subscriptions. We take 15% of the revenue we save you  nothing else.</p>
          </div>

          <PricingCard
            title="Performance Pricing"
            description="We only charge when we save your revenue. Every feature included  no tiers, no upsells."
            price={15}
            priceSuffix="%"
            priceSubtitle="of MRR we save you"
            features={[
              {
                title: "Everything included",
                items: [
                  "Full AI cancel flow agent  unlimited",
                  "Payment recovery emails",
                  "Churn prediction & risk scores",
                  "AI Feedback Chat",
                  "Dashboard & analytics",
                ],
              },
              {
                title: "How billing works",
                items: [
                  "15% of MRR we recover",
                  "No save = no charge",
                  "No monthly subscription",
                  "No setup fee",
                ],
              },
            ]}
            buttonText="Get started  free"
            onButtonClick={() => router.push("/sign-up")}
          />

          <p style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: "#64748b" }}>
            High-volume or enterprise?{" "}
            <a href="mailto:hello@churnq.com" style={{ color: "#18181b", fontWeight: 600, textDecoration: "none" }}>Talk to us</a>
          </p>
        </div>
      </section>

      {/* ── TESTIMONIALS ────────────────────────────────────────────────── */}
      <section style={{ background: "var(--cs-surface)", padding: "72px 0", borderTop: "1px solid var(--cs-border)" }}>
        <div className="lnd-shell">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ once: true }}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: 540, margin: "0 auto 48px" }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: VL, color: "var(--cs-accent)", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 99, marginBottom: 14, letterSpacing: "0.02em", border: "1px solid var(--cs-accent-ring)" }}>
              Testimonials
            </div>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, color: "var(--cs-text)", margin: "0 0 12px", letterSpacing: "-0.03em", textAlign: "center" }}>
              What our users say
            </h2>
            <p style={{ color: "var(--cs-text-secondary)", fontSize: 15, margin: 0, textAlign: "center", lineHeight: 1.6 }}>
              Here's what founders have said after running ChurnQ.
            </p>
          </motion.div>

          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: 24,
            marginTop: 8,
            maxHeight: 780,
            overflow: "hidden",
            WebkitMaskImage: "linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)",
            maskImage: "linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)",
          }}>
            <TestimonialsColumn testimonials={firstColumn} duration={22} startIndex={0} />
            <TestimonialsColumn testimonials={secondColumn} duration={28} startIndex={3} />
            <TestimonialsColumn testimonials={thirdColumn} duration={25} startIndex={6} />
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ background: "#fff", padding: "80px 0", borderTop: "1px solid #e2e8f0", scrollMarginTop: 72 }}>
        <div className="lnd-shell" style={{ maxWidth: 760 }}>
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <div style={{ display: "inline-block", background: "#f4f4f5", color: "#18181b", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 99, marginBottom: 14, letterSpacing: "0.02em", border: "1px solid #e4e4e7" }}>FAQ</div>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 38px)", fontWeight: 800, color: "#09090b", margin: "0 0 12px", letterSpacing: "-0.03em" }}>
              Everything you need to know
            </h2>
            <p style={{ color: "#64748b", fontSize: 16, margin: 0 }}>
              Common questions about ChurnQ, how it compares, and how billing works.
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full" defaultValue="q1">
            {[
              {
                id: "q1",
                q: "How is ChurnQ different from Churnkey?",
                a: "The biggest difference is how we charge. Churnkey charges a flat monthly subscription fee regardless of results  you pay even if they save zero customers. ChurnQ uses pure performance pricing: we take 15% of MRR we actually recover. If we don't save anyone, you pay nothing. We also use a live AI agent that adapts its offer in real time, while most competitors rely on static templates you configure manually.",
              },
              {
                id: "q2",
                q: "Is there a monthly fee or subscription cost?",
                a: "No. ChurnQ has zero monthly fees, zero setup costs, and zero subscriptions. Our only revenue comes from a 15% share of the revenue we save you. This aligns our incentives completely with yours  we only win when you win.",
              },
              {
                id: "q3",
                q: "What is the best cancel flow software for SaaS in 2025?",
                a: "The best cancel flow tool is one that charges you nothing unless it delivers results. ChurnQ's AI-powered cancel flow engages subscribers in real time, surfaces the right offer (discount, pause, downgrade, or empathy), and only bills you for successful saves. Unlike fixed-fee platforms, you're never paying for performance you didn't get.",
              },
              {
                id: "q4",
                q: "How does ChurnQ's AI compare to template-based retention tools?",
                a: "Traditional retention tools let you build a decision tree  if the customer says X show them Y. ChurnQ uses a conversational AI agent that reads the subscriber's reason for cancelling, their usage history, and their MRR tier to generate a personalised offer on the fly. This produces higher save rates because the response feels human, not scripted.",
              },
              {
                id: "q5",
                q: "Which billing platforms does ChurnQ integrate with?",
                a: "ChurnQ integrates with Stripe and Paddle out of the box via a single JavaScript snippet. Setup takes under 5 minutes  you drop in the script tag, connect your billing provider, and ChurnQ automatically intercepts cancel events from that point forward.",
              },
              {
                id: "q6",
                q: "How quickly can I see results after setup?",
                a: "Most customers see their first saved subscriber within 24 hours of going live. The AI model improves as it sees more sessions from your specific product  typically within the first two weeks your save rate stabilises at its peak for your audience.",
              },
              {
                id: "q7",
                q: "What happens if ChurnQ doesn't save a subscriber?",
                a: "Nothing  you owe us nothing. There is no base fee. If a customer cancels despite the AI's best effort, we charge zero. This is the core promise of performance pricing: our interests are identical to yours.",
              },
              {
                id: "q8",
                q: "Can I switch from Churnkey or another provider easily?",
                a: "Yes. Switching is a one-line script change. Remove your existing cancel-flow snippet and add ours  there's no data migration, no configuration wizard, and no onboarding call required. Most teams are live in under an hour.",
              },
            ].map(({ id, q, a }) => (
              <AccordionItem
                key={id}
                value={id}
                className="rounded-xl border border-[#e4e4e7] bg-white px-5 py-1 mb-3 last:mb-0"
              >
                <AccordionTrigger className="text-[15px] text-[#09090b] font-semibold py-4 hover:no-underline">
                  {q}
                </AccordionTrigger>
                <AccordionContent className="text-[#475569] text-sm leading-relaxed pb-4">
                  {a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <p style={{ textAlign: "center", marginTop: 40, fontSize: 14, color: "#64748b" }}>
            Still have questions?{" "}
            <a href="mailto:hello@churnq.com" style={{ color: "#18181b", fontWeight: 600, textDecoration: "none" }}>
              Email us →
            </a>
          </p>
        </div>
      </section>



      <ModemAnimatedFooter
        brandName="ChurnQ"
        brandDescription="When someone clicks cancel, ChurnQ tries to save them. No monthly fee — we take 15% of what we actually save."
        socialLinks={[
          {
            icon: <HugeiconsIcon icon={Mail01Icon} size={20} strokeWidth={1.5} />,
            href: "mailto:hello@churnq.com",
            label: "Email ChurnQ",
          },
        ]}
        navLinks={[
          { href: "#product", label: "Overview" },
          { href: "#features", label: "Features" },
          { href: "#pricing", label: "Pricing" },
          { href: "mailto:hello@churnq.com", label: "Contact" },
          { href: "/privacy", label: "Privacy" },
          { href: "/cookie-policy", label: "Cookies" },
          { href: "/terms", label: "Terms" },
        ]}
        brandIcon={
          <svg width="48" height="48" viewBox="0 0 512 512" fill="none" aria-hidden>
            <line x1="68" y1="400" x2="256" y2="88" stroke="#d4d4d8" strokeWidth="28" strokeLinecap="round"/>
            <line x1="68" y1="400" x2="444" y2="400" stroke="#d4d4d8" strokeWidth="28" strokeLinecap="round"/>
            <line x1="256" y1="88" x2="444" y2="400" stroke="#18181b" strokeWidth="28" strokeLinecap="round"/>
          </svg>
        }
      />
    </div>
  );
}
