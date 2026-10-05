"use client";

// The Channels tab: what the engine reports about each channel — its status,
// every env var it reads (present or absent, by NAME; a value never leaves the
// server, lib/publish/types.ts ChannelReadiness), the CLI it shells to — and
// the headless commands an agent runs instead of this page. A command table is
// data: each row is a verb and the exact line to paste.
//
// The names on this page arrive from GET /api/publish/channels at runtime and
// are never spelled in this file: `npm run check:bundle` fails a browser chunk
// that carries a server-only variable name, and a client-side copy of the list
// is how one would get there (publishClient.ts header).

import { Lock, SquareTerminal } from "lucide-react";
import { motion } from "motion/react";

import { usePrefersReducedMotion } from "@/components/ui/motionPreference";
import { Panel } from "@/components/ui/Primitives";
import { PipRow, Tally } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import type { ChannelReadiness, ScheduleSlot } from "@/lib/publish/types";

import { nextFullHour } from "./calendarModel";
import type { ExportList } from "./publishClient";
import { ChannelStatusChip, ChannelTile, CopyButton, FailureCard, SectionHead } from "./ui";
import type { Calendar, Load } from "./useCalendar";

const CLI = "npx tsx pipeline/publish.mts";

interface Cmd {
  verb: string;
  line: string;
}

/** The headless surface, verb for verb as pipeline/publish.mts's own header
 *  states it. The schedule line is filled with a real export id and the next
 *  full hour when both are known (and `--project` when the export names none,
 *  which the CLI then requires), so it pastes as-is. */
function commands(exports: Load<ExportList>, slots: readonly ScheduleSlot[], now: number | null): Cmd[] {
  const exp = exports?.ok ? exports.data.exports[0] : undefined;
  const at = now === null ? "<ISO>" : nextFullHour(new Date(now)).toISOString();
  const slot = slots.find((s) => s.status === "scheduled")?.id ?? "<slotId>";
  const project = exp && !exp.projectId ? " --project <projectId>" : "";
  return [
    { verb: "channels", line: `${CLI} channels --json` },
    { verb: "exports", line: `${CLI} exports --json` },
    { verb: "list", line: `${CLI} list --json` },
    { verb: "schedule", line: `${CLI} schedule --export ${exp?.id ?? "<exportId>"} --channel youtube --at ${at} --title "..."${project}` },
    { verb: "tick", line: `${CLI} tick` },
    { verb: "publish", line: `${CLI} publish ${slot}` },
    { verb: "reschedule", line: `${CLI} reschedule ${slot} --at ${at}` },
    { verb: "cancel", line: `${CLI} cancel ${slot}` },
    { verb: "metrics", line: `${CLI} metrics --json` },
  ];
}

function Presence({ name, present, kind }: { name: string; present: boolean; kind: "env" | "cli" }) {
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.03]">
      <span
        aria-hidden
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          present ? "bg-emerald-300 shadow-[0_0_10px_var(--gt-accent-emerald)]" : "border-[1.5px] border-white/35"
        }`}
      />
      <span className={`font-jetbrains min-w-0 grow truncate text-label ${present ? "text-white/85" : "text-white/55"}`}>
        {kind === "cli" && <span className="mr-1.5 text-white/35">$</span>}
        {name}
      </span>
      <span className={`font-jetbrains shrink-0 text-label ${present ? "text-emerald-200/90" : "text-white/40"}`}>{present ? "set" : "absent"}</span>
    </li>
  );
}

function ChannelCard({ c, index, reduced }: { c: ChannelReadiness; index: number; reduced: boolean }) {
  const locked = c.status === "not_wired";
  const set = c.env.filter((e) => e.present).length;
  return (
    <motion.article
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: reduced ? 0 : index * 0.06, ease: EASE }}
      aria-labelledby={`ch-${c.id}`}
      data-testid={`calendar-channel-${c.id}`}
      className={`relative flex flex-col overflow-hidden rounded-2xl border backdrop-blur-[14px] ${
        locked
          ? "border-white/[0.07] bg-[repeating-linear-gradient(135deg,var(--gt-wash)_0_1px,transparent_1px_12px)]"
          : "border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.015]"
      }`}
    >
      {!locked && (
        <span
          aria-hidden
          className={`pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full blur-3xl ${c.status === "live" ? "bg-emerald-400/15" : "bg-cyan-400/15"}`}
        />
      )}
      <header className="relative flex items-start gap-4 p-5 pb-4">
        <ChannelTile id={c.id} status={c.status} size="lg" />
        <div className="min-w-0 space-y-2">
          <h2 id={`ch-${c.id}`} className={`font-instrument text-3xl leading-none ${locked ? "text-white/60" : "text-white"}`}>
            {c.name}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <ChannelStatusChip status={c.status} />
            <PipRow
              states={c.env.map((e) => (e.present ? "filled" : "hollow"))}
              label={`${set} of ${c.env.length} credentials set`}
            />
          </div>
        </div>
      </header>
      {c.note && (
        <p className={`font-hanken relative mx-5 rounded-xl border px-3 py-2 text-label ${locked ? "border-white/[0.07] bg-[var(--gt-ink)]/50 text-white/55" : c.status === "dry" ? "border-amber-300/20 bg-amber-400/[0.05] text-amber-100/85" : "border-emerald-300/20 bg-emerald-400/[0.05] text-emerald-100/85"}`}>
          {locked && <Lock aria-hidden className="mr-1.5 mb-0.5 inline h-3.5 w-3.5" />}
          {c.note}
        </p>
      )}
      <div className="relative mt-4 space-y-4 px-3 pb-4">
        <div>
          <p className="font-jetbrains mb-1 px-2 text-label tracking-[0.18em] text-white/35 uppercase">
            env <span className="tracking-normal text-white/30">{set}/{c.env.length}</span>
          </p>
          <ul aria-label={`${c.name} environment`}>
            {c.env.map((e) => (
              <Presence key={e.name} name={e.name} present={e.present} kind="env" />
            ))}
          </ul>
        </div>
        {c.cli.length > 0 && (
          <div>
            <p className="font-jetbrains mb-1 px-2 text-label tracking-[0.18em] text-white/35 uppercase">cli</p>
            <ul aria-label={`${c.name} command-line tools`}>
              {c.cli.map((e) => (
                <Presence key={e.name} name={e.name} present={e.present} kind="cli" />
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.article>
  );
}

export function ChannelsTab({ cal, now }: { cal: Calendar; now: number | null }) {
  const reduced = usePrefersReducedMotion();
  if (!cal.channels) {
    return (
      <div aria-busy="true" aria-label="Loading channels" className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[24rem] animate-pulse rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.04] to-white/[0.01]" />
        ))}
      </div>
    );
  }
  if (!cal.channels.ok) return <FailureCard r={cal.channels} onRetry={cal.reload} />;
  const { channels } = cal.channels.data;
  const slots = cal.schedule?.ok ? cal.schedule.data.slots : [];
  const cmds = commands(cal.exports, slots, now);
  const ready = channels.filter((c) => c.status !== "not_wired").length;

  return (
    <div className="space-y-8">
      <section aria-label="Channels" className="space-y-3">
        <SectionHead title="Channels">
          <Tally value={ready} of={channels.length} label="wired" tone={ready ? "cyan" : "neutral"} />
        </SectionHead>
        <div className="grid gap-4 lg:grid-cols-3">
          {channels.map((c, i) => (
            <ChannelCard key={c.id} c={c} index={i} reduced={reduced} />
          ))}
        </div>
      </section>

      <section aria-labelledby="ch-cli" className="space-y-3">
        <SectionHead id="ch-cli" title="Headless">
          <Tally value={cmds.length} label="verbs" />
        </SectionHead>
        <Panel className="overflow-hidden">
          <div className="flex items-center gap-2.5 border-b border-white/6 bg-white/[0.02] px-5 py-3">
            <SquareTerminal aria-hidden className="h-4 w-4 text-cyan-300/80" />
            <span className="font-jetbrains text-label text-white/70">pipeline/publish.mts</span>
            <span className="font-jetbrains ml-auto text-label text-white/35">--json · exit 0 ok · 1 refused · 2 usage</span>
          </div>
          <table className="w-full border-collapse">
            <caption className="sr-only">Headless publish commands</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Verb</th>
                <th scope="col">Command</th>
                <th scope="col">Copy</th>
              </tr>
            </thead>
            <tbody>
              {cmds.map((c) => (
                <tr key={c.verb} className="group border-b border-white/[0.05] last:border-b-0 hover:bg-white/[0.025]">
                  <th scope="row" className="w-36 py-2.5 pr-3 pl-5 text-left align-middle font-normal">
                    <span className="font-jetbrains rounded-md border border-cyan-300/20 bg-cyan-400/[0.07] px-2 py-0.5 text-label text-cyan-100/90">
                      {c.verb}
                    </span>
                  </th>
                  <td className="py-2.5 pr-3 align-middle">
                    <code className="font-jetbrains text-label break-all text-white/80">
                      <span className="text-white/35">{CLI} </span>
                      {c.line.slice(CLI.length + 1)}
                    </code>
                  </td>
                  <td className="w-28 py-2.5 pr-5 text-right align-middle">
                    <CopyButton text={c.line} label={`Copy ${c.verb} command`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </section>
    </div>
  );
}
