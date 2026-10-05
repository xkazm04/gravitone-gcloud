"use client";

// The Channels tab: what the engine reports about each channel — its status,
// every env var it reads (present or absent; a value never leaves the server,
// lib/publish/types.ts ChannelReadiness), the CLI it shells to — and the
// headless commands an agent runs instead of this page. A command table is
// data: each row is a verb and the exact line to paste.

import { Lock } from "lucide-react";

import { Loading, Table, type TableColumn } from "@/components/kit";
import { Hint } from "@/components/ui/signal";
import type { ChannelReadiness, ScheduleSlot } from "@/lib/publish/types";

import { nextFullHour } from "./calendarModel";
import { Badge, CHANNEL_STATUS_TONE, CHANNEL_STATUS_WORD, CopyButton, FetchFailure, ModeBadge } from "./parts";
import type { ExportList } from "./publishClient";
import type { Calendar, Load } from "./useCalendar";

const CLI = "npx tsx pipeline/publish.mts";

interface Cmd {
  id: string;
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
    { id: "channels", verb: "channels", line: `${CLI} channels --json` },
    { id: "exports", verb: "exports", line: `${CLI} exports --json` },
    { id: "list", verb: "list", line: `${CLI} list --json` },
    {
      id: "schedule",
      verb: "schedule",
      line: `${CLI} schedule --export ${exp?.id ?? "<exportId>"} --channel youtube --at ${at} --title "..."${project}`,
    },
    { id: "tick", verb: "tick", line: `${CLI} tick` },
    { id: "publish", verb: "publish", line: `${CLI} publish ${slot}` },
    { id: "reschedule", verb: "reschedule", line: `${CLI} reschedule ${slot} --at ${at}` },
    { id: "cancel", verb: "cancel", line: `${CLI} cancel ${slot}` },
    { id: "metrics", verb: "metrics", line: `${CLI} metrics --json` },
  ];
}

const CMD_COLUMNS: TableColumn<Cmd>[] = [
  { id: "verb", head: "Verb", cell: (c) => <span className="font-jetbrains">{c.verb}</span> },
  {
    id: "line",
    head: "Command",
    cell: (c) => (
      <span className="flex items-center gap-3">
        <code className="font-jetbrains grow break-all text-white">{c.line}</code>
        <CopyButton text={c.line} label={`Copy ${c.verb} command`} />
      </span>
    ),
  },
];

function Presence({ present }: { present: boolean }) {
  return present ? (
    <span className="font-jetbrains inline-flex items-center gap-1.5 text-emerald-200">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
      present
    </span>
  ) : (
    <span className="font-jetbrains inline-flex items-center gap-1.5 text-white/70">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full border border-dashed border-white/60" />
      absent
    </span>
  );
}

function ChannelCard({ c }: { c: ChannelReadiness }) {
  const locked = c.status === "not_wired";
  return (
    <article
      aria-labelledby={`ch-${c.id}`}
      className={`space-y-3 rounded-xl border p-4 ${locked ? "border-dashed border-white/15" : "border-white/10 bg-white/[0.02]"}`}
      data-testid={`calendar-channel-${c.id}`}
    >
      <header className="flex items-center gap-2">
        <h2 id={`ch-${c.id}`} className="font-hanken text-content text-white">
          {c.name}
        </h2>
        <Badge tone={CHANNEL_STATUS_TONE[c.status]}>
          {locked && <Lock className="h-3.5 w-3.5" aria-hidden />}
          {CHANNEL_STATUS_WORD[c.status]}
        </Badge>
        {c.note && (
          <Hint variant={locked ? "lock" : "info"} label={`${c.name} note`}>
            {c.note}
          </Hint>
        )}
      </header>
      <table className="w-full text-label">
        <caption className="sr-only">{c.name} environment and CLI</caption>
        <tbody>
          {c.env.map((e) => (
            <tr key={`env-${e.name}`} className="border-t border-white/[0.06]">
              <th scope="row" className="font-jetbrains py-1.5 pr-3 text-left font-normal break-all text-white/85">
                {e.name}
              </th>
              <td className="py-1.5 text-right">
                <Presence present={e.present} />
              </td>
            </tr>
          ))}
          {c.cli.map((e) => (
            <tr key={`cli-${e.name}`} className="border-t border-white/[0.06]">
              <th scope="row" className="font-jetbrains py-1.5 pr-3 text-left font-normal break-all text-white/85">
                <span className="mr-1.5 text-white/55">cli</span>
                {e.name}
              </th>
              <td className="py-1.5 text-right">
                <Presence present={e.present} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

export function ChannelsTab({ cal, now }: { cal: Calendar; now: number | null }) {
  if (!cal.channels) return <Loading />;
  if (!cal.channels.ok) return <FetchFailure r={cal.channels} onRetry={cal.reload} />;
  const { channels, mode } = cal.channels.data;
  const slots = cal.schedule?.ok ? cal.schedule.data.slots : [];
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <span className="font-jetbrains text-label text-white/70">PUBLISH_MODE</span>
        <ModeBadge mode={mode} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {channels.map((c) => (
          <ChannelCard key={c.id} c={c} />
        ))}
      </div>
      <section aria-labelledby="ch-cli" className="space-y-3">
        <h2 id="ch-cli" className="font-jetbrains text-label tracking-[0.14em] text-white/70 uppercase">
          Headless
        </h2>
        <Table label="Headless publish commands" columns={CMD_COLUMNS} rows={commands(cal.exports, slots, now)} />
      </section>
    </div>
  );
}
