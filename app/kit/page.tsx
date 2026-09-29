import AuthGate from "@/components/ui/AuthGate";

import KitView from "./KitView";

export const metadata = {
  title: "Kit | Gravitone",
};

export default function Page() {
  return (
    <AuthGate>
      <KitView />
    </AuthGate>
  );
}
