"use client";

// TRIAGE — the Sound lab's first module (round 4, platform-consolidation). The
// operator's purpose, verbatim: "judge all generated tracks, goal to use
// feedback for knowledge extension of prompt engineering (discovering which
// prompt techniques, genres and instruments are good choice to understand
// strengths of each audio provider)".
//
// So two faces over one read of the store:
//
//   judge      ./Judge.tsx      the queue, judged on the keys, the brief beside
//                               every take — each verdict is a ledger row.
//   strengths  ./Strengths.tsx  what those rows add up to, provider × facet,
//                               and the lessons a human confirms from them.
//
// The face lives in the URL (`?view=strengths`) so a strengths table can be
// linked to whoever is writing the next prompt.

import { useEffect, useState } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Gavel, Grid3x3 } from "lucide-react";

import { Ghost, Tally } from "@/components/ui/signal";
import type { SoundKind } from "@/lib/sound/types";

import { ErrorLine } from "../shared/shell";

import Judge from "./Judge";
import { queueOrder } from "./model";
import Strengths from "./Strengths";
import { useTriage } from "./useTriage";

type View = "judge" | "strengths";

export default function TriageModule({ kind }: { kind: SoundKind }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view: View = params.get("view") === "strengths" ? "strengths" : "judge";
  const setView = (v: View) => {
    const p = new URLSearchParams(params.toString());
    if (v === "judge") p.delete("view");
    else p.set("view", v);
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const data = useTriage(kind);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const waiting = queueOrder(data.takes, kind).length;
  const judged = data.takes.filter((t) => t.verdict !== "unjudged").length;

  return (
    <div data-module="triage" data-kind={kind} className="grid gap-4">
      <div role="radiogroup" aria-label="triage view" className="flex items-center gap-2">
        {(
          [
            ["judge", "judge", Gavel, waiting, waiting ? "amber" : "neutral"],
            ["strengths", "strengths", Grid3x3, judged, judged ? "cyan" : "neutral"],
          ] as const
        ).map(([id, word, Icon, n, tone]) => {
          const on = view === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`triage-${id}`}
              onClick={() => setView(id)}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-1.5 font-jetbrains text-label transition ${
                on
                  ? "border-white/15 bg-white/[0.06] text-white"
                  : "border-transparent text-white/50 hover:bg-white/[0.03] hover:text-white/80"
              }`}
            >
              <Icon className={`h-4 w-4 ${on ? "text-cyan-200" : ""}`} aria-hidden />
              {word}
              {/* The waiting count is already on the module's tab; only the
                  strengths face carries a number the rail does not. */}
              {data.ready && id === "strengths" && <Tally value={n} label="judged" tone={tone} />}
            </button>
          );
        })}
      </div>

      <ErrorLine text={data.error} />
      {!data.ready && !data.error ? (
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)_400px]">
          <Ghost shape="row" count={5} label="Reading the takes" />
          <Ghost shape="card" count={2} label="Reading the takes" />
          <Ghost shape="slot" count={3} label="Reading the takes" />
        </div>
      ) : data.error && !data.ready ? null : view === "judge" ? (
        <Judge data={data} kind={kind} now={now} />
      ) : (
        <Strengths kind={kind} takes={data.takes} />
      )}
    </div>
  );
}
