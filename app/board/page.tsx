import AuthGate from "@/components/ui/AuthGate";
import StudioFrame from "@/components/ui/StudioFrame";

export const metadata = {
  title: "Board | Gravitone",
};

// Stub from the platform-consolidation spark's foundations commit; the
// surface lands in its own work package.
export default function Page() {
  return (
    <AuthGate>
      <StudioFrame>
        <div />
      </StudioFrame>
    </AuthGate>
  );
}
