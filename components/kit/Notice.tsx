"use client";

import { useEffect, useId } from "react";

import { useAnnounce } from "@/lib/announcer";

// THE THREE THINGS A LIST CAN BE INSTEAD OF A LIST: unreachable, loading, or empty.
//
//   ErrorBox  a real failure, verbatim, in Antares. `role="alert"` by default.
//   Loading   one muted word.
//   Command   the shell command that fills an empty list. The command IS the
//             answer, so nothing introduces it.
//
// An empty list is drawn with `Ghost` (components/ui/signal): an outline of the row
// that will fill it. There is no fourth thing here for prose.

export function ErrorBox({
  children,
  role = "alert",
  action,
}: {
  children: React.ReactNode;
  role?: "alert" | "status";
  /** A retry, as a `<Button variant="ghost">`. */
  action?: React.ReactNode;
}) {
  return (
    <div className="k-errbox" role={role}>
      <b>{children}</b>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

/** `role="status"` on the element that already holds "loading…" announces
 *  nowhere: a live region has to exist EMPTY and then be mutated
 *  (lib/announcer.tsx, rule 1). So the word is plain text and the announcer,
 *  whose region was mounted empty with the shell, speaks it. The key is per
 *  mount: each load is its own event, a re-render is not. */
export function Loading() {
  const say = useAnnounce();
  const key = useId();
  useEffect(() => {
    say({ key: `loading:${key}`, text: "loading…" });
  }, [say, key]);
  return <p className="k-muted">loading…</p>;
}

export function Command({ label, children }: { label: string; children: string }) {
  return (
    <div>
      <div className="k-caps k-muted" style={{ marginTop: 4 }}>{label}</div>
      <pre className="k-cmd">{children}</pre>
    </div>
  );
}
