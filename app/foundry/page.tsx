import AuthGate from "@/components/ui/AuthGate";

import FoundryView from "./FoundryView";

export const metadata = {
  title: "Foundry | Gravitone",
};

// No Suspense boundary since round 3: it stood above FoundryView for
// `useVariant`'s `useSearchParams`, and the `?v=` switch went when the operator
// picked the Pipeline direction. Nothing under this route reads search params
// now; one that starts to must put the boundary back (Next 16 bails the route
// out of static rendering without it).
export default function Page() {
  return (
    <AuthGate>
      <FoundryView />
    </AuthGate>
  );
}
