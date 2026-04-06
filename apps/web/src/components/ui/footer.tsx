import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FooterProps {
  logo: React.ReactNode;
  brandName: string;
  socialLinks: Array<{
    icon: React.ReactNode;
    href: string;
    label: string;
  }>;
  mainLinks: Array<{
    href: string;
    label: string;
  }>;
  legalLinks: Array<{
    href: string;
    label: string;
  }>;
  copyright: {
    text: string;
    license?: string;
  };
  /** Merged onto the root footer element (e.g. theme overrides). */
  className?: string;
}

export function Footer({
  logo,
  brandName,
  socialLinks,
  mainLinks,
  legalLinks,
  copyright,
  className,
}: FooterProps) {
  return (
    <footer
      className={cn(
        "border-t border-zinc-800 bg-zinc-950 pb-6 pt-16 text-zinc-400 lg:pb-8 lg:pt-24",
        className,
      )}
    >
      <div className="mx-auto max-w-[1060px] px-4 lg:px-8">
        <div className="md:flex md:items-start md:justify-between">
          <a href="/" className="flex items-center gap-x-2 text-zinc-50" aria-label={brandName}>
            {logo}
            <span className="text-xl font-bold">{brandName}</span>
          </a>
          {socialLinks.length > 0 && (
            <ul className="mt-6 flex list-none space-x-3 md:mt-0">
              {socialLinks.map((link, i) => (
                <li key={i}>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-10 w-10 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                    asChild
                  >
                    <a href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label}>
                      {link.icon}
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-6 border-t border-zinc-800 pt-6 md:mt-4 md:pt-8 lg:grid lg:grid-cols-10">
          <nav className="lg:col-[4/11] lg:mt-0">
            <ul className="-mx-2 -my-1 flex list-none flex-wrap lg:justify-end">
              {mainLinks.map((link, i) => (
                <li key={i} className="mx-2 my-1 shrink-0">
                  <a
                    href={link.href}
                    className="text-sm text-zinc-300 underline-offset-4 hover:text-white hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-6 lg:col-[4/11] lg:mt-0">
            <ul className="-mx-3 -my-1 flex list-none flex-wrap lg:justify-end">
              {legalLinks.map((link, i) => (
                <li key={i} className="mx-3 my-1 shrink-0">
                  <a
                    href={link.href}
                    className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-300 hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-6 whitespace-nowrap text-sm leading-6 text-zinc-500 lg:col-[1/4] lg:row-[1/3] lg:mt-0">
            <div>{copyright.text}</div>
            {copyright.license && <div>{copyright.license}</div>}
          </div>
        </div>
      </div>
    </footer>
  );
}
