"use client";

import { PricingCard } from "@/components/ui/pricing-card";

/** Example usage of `PricingCard` (shadcn + Tailwind + Motion). */
export function PricingCardBasic() {
  return (
    <PricingCard
      title="Ultimate Plan"
      description="Access everything you need to grow your business."
      price={99}
      originalPrice={199}
      features={[
        {
          title: "Features",
          items: [
            "Unlimited Projects",
            "Advanced Analytics",
            "Team Collaboration",
            "Custom Branding",
          ],
        },
        {
          title: "Perks",
          items: [
            "24/7 Support",
            "Priority Assistance",
            "Exclusive Webinars",
            "Early Feature Access",
          ],
        },
      ]}
      buttonText="Get Started"
      onButtonClick={() => {
        // eslint-disable-next-line no-console -- demo only
        console.log("Button clicked");
      }}
    />
  );
}
