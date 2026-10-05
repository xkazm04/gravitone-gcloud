import AuthGate from "@/components/ui/AuthGate";
import StudioFrame from "@/components/ui/StudioFrame";

import RunView from "../RunView";

export const metadata = {
  title: "Article | Gravitone",
};

export default async function Page({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return (
    <AuthGate>
      <StudioFrame>
        <RunView runId={runId} />
      </StudioFrame>
    </AuthGate>
  );
}
