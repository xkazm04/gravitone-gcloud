import type { Metadata } from "next";
import {
  Instrument_Serif,
  Hanken_Grotesk,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import GravitoneTokens from "@/components/ui/GravitoneTokens";
import { AuthProvider } from "@/lib/useAuth";
import { JobsProvider } from "@/lib/jobs";

const instrument = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Gravitone — a content studio",
  description:
    "A content creation studio: one production walked through five steps — research, script, frames, score, cut — over a library that knows where every asset came from.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={[instrument.variable, hanken.variable, jetbrains.variable].join(" ")}>
        {/* Design tokens straight from components/ui/tokens.ts, server-rendered
            as the first thing in the document so every --gt-* var globals.css
            reads resolves on the first paint. (A <style> element here rather
            than a manual <head> — the App Router owns <head> through the
            Metadata API.) */}
        <GravitoneTokens />
        {/* One auth context for the whole app. Mounted at the root — not per
            route — because the landing page reads it too (its only CTA is
            sign-in), and because a provider remounted on navigation would
            re-run onAuthStateChanged and flash every gate. */}
        {/* Background work outlives the step that started it, so the provider
            sits at the root: navigating away from the studio must not cancel a
            research run, and the bell must keep counting while you are on the
            shelf. */}
        <AuthProvider>
          <JobsProvider>{children}</JobsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
