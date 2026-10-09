// The Paper Cosmos's two voices, self-hosted by next/font (no CDN at runtime):
// Fraunces for display (titles, the banner, the wordmark) and DM Sans for the
// UI. Exposed as CSS variables that cosmos.css's --disp and --ui read first.
//
// FRAUNCES IS LOADED AT THE WEIGHTS THE DESIGN RENDERED, NOT WITH ITS SOFT
// AXIS. The contest variant asked for font-variation-settings:'SOFT' 100, but it
// loaded three static files (400, 600, and Black for 800-900) that carry no
// variation axes, so what the owner chose was Fraunces at SOFT 0 and optical
// size 14. Loading the SOFT axis here made every title visibly rounder than the
// chosen design (measured side by side, 2026-10-07); a weight list gets the
// same instances the variant drew. See cosmos.css's WEIGHTS note for 700/800.

import { DM_Sans, Fraunces } from "next/font/google";

export const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "900"],
  variable: "--pc-font-disp",
  display: "swap",
});

export const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--pc-font-ui",
  display: "swap",
});
