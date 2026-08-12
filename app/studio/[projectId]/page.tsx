import AuthGate from "@/components/ui/AuthGate";

import StudioView from "./StudioView";

// The project id is a path segment, not a query parameter.
//
// Why the move from `/studio?p=<id>`:
//  · a project is a RESOURCE, and a resource gets a path. Back/forward, history
//    entries and a copyable link all behave the way people expect them to.
//  · the tab title can be the project, not "Studio" repeated across every open
//    tab — which was the title-conflict worry, and it was well founded.
//  · `useSearchParams` forced a Suspense boundary on the whole view; a param
//    does not.
//
// Ids stay OPAQUE (`p-<base36>-<random>`, see lib/projects.ts). Slugifying the
// title would reintroduce the collision this move was meant to remove — two
// projects called "Why Bitcoin" would fight over one URL, and renaming a project
// would silently break every link to it.
export const metadata = {
  title: "Studio — Gravitone",
};

export default async function Page({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <AuthGate>
      <StudioView projectId={projectId} />
    </AuthGate>
  );
}
