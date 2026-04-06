"use client";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SaveButtonProps {
  label?: string;
  savedLabel?: string;
  className?: string;
  size?: "sm" | "default";
}

export function SaveButton({
  label = "Save",
  savedLabel = "Saved",
  className,
  size = "default",
}: SaveButtonProps) {
  const [saved, setSaved] = useState(false);

  function handleClick() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="submit"
            onClick={handleClick}
            className={cn(
              "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
              size === "sm" ? "h-9 px-3 text-xs" : "h-9 px-4 text-sm",
              saved
                ? "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-50"
                : "bg-[#7C3AED] text-white hover:bg-[#6d28d9] shadow-sm shadow-black/5",
              className,
            )}
          >
            {saved ? savedLabel : label}
          </button>
        </TooltipTrigger>
        <TooltipContent className="px-2 py-1 text-xs">
          {saved ? "Changes saved!" : "Save changes"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
