"use client";
import React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

interface FooterLink {
  label: string;
  href: string;
}

interface SocialLink {
  icon: React.ReactNode;
  href: string;
  label: string;
}

interface ModemFooterProps {
  brandName?: string;
  brandDescription?: string;
  socialLinks?: SocialLink[];
  navLinks?: FooterLink[];
  brandIcon?: React.ReactNode;
  className?: string;
}

export const ModemAnimatedFooter = ({
  brandName = "ChurnQ",
  brandDescription = "Your description here",
  socialLinks = [],
  navLinks = [],
  brandIcon,
  className,
}: ModemFooterProps) => {
  return (
    <section className={cn("relative w-full mt-0 overflow-hidden", className)}>
      <footer className="border-t bg-white mt-0 relative">
        <div className="max-w-7xl flex flex-col justify-between mx-auto min-h-[30rem] sm:min-h-[35rem] md:min-h-[40rem] relative p-4 py-10">
          <div className="flex flex-col mb-12 sm:mb-20 md:mb-0 w-full">
            <div className="w-full flex flex-col items-center">
              <div className="space-y-2 flex flex-col items-center flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[#09090b] text-3xl font-bold tracking-tight">
                    {brandName}
                  </span>
                </div>
                <p className="text-[#64748b] font-medium text-center w-full max-w-sm sm:w-96 px-4 sm:px-0 text-sm leading-relaxed">
                  {brandDescription}
                </p>
              </div>

              {socialLinks.length > 0 && (
                <div className="flex mb-8 mt-4 gap-4">
                  {socialLinks.map((link, index) => (
                    <a
                      key={index}
                      href={link.href}
                      className="text-[#94a3b8] hover:text-[#09090b] transition-colors"
                      {...(!link.href.startsWith("mailto:") && { target: "_blank", rel: "noopener noreferrer" })}
                    >
                      <div className="w-5 h-5 hover:scale-110 duration-300">
                        {link.icon}
                      </div>
                      <span className="sr-only">{link.label}</span>
                    </a>
                  ))}
                </div>
              )}

              {navLinks.length > 0 && (
                <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-medium text-[#64748b] max-w-full px-4">
                  {navLinks.map((link, index) =>
                    link.href.startsWith("mailto:") || link.href.startsWith("http") ? (
                      <a
                        key={index}
                        className="hover:text-[#09090b] duration-300"
                        href={link.href}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        key={index}
                        className="hover:text-[#09090b] duration-300"
                        href={link.href}
                      >
                        {link.label}
                      </Link>
                    )
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-20 md:mt-24 flex flex-col gap-2 md:gap-1 items-center justify-center md:flex-row md:items-center md:justify-between px-4 md:px-0">
            <p className="text-sm text-[#94a3b8] text-center md:text-left">
              © {new Date().getFullYear()} ChurnQ. All rights reserved.
            </p>
            <p className="text-sm text-[#94a3b8]">
              Built for SaaS founders · Performance pricing
            </p>
          </div>
        </div>

        {/* Large background brand name */}
        <div
          className="bg-gradient-to-b from-[#09090b]/10 via-[#09090b]/5 to-transparent bg-clip-text text-transparent leading-none absolute left-1/2 -translate-x-1/2 bottom-40 md:bottom-32 font-extrabold tracking-tighter pointer-events-none select-none text-center px-4"
          style={{ fontSize: "clamp(3rem, 12vw, 10rem)", maxWidth: "95vw" }}
        >
          {brandName.toUpperCase()}
        </div>

        {/* Bottom logo mark */}
        <div className="absolute hover:border-[#09090b] duration-300 drop-shadow-[0_0px_20px_rgba(0,0,0,0.12)] bottom-24 md:bottom-20 backdrop-blur-sm rounded-3xl bg-white/80 left-1/2 border-2 border-[#e4e4e7] flex items-center justify-center p-3 -translate-x-1/2 z-10">
          <div className="w-12 sm:w-16 md:w-24 h-12 sm:h-16 md:h-24 bg-white rounded-2xl flex items-center justify-center shadow-lg">
            {brandIcon}
          </div>
        </div>

        {/* Divider line */}
        <div className="absolute bottom-32 sm:bottom-34 h-px bg-gradient-to-r from-transparent via-[#e4e4e7] to-transparent w-full left-1/2 -translate-x-1/2" />

        {/* Bottom shadow fade */}
        <div className="bg-gradient-to-t from-white via-white/80 blur-[1em] to-white/40 absolute bottom-28 w-full h-24" />
      </footer>
    </section>
  );
};
