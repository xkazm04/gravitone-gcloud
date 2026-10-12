"use client";

// The glass panel and the entrance rise: Glass, Rise. Split out of ui.tsx (which
// re-exports them) so the door stays under the 200-line cap.

import { motion } from "motion/react";

import { EASE, SURFACE } from "@/components/ui/tokens";
import { usePrefersReducedMotion } from "@/components/ui/motionPreference";

/* ── Surfaces ─────────────────────────────────────────────────────────────── */

/** The glass panel, at the route's own weight. `SURFACE` is the one spelling. */
export function Glass({ children, className = "", as: Tag = "div", id }: { children: React.ReactNode; className?: string; as?: "div" | "section" | "aside" | "article"; id?: string }) {
  return (
    <Tag id={id} className={`${SURFACE} rounded-2xl ${className}`}>
      {children}
    </Tag>
  );
}

/** Entrance-only rise, reduced-motion safe. 220ms on the one curve. */
export function Rise({ children, className = "", delay = 0, as = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" }) {
  const still = usePrefersReducedMotion();
  const M = as === "section" ? motion.section : as === "li" ? motion.li : motion.div;
  return (
    <M
      className={className}
      initial={still ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE, delay: still ? 0 : delay }}
    >
      {children}
    </M>
  );
}
