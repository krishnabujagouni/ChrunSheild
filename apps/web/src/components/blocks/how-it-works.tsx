import { HugeiconsIcon } from "@hugeicons/react";
import {
  SourceCodeIcon,
  BubbleChatSparkIcon,
  Analytics01Icon,
  CheckmarkCircle01Icon,
} from "@hugeicons/core-free-icons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface Step {
  step: string;
  icon: typeof SourceCodeIcon;
  accentColor: string;
  accentBg: string;
  title: string;
  description: string;
  detail: string;
}

const STEPS: Step[] = [
  {
    step: "01",
    icon: SourceCodeIcon,
    accentColor: "#6d28d9",
    accentBg: "#f5f3ff",
    title: "Add one script tag",
    description:
      "Drop a single JS snippet into your app. It auto-detects cancel buttons  no webhook wiring, no backend changes.",
    detail: "Works with any framework: React, Next.js, plain HTML.",
  },
  {
    step: "02",
    icon: BubbleChatSparkIcon,
    accentColor: "#2563eb",
    accentBg: "#eff6ff",
    title: "AI handles the cancel",
    description:
      "Aria, our AI retention agent, opens a conversation, understands the subscriber's reason, and makes a personalised offer in seconds.",
    detail: "You set the guardrails: offer types, limits, tone.",
  },
  {
    step: "03",
    icon: Analytics01Icon,
    accentColor: "#059669",
    accentBg: "#ecfdf5",
    title: "Watch revenue stay",
    description:
      "Saved subscribers appear in your dashboard instantly. MRR recovered, save rates, and churn reasons  all in one place.",
    detail: "We charge 15% of what we save. Zero cost if nothing saves.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-16 bg-white border-t border-[#e4e4e7]">
      <div className="lnd-shell">
        {/* header */}
        <div className="flex flex-col items-center gap-3 text-center mb-12">
          <Badge
            variant="outline"
            className="text-xs font-semibold tracking-wide px-3 py-1"
          >
            How it works
          </Badge>
          <h2 className="max-w-lg text-3xl font-bold tracking-tight text-[#09090b] md:text-4xl leading-tight">
            Live in <span className="text-violet-600">three steps.</span>
          </h2>
          <p className="text-muted-foreground max-w-md text-base">
            Drop one script tag and ChurnShield does the rest  no webhook
            config, no backend changes, no flat monthly fee.
          </p>
        </div>

        {/* step cards */}
        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <Card
              key={s.step}
              className="grid grid-rows-[auto_1fr_auto] border-[#e4e4e7] shadow-none"
            >
              <CardHeader className="pb-4">
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: s.accentBg }}
                  >
                    <HugeiconsIcon
                      icon={s.icon}
                      size={20}
                      strokeWidth={1.5}
                      style={{ color: s.accentColor }}
                    />
                  </div>
                  <span
                    className="text-xs font-bold tracking-widest px-2.5 py-1 rounded-full"
                    style={{
                      color: s.accentColor,
                      background: s.accentBg,
                    }}
                  >
                    {s.step}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[#09090b] leading-snug">
                  {s.title}
                </h3>
              </CardHeader>

              <CardContent className="pt-0">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {s.description}
                </p>
              </CardContent>

              <div className="px-6 pb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 border border-[#e4e4e7]">
                  <HugeiconsIcon
                    icon={CheckmarkCircle01Icon}
                    size={13}
                    strokeWidth={1.5}
                    style={{ color: "#059669", flexShrink: 0 }}
                  />
                  <span className="text-xs text-muted-foreground">{s.detail}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
