import { Tabs, TabsContent, TabsList, TabsTrigger } from "@radix-ui/react-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

interface TabContent {
  badge: string;
  title: string;
  description: string;
  bullets: string[];
  stat: string;
  statLabel: string;
  buttonText: string;
  buttonHref?: string;
  visual?: ReactNode;
}

interface Tab {
  value: string;
  icon: ReactNode;
  label: string;
  content: TabContent;
}

interface Feature108Props {
  badge?: string;
  heading?: string;
  description?: string;
  tabs?: Tab[];
}

const Feature108 = ({
  badge,
  heading,
  description,
  tabs = [],
}: Feature108Props) => {
  if (!tabs.length) return null;

  return (
    <section className="bg-white" style={{ padding: "96px 0" }}>
      <div className="lnd-shell">
        {(badge || heading || description) && (
          <div className="flex flex-col items-center gap-3 text-center mb-10">
            {badge && (
              <Badge variant="outline" className="text-xs font-semibold tracking-wide px-3 py-1">
                {badge}
              </Badge>
            )}
            {heading && (
              <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-[#09090b] md:text-4xl">
                {heading}
              </h2>
            )}
            {description && (
              <p className="text-muted-foreground max-w-xl text-base">{description}</p>
            )}
          </div>
        )}

        <Tabs defaultValue={tabs[0].value}>
          <TabsList className="flex flex-wrap items-center justify-center gap-2 bg-transparent mb-8">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-muted-foreground border border-transparent transition-all data-[state=active]:bg-[#09090b] data-[state=active]:text-white data-[state=active]:border-[#09090b] hover:bg-muted cursor-pointer"
              >
                {tab.icon}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] overflow-hidden">
            {tabs.map((tab) => (
              <TabsContent
                key={tab.value}
                value={tab.value}
                className="grid gap-0 lg:grid-cols-2 outline-none"
              >
                {/* Left  text */}
                <div className="flex flex-col gap-5 p-8 lg:p-12">
                  <Badge variant="outline" className="w-fit bg-white text-xs font-semibold">
                    {tab.content.badge}
                  </Badge>
                  <h3 className="text-2xl font-bold tracking-tight text-[#09090b] lg:text-3xl leading-tight">
                    {tab.content.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {tab.content.description}
                  </p>
                  <ul className="flex flex-col gap-2.5">
                    {tab.content.bullets.map((b) => (
                      <li key={b.slice(0, 40)} className="flex items-start gap-2.5 text-sm text-[#374151]">
                        <Check size={15} className="text-[#09090b] shrink-0 mt-0.5" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  {tab.content.buttonHref ? (
                    <Link href={tab.content.buttonHref}>
                      <Button className="mt-1 w-fit bg-[#09090b] hover:bg-[#18181b] text-white" size="lg">
                        {tab.content.buttonText}
                      </Button>
                    </Link>
                  ) : (
                    <Button className="mt-1 w-fit bg-[#09090b] hover:bg-[#18181b] text-white" size="lg">
                      {tab.content.buttonText}
                    </Button>
                  )}
                </div>

                {/* Right  stat card */}
                <div className="flex items-center justify-center border-t lg:border-t-0 lg:border-l border-[#e4e4e7] bg-white p-8 lg:p-12">
                  {tab.content.visual ?? (
                    <div className="text-center">
                      <div className="text-6xl font-extrabold tracking-tight text-[#09090b] leading-none">
                        {tab.content.stat}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground max-w-[220px] mx-auto leading-relaxed">
                        {tab.content.statLabel}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </div>
    </section>
  );
};

export { Feature108 };
export type { Feature108Props, Tab, TabContent };
