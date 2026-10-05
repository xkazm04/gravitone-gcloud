import AuthGate from "@/components/ui/AuthGate";
import StudioFrame from "@/components/ui/StudioFrame";

import ArticlesView from "./ArticlesView";

export const metadata = {
  title: "Articles | Gravitone",
};

export default function Page() {
  return (
    <AuthGate>
      <StudioFrame>
        <ArticlesView />
      </StudioFrame>
    </AuthGate>
  );
}
