"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CopyButtonProps {
  text: string;
  className?: string;
  /** "overlay" = absolute-positioned over a code block (default), "inline" = sits inline next to text */
  variant?: "overlay" | "inline";
}

export function CopyButton({ text, className, variant = "overlay" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const button = (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => void copy()}
            disabled={copied}
            aria-label={copied ? "Copied" : "Copy to clipboard"}
            className={cn(
              "relative flex items-center justify-center rounded-md border transition-all duration-150 disabled:pointer-events-none",
              variant === "overlay"
                ? "absolute top-2.5 right-2.5 h-7 w-7 border-white/20 bg-white/10 text-white hover:bg-white/20"
                : "h-7 w-7 border-[#e2e8f0] bg-white text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a]",
              className,
            )}
          >
            <span
              className={cn(
                "absolute transition-all duration-150",
                copied ? "scale-100 opacity-100" : "scale-0 opacity-0",
              )}
            >
              <HugeiconsIcon
                icon={CheckmarkCircle01Icon}
                size={14}
                strokeWidth={1.5}
                className="text-emerald-500"
              />
            </span>
            <span
              className={cn(
                "absolute transition-all duration-150",
                copied ? "scale-0 opacity-0" : "scale-100 opacity-100",
              )}
            >
              <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.5} />
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent className="px-2 py-1 text-xs">
          {copied ? "Copied!" : "Click to copy"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return button;
}
