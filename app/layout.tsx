import type { Metadata } from "next";
import {
  Instrument_Serif,
  Hanken_Grotesk,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";
import GravitoneTokens from "@/components/ui/GravitoneTokens";
import { AuthProvider } from "@/lib/useAuth";
import { AnnouncerProvider } from "@/lib/announcer";
import HarnessBridge from "@/components/ui/HarnessBridge";
import { readBellJobs } from "@/app/(studio)/_shell/bellJobs";
import DevInspector from "@/app/_dev-inspector/DevInspector";

const instrument = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-instrument", display: "swap" });
const hanken = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-hanken", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Gravitone: a content studio",
  description:
    "A content creation studio: one production walked through six steps (research, script, frames, motion, score, cut) over a library that knows where every asset came from.",
};

// THE ROOT, AS BOTH WORLDS SHARE IT (Phase 6 wave C). Until the cutover this was v1's root:
// it also mounted the unhandled-rejection bridge (lib/GlobalErrorBridge.tsx, whose only
// listener was the v1 bell's storage card), the bell's JobsProvider (an /api/events/stream
// subscription on every page, the landing's included, for a bell only StudioFrame drew), and
// the Almanac world's tokens. What stays is what the landing and the (studio) shell both
// read: the fonts, globals.css and its tokens, Firebase's auth context, the announcer the
// route error boundary speaks through, and the two dev-only seams.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={[instrument.variable, hanken.variable, jetbrains.variable].join(" ")}>
        {/* Design tokens straight from components/ui/tokens.ts, server-rendered
            as the first thing in the document so every --gt-* var globals.css
            reads, and the landing's --pc-* world, resolve on the first paint. (A
            <style> element here rather than a manual <head> - the App Router owns
            <head> through the Metadata API.) */}
        <GravitoneTokens />
        {/* The screen-reader announcement channel. Its two live regions must be
            mounted and EMPTY before any news exists - assistive technology
            announces mutations inside a region it is already observing, so a
            region that arrives carrying its text announces nowhere. It sits at the
            root because app/error.tsx, which renders within this layout, speaks
            through it when a screen fails to render. */}
        <AnnouncerProvider>
          {/* One auth context for both worlds. Mounted at the root - not per
              route - because the landing's sign-in reads it and the (studio)
              shell's handoff and sign-out read it too; a provider remounted on
              navigation would re-run onAuthStateChanged and flash every gate. */}
          <AuthProvider>
            {/* The live-app harness's control surface, installed on `window`
                ONLY in a non-production build with NEXT_PUBLIC_DEV_AUTH=1. It
                sits inside the auth provider because which account the app thinks
                is signed in is that provider's to answer. In any production
                bundle this component's effect body is unreachable and is dropped;
                see components/ui/HarnessBridge.tsx and the gate in
                pipeline/check-bundle.mjs. */}
            <HarnessBridge readJobs={readBellJobs} />
            {children}
            {/* Click a component, copy its source path - `;` then `i`, then
                right-click. Dev-only twice over: this condition is a literal
                Next inlines, so the import is dead code in any production
                build, and the overlay does nothing until the DEV_INSPECT
                loader has stamped the DOM (`npm run dev:inspect`). It reads
                nothing from the providers above it; it sits inside them only
                so it is the last thing painted. See app/_dev-inspector/. */}
            {process.env.NODE_ENV === "development" && <DevInspector />}
          </AuthProvider>
        </AnnouncerProvider>
      </body>
    </html>
  );
}
