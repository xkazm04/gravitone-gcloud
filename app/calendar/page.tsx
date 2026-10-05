import { Suspense } from "react";

import AuthGate from "@/components/ui/AuthGate";
import StudioFrame from "@/components/ui/StudioFrame";

import CalendarView from "./CalendarView";

export const metadata = {
  title: "Calendar | Gravitone",
};

// The Suspense boundary is required, not decorative: CalendarView reads
// `useSearchParams` (the tab lives in the URL), and a
// client component that does so needs a boundary above it in Next 16.
export default function Page() {
  return (
    <AuthGate>
      <StudioFrame>
        <Suspense>
          <CalendarView />
        </Suspense>
      </StudioFrame>
    </AuthGate>
  );
}
