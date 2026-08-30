import AuthGate from "@/components/ui/AuthGate";

import CreateWizard from "../../_projects/wizard/CreateWizard";

export const metadata = {
  title: "New project — Gravitone",
};

export default function Page() {
  return (
    <AuthGate>
      <CreateWizard />
    </AuthGate>
  );
}
