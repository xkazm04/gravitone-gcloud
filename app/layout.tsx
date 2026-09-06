import type { Metadata } from "next";
import {
  Instrument_Serif,
  Hanken_Grotesk,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import GravitoneTokens from "@/components/ui/GravitoneTokens";
import GlobalErrorBridge from "@/lib/GlobalErrorBridge";
import { AuthProvider } from "@/lib/useAuth";
import { JobsProvider } from "@/lib/jobs";
import { AnnouncerProvider } from "@/lib/announcer";
import HarnessBridge from "@/components/ui/HarnessBridge";
import DevInspector from "@/app/_dev-inspector/DevInspector";

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
        {/* Routes unhandled promise rejections to the storage-trouble bell so a
            fire-and-forget save that fails reaches the operator, not just the
            console. Render throws are caught by error.tsx / global-error.tsx. */}
        <GlobalErrorBridge />
        {/* One auth context for the whole app. Mounted at the root — not per
            route — because the landing page reads it too (its only CTA is
            sign-in), and because a provider remounted on navigation would
            re-run onAuthStateChanged and flash every gate. */}
        {/* Background work outlives the step that started it, so the provider
            sits at the root: navigating away from the studio must not cancel a
            research run, and the bell must keep counting while you are on the
            shelf. */}
        {/* The screen-reader announcement channel. It sits ABOVE JobsProvider
            because its two live regions must be mounted and EMPTY before any
            news exists — assistive technology announces mutations inside a
            region it is already observing, so a region that arrives carrying its
            text announces nowhere. Wrapping the tree also makes it the one
            writer: no component owns an aria-live node of its own, so two
            messages in the same breath cannot race and drop one. */}
        <AnnouncerProvider>
          <AuthProvider>
            <JobsProvider>
              {/* The live-app harness's control surface, installed on `window`
                  ONLY in a non-production build with NEXT_PUBLIC_DEV_AUTH=1.
                  It sits inside both providers because the two things it has to
                  report — which account the app thinks is signed in, and what
                  background work is outstanding — are theirs to answer. In any
                  production bundle this component's effect body is unreachable
                  and is dropped; see components/ui/HarnessBridge.tsx and the
                  gate in pipeline/check-bundle.mjs. */}
              <HarnessBridge />
              {children}
              {/* Click a component, copy its source path — `;` then `i`, then
                  right-click. Dev-only twice over: this condition is a literal
                  Next inlines, so the import is dead code in any production
                  build, and the overlay does nothing until the DEV_INSPECT
                  loader has stamped the DOM (`npm run dev:inspect`). It reads
                  nothing from the providers above it; it sits inside them only
                  so it is the last thing painted. See app/_dev-inspector/. */}
              {process.env.NODE_ENV === "development" && <DevInspector />}
            </JobsProvider>
          </AuthProvider>
        </AnnouncerProvider>
      </body>
    </html>
  );
}
