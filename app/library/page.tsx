import AuthGate from "@/components/ui/AuthGate";

import LibraryView from "./LibraryView";

export const metadata = {
  title: "Library — Gravitone",
};

export default function Page() {
  return (
    <AuthGate>
      <LibraryView />
    </AuthGate>
  );
}
