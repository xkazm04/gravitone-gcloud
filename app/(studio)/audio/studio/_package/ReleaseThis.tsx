"use client";

// "RELEASE THIS" ON A STUDIO TRACK (spark studio-to-release). The owner's ruling: pressing it IS the keep - the take
// is filed kept and finalized with the release title as its label, and a release is made from it, in one act - and
// the same surface moves to its packaging stage. Not an action kind in the agent's vocabulary: the agent may propose
// a release's fields, never keep a take or start a release. On the fixture side nothing is written; the button opens
// the scripted release of the session instead.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

/** The fixture's release for the scripted sessions (../../_release/_port/fixture.ts, the draft single). */
const FIXTURE_RELEASE = "rel-0000000000a1";

function to(stage: "package", release: string): string {
  const u = new URL(window.location.href);
  u.searchParams.set("stage", stage);
  u.searchParams.set("r", release);
  return `${u.pathname}?${u.searchParams.toString()}`;
}

export function ReleaseThis({ takeId }: { readonly takeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const press = async () => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("source") === "fixture") return router.push(to("package", FIXTURE_RELEASE));
    setBusy(true);
    setError(null);
    // Imported on press, not at the top: acts.ts reaches its zod door, which must stay out of this client chunk.
    const { releaseThisAct } = await import("../../_release/acts.ts");
    const r = await releaseThisAct({ takeId, sessionId: q.get("session") });
    setBusy(false);
    if (!r.ok) return setError(r.error.error);
    router.push(to("package", r.value.record.release.id));
  };
  return (
    <>
      <Button label="Release this" size="sm" tone="violet" pending={busy} onPress={() => void press()} />
      {error !== null && <ErrorLine message={error} />}
    </>
  );
}
