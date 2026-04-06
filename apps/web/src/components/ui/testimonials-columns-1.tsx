"use client";
import React from "react";
import { motion } from "motion/react";

const AVATAR_PALETTES = [
  { bg: "#eef2ff", text: "#4338ca" },
  { bg: "#f0fdf4", text: "#166534" },
  { bg: "#fff7ed", text: "#9a3412" },
  { bg: "#fdf4ff", text: "#7e22ce" },
  { bg: "#f0f9ff", text: "#0369a1" },
  { bg: "#fef9c3", text: "#92400e" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#f1f5f9", text: "#334155" },
  { bg: "#fff1f2", text: "#9f1239" },
  { bg: "#ecfdf5", text: "#065f46" },
  { bg: "#fffbeb", text: "#78350f" },
  { bg: "#eff6ff", text: "#1e40af" },
];

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function InitialAvatar({ name, index }: { name: string; index: number }) {
  const palette = AVATAR_PALETTES[index % AVATAR_PALETTES.length];
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: "50%",
        background: palette.bg,
        color: palette.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 700,
        flexShrink: 0,
        border: `1.5px solid ${palette.text}28`,
        letterSpacing: "0.03em",
        userSelect: "none",
      }}
    >
      {getInitials(name)}
    </div>
  );
}

function Stars() {
  return (
    <div style={{ display: "flex", gap: 2, marginBottom: 14 }} aria-label="5 stars">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b" aria-hidden>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

export type Testimonial = {
  text: string;
  name: string;
  role: string;
};

export const TestimonialsColumn = (props: {
  style?: React.CSSProperties;
  testimonials: Testimonial[];
  duration?: number;
  startIndex?: number;
}) => {
  return (
    <div style={props.style}>
      <motion.div
        animate={{ translateY: "-50%" }}
        transition={{
          duration: props.duration || 10,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 14 }}
      >
        {[...new Array(2)].fill(0).map((_, idx) => (
          <React.Fragment key={idx}>
            {props.testimonials.map(({ text, name, role }, i) => (
              <div
                key={i}
                style={{
                  padding: "22px 20px",
                  borderRadius: 14,
                  border: "1px solid #e4e4e7",
                  maxWidth: 290,
                  width: "100%",
                  background: "#ffffff",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
                }}
              >
                <Stars />
                <p style={{
                  margin: "0 0 18px",
                  fontSize: 13.5,
                  color: "#18181b",
                  lineHeight: 1.7,
                }}>
                  {text}
                </p>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  paddingTop: 14,
                  borderTop: "1px solid #f4f4f5",
                }}>
                  <InitialAvatar name={name} index={(props.startIndex ?? 0) + i} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#09090b", lineHeight: 1.3 }}>{name}</div>
                    <div style={{ fontSize: 12, color: "#71717a", lineHeight: 1.4, marginTop: 2 }}>{role}</div>
                  </div>
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </motion.div>
    </div>
  );
};
