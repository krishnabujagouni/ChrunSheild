"use client";

import React, { useState, useEffect, useRef, forwardRef } from "react";
import { Mic, Paperclip, Send } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

const V = "#7C3AED";

const PLACEHOLDERS = [
  "What's the #1 reason subscribers cancel?",
  "Which retention offers are working best?",
  "Why do high-value subscribers leave?",
  "Are price-sensitive users worth saving?",
  "What should I fix to reduce churn this month?",
  "What do subscribers say about our pricing?",
];

const letterVariants = {
  initial: { opacity: 0, filter: "blur(12px)", y: 10 },
  animate: {
    opacity: 1, filter: "blur(0px)", y: 0,
    transition: { opacity: { duration: 0.25 }, filter: { duration: 0.4 }, y: { type: "spring" as const, stiffness: 80, damping: 20 } },
  },
  exit: {
    opacity: 0, filter: "blur(12px)", y: -10,
    transition: { opacity: { duration: 0.2 }, filter: { duration: 0.3 }, y: { type: "spring" as const, stiffness: 80, damping: 20 } },
  },
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  loading?: boolean;
  disabled?: boolean;
};

export const AIChatInput = forwardRef<HTMLInputElement, Props>(function AIChatInput(
  { value, onChange, onSend, loading = false, disabled = false },
  ref,
) {
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPlaceholder, setShowPlaceholder] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Cycle placeholder when idle
  useEffect(() => {
    if (isActive || value) return;
    const interval = setInterval(() => {
      setShowPlaceholder(false);
      setTimeout(() => {
        setPlaceholderIndex(prev => (prev + 1) % PLACEHOLDERS.length);
        setShowPlaceholder(true);
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, [isActive, value]);

  // Collapse when clicking outside (only if empty)
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        if (!value) setIsActive(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !loading && !disabled) onSend(value);
    }
  };

  const canSend = value.trim().length > 0 && !loading && !disabled;
  const expanded = isActive || !!value;

  return (
    <motion.div
      ref={wrapperRef}
      onClick={() => setIsActive(true)}
      animate={expanded ? {
        height: 80,
        boxShadow: "0 8px 32px 0 rgba(0,0,0,0.10)",
      } : {
        height: 56,
        boxShadow: "0 2px 8px 0 rgba(0,0,0,0.07)",
      }}
      transition={{ type: "spring", stiffness: 120, damping: 18 }}
      style={{
        width: "100%",
        borderRadius: 28,
        background: "#fff",
        border: "1.5px solid",
        borderColor: isActive ? V : "#e2e8f0",
        overflow: "hidden",
        cursor: "text",
        transition: "border-color 150ms ease",
      }}
    >
      {/* Input row */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 6px 0 4px", height: 54 }}>
        {/* Paperclip */}
        <button
          type="button"
          tabIndex={-1}
          title="Attach"
          style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <Paperclip size={18} />
        </button>

        {/* Text input + animated placeholder */}
        <div style={{ flex: 1, position: "relative" }}>
          <input
            ref={ref}
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsActive(true)}
            disabled={disabled || loading}
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 14,
              color: "#0f172a",
              padding: "8px 0",
              position: "relative",
              zIndex: 1,
              fontFamily: "inherit",
            }}
          />
          {/* Animated placeholder */}
          <div style={{ position: "absolute", left: 0, top: 0, height: "100%", display: "flex", alignItems: "center", pointerEvents: "none" }}>
            <AnimatePresence mode="wait">
              {showPlaceholder && !isActive && !value && (
                <motion.span
                  key={placeholderIndex}
                  style={{ position: "absolute", color: "#94a3b8", whiteSpace: "nowrap", fontSize: 14, zIndex: 0 }}
                  variants={{ initial: {}, animate: { transition: { staggerChildren: 0.025 } }, exit: { transition: { staggerChildren: 0.015, staggerDirection: -1 } } }}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  {PLACEHOLDERS[placeholderIndex].split("").map((char, i) => (
                    <motion.span key={i} variants={letterVariants} style={{ display: "inline-block" }}>
                      {char === " " ? "\u00A0" : char}
                    </motion.span>
                  ))}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Mic */}
        <button
          type="button"
          tabIndex={-1}
          title="Voice"
          style={{ width: 38, height: 38, borderRadius: "50%", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
          onMouseLeave={e => (e.currentTarget.style.background = "none")}
        >
          <Mic size={18} />
        </button>

        {/* Send */}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); if (canSend) onSend(value); }}
          disabled={!canSend}
          title="Send"
          style={{
            width: 38, height: 38,
            borderRadius: "50%",
            border: "none",
            background: canSend ? V : "#e2e8f0",
            cursor: canSend ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            transition: "background 150ms ease",
          }}
        >
          {loading ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round"
              style={{ animation: "cs-spin 0.8s linear infinite" }}>
              <path d="M12 2a10 10 0 0 1 10 10" />
              <style>{`@keyframes cs-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
            </svg>
          ) : (
            <Send size={15} color={canSend ? "#fff" : "#94a3b8"} />
          )}
        </button>
      </div>

      {/* Expanded hint row */}
      <motion.div
        animate={expanded ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.25, delay: expanded ? 0.06 : 0 }}
        style={{ paddingLeft: 52, paddingBottom: 10, pointerEvents: expanded ? "auto" : "none" }}
      >
        <span style={{ fontSize: 11, color: "#94a3b8" }}>
          Enter to send · Shift+Enter for new line
        </span>
      </motion.div>
    </motion.div>
  );
});
