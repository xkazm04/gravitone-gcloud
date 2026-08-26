import AuthGate from "@/components/ui/AuthGate";

import PlaygroundView from "./PlaygroundView";

export const metadata = {
  title: "Playground — Gravitone",
};

export default function Page() {
  return (
    <AuthGate>
      <PlaygroundView />
    </AuthGate>
  );
}
