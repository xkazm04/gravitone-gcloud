"use client";

import { useEffect, useRef } from "react";

import { useAnnounce } from "@/lib/announcer";

/** A failure surface. Severity is the difference between "this broke" (rose)
 *  and "this is a limit you should know about" (amber) — never the same colour,
 *  because a warning that looks like an error teaches people to ignore both.
 *
 *  AND NEVER THE SAME SILENCE. `role="status"` on the element that already
 *  holds its text announces nowhere: a live region has to exist EMPTY and then
 *  be mutated (lib/announcer.tsx, rule 1). So a warning/info is not a region
 *  at all. The ones that appear IN RESPONSE TO AN ACTION — "no tension found"
 *  when a run lands, "N turns cannot be argued" when a card is descoped — pass
 *  `announce`, and the title and body are handed to the one announcer, which
 *  owns a region that was mounted empty. Content that is merely present on
 *  load stays silent, as it is for a sighted reader who never watched it
 *  appear. `error` keeps `alert`, which is announced on insertion.
 *
 *  `announce` is polite and keyed by the notice's own words: the same words
 *  never speak twice in a session (announcer rule 4). */
export default function Notice({
  severity = "error",
  title,
  children,
  announce = false,
}: {
  severity?: "error" | "warning" | "info";
  title: string;
  children?: React.ReactNode;
  /** Action-triggered warning/info: speak it once through the announcer. */
  announce?: boolean;
}) {
  const say = useAnnounce();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!announce || severity === "error" || !ref.current) return;
    const el = ref.current.cloneNode(true) as HTMLElement;
    el.querySelectorAll("button").forEach((b) => b.remove());
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) say({ key: `notice:${severity}:${text}`, text });
  }, [announce, severity, say]);
  const tone =
    severity === "error"
      ? "border-rose-400/30 bg-rose-400/[0.06] text-rose-200"
      : severity === "warning"
        ? "border-amber-400/25 bg-amber-400/[0.05] text-amber-200"
        : "border-cyan-400/25 bg-cyan-400/[0.05] text-cyan-200";
  return (
    <div ref={ref} className={`rounded-xl border px-4 py-3 ${tone}`} role={severity === "error" ? "alert" : undefined}>
      <p className="font-jetbrains text-content tracking-[0.14em] uppercase">{title}</p>
      {children && <div className="mt-1.5 text-content leading-relaxed opacity-90">{children}</div>}
    </div>
  );
}
