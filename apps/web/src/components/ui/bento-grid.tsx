"use client";

import { cn } from "@/lib/utils";

export interface BentoItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  status?: string;
  tags?: string[];
  meta?: string;
  cta?: string;
  colSpan?: number;
  hasPersistentHover?: boolean;
}

interface BentoGridProps {
  items: BentoItem[];
  className?: string;
}

function BentoGrid({ items, className }: BentoGridProps) {
  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-3", className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className={cn(
            "group relative p-5 rounded-2xl overflow-hidden transition-all duration-300",
            "border border-gray-100/80 bg-white",
            "hover:shadow-[0_4px_20px_rgba(0,0,0,0.07)]",
            "hover:-translate-y-0.5 will-change-transform",
            item.colSpan === 2 ? "md:col-span-2" : "col-span-1",
            item.hasPersistentHover && "shadow-[0_4px_20px_rgba(0,0,0,0.06)] -translate-y-0.5",
          )}
        >
          {/* dot grid overlay on hover */}
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-300",
              item.hasPersistentHover ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.025)_1px,transparent_1px)] bg-[length:4px_4px]" />
          </div>

          {/* gradient border on hover */}
          <div
            className={cn(
              "absolute inset-0 -z-10 rounded-2xl p-px bg-gradient-to-br from-transparent via-gray-200/60 to-transparent transition-opacity duration-300",
              item.hasPersistentHover ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          />

          <div className="relative flex flex-col space-y-4">
            {/* Icon + status row */}
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-50 border border-gray-100 group-hover:border-gray-200 transition-all duration-300">
                {item.icon}
              </div>
              {item.status && (
                <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-gray-50 text-gray-500 border border-gray-100 group-hover:bg-gray-100 transition-colors duration-300">
                  {item.status}
                </span>
              )}
            </div>

            {/* Title + meta + description */}
            <div className="space-y-1.5">
              <h3 className="font-semibold text-gray-900 tracking-tight text-[15px] leading-snug">
                {item.title}
                {item.meta && (
                  <span className="ml-2 text-xs text-gray-400 font-normal">{item.meta}</span>
                )}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">{item.description}</p>
            </div>

            {/* Tags + CTA */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex flex-wrap gap-1.5">
                {item.tags?.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md text-xs text-gray-400 bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors duration-200"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0 ml-2">
                {item.cta ?? "Learn more →"}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export { BentoGrid };
