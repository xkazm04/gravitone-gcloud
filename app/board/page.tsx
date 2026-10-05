import { Suspense } from "react";

import AuthGate from "@/components/ui/AuthGate";
import StudioFrame from "@/components/ui/StudioFrame";

import BoardView from "./BoardView";

export const metadata = {
  title: "Board | Gravitone",
};

// The view reads `?src=&st=&i=` through useSearchParams, which needs a
// Suspense boundary above it in this Next (AGENTS.md; builder rules).
export default function Page() {
  return (
    <AuthGate>
      <StudioFrame>
        <Suspense fallback={null}>
          <BoardView />
        </Suspense>
      </StudioFrame>
    </AuthGate>
  );
}
