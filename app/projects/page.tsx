import AuthGate from "@/components/ui/AuthGate";

import ProjectsView from "./ProjectsView";

export const metadata = {
  title: "Projects — Gravitone",
};

export default function Page() {
  return (
    <AuthGate>
      <ProjectsView />
    </AuthGate>
  );
}
