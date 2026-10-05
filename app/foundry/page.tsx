import { Suspense } from "react";

import AuthGate from "@/components/ui/AuthGate";

import FoundryView from "./FoundryView";

export const metadata = {
  title: "Foundry | Gravitone",
};

// The Suspense boundary is for `useVariant` (components/ui/VariantSwitch.tsx),
// which reads `useSearchParams` — Next 16 requires one above any client
// component that does, or the route bails out of static rendering.
export default function Page() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <FoundryView />
      </Suspense>
    </AuthGate>
  );
}
