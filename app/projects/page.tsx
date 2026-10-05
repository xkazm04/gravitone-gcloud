import { Suspense } from "react";

import AuthGate from "@/components/ui/AuthGate";

import ProjectsView from "./ProjectsView";

export const metadata = {
  title: "Projects | Gravitone",
};

// The Suspense boundary is required, not decorative: the shelf reads its query
// and the dev-only `?seed=` from `useSearchParams` (app/_projects/useShelf.ts,
// ./ProjectsView.tsx), and a production build of a route that
// reads search params outside a boundary fails to prerender
// (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md).
export default function Page() {
  return (
    <AuthGate>
      <Suspense fallback={null}>
        <ProjectsView />
      </Suspense>
    </AuthGate>
  );
}
