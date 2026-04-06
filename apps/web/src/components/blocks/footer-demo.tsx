"use client";

import { Hexagon } from "lucide-react";
import { IconBrandGithub, IconBrandX } from "@/components/icons/social-brand";
import { Footer } from "@/components/ui/footer";

/** Example usage of `Footer` (shadcn Button + Tailwind). */
export function FooterDemo() {
  return (
    <div className="w-full">
      <Footer
        logo={<Hexagon className="h-10 w-10" />}
        brandName="Awesome Corp"
        socialLinks={[
          {
            icon: <IconBrandX className="h-5 w-5" />,
            href: "https://twitter.com",
            label: "Twitter",
          },
          {
            icon: <IconBrandGithub className="h-5 w-5" />,
            href: "https://github.com",
            label: "GitHub",
          },
        ]}
        mainLinks={[
          { href: "/products", label: "Products" },
          { href: "/about", label: "About" },
          { href: "/blog", label: "Blog" },
          { href: "/contact", label: "Contact" },
        ]}
        legalLinks={[
          { href: "/privacy", label: "Privacy" },
          { href: "/terms", label: "Terms" },
        ]}
        copyright={{
          text: "© 2026 Awesome Corp",
          license: "All rights reserved",
        }}
      />
    </div>
  );
}
