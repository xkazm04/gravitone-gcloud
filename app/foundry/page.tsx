import AuthGate from "@/components/ui/AuthGate";

import FoundryView from "./FoundryView";

export const metadata = {
  title: "Foundry — Gravitone",
};

export default function Page() {
  return (
    <AuthGate>
      <FoundryView />
    </AuthGate>
  );
}
