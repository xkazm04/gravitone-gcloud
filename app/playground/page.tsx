import { Suspense } from "react";

import AuthGate from "@/components/ui/AuthGate";
import StudioFrame from "@/components/ui/StudioFrame";

import PlaygroundView from "./PlaygroundView";

export const metadata = {
  title: "Sound lab | Gravitone",
};

// The view reads `?v=` through useSearchParams (the prototype switch), which
// needs a Suspense boundary above it in this Next (AGENTS.md; builder rules).
export default function Page() {
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
