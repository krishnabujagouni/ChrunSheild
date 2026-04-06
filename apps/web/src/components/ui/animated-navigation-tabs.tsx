"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type NavTabItem = {
  id: number;
  tile: string;
  href: string;
};

type Props = {
  items: NavTabItem[];
  activeHref?: string;
};

export function AnimatedNavigationTabs({ items, activeHref }: Props) {
  const [isHover, setIsHover] = useState<NavTabItem | null>(null);

  return (
    <ul className="flex items-center justify-center">
      {items.map((item) => {
        const isActive = activeHref === item.href;
        return (
          <li key={item.id}>
            <a
              href={item.href}
              className={cn(
                "relative block py-2 duration-200 transition-colors hover:!text-primary",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
              onMouseEnter={() => setIsHover(item)}
              onMouseLeave={() => setIsHover(null)}
            >
              <div className="px-4 py-2 relative text-sm font-medium">
                {item.tile}
                {isHover?.id === item.id && (
                  <motion.div
                    layoutId="hover-bg"
                    className="absolute inset-0 w-full h-full bg-primary/10"
                    style={{ borderRadius: 6 }}
                  />
                )}
              </div>
              {isActive && (
                <motion.div
                  layoutId="active-underline"
                  className="absolute bottom-0 left-0 right-0 w-full h-0.5 bg-primary"
                />
              )}
              {isHover?.id === item.id && !isActive && (
                <motion.div
                  layoutId="hover-underline"
                  className="absolute bottom-0 left-0 right-0 w-full h-0.5 bg-primary/40"
                />
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
