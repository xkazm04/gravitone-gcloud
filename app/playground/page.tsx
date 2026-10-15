import { Suspense } from "react";

import { redirect } from "next/navigation";

import AuthGate from "@/components/ui/AuthGate";
import StudioFrame from "@/components/ui/StudioFrame";

import { boardFor, packetIdOf } from "../(studio)/_shell/links.ts";
import PlaygroundView from "./PlaygroundView";

export const metadata = {
  title: "Sound lab | Gravitone",
};

// The view reads `?m=` (module) and `?kind=` through useSearchParams, which
// needs a Suspense boundary above it in this Next (AGENTS.md; builder rules).
//
// TRIAGE IS A BOARD PACKET NOW (Phase 3, decision 10): judging the unjudged takes
// is the audio pile on the Floor, decided on the Board, so `?m=triage` - the
// address skills and the Floor's v1 links still carry - opens that packet. The
// bare pile resolves to the pile it is now (wave B ruling 4).
export default async function Page({ searchParams }: { readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>> }) {
  if ((await searchParams)["m"] === "triage") redirect(boardFor(packetIdOf("audio", "audio/triage")));
  return (
    <AuthGate>
      <StudioFrame>
        <Suspense fallback={null}>
          <PlaygroundView />
        </Suspense>
      </StudioFrame>
    </AuthGate>
  );
}
