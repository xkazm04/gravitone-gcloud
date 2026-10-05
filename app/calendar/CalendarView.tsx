"use client";

// /calendar — publishing: the schedule, the channels a headless agent can post
// to, and what came back from them. The tab lives in the URL (`?tab=`), beside
// the prototype variant (`?v=`), so a link opens the same screen.
//
// Drawn in the kit's Obsidian world (`WorldRoot world="obsidian"`), the way
// app/foundry/FoundryView.tsx is since its legacy-palette revert: kit parts in
// this app's own tokens.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { ToastTray, useToast } from "@/components/kit";
import { WorldRoot } from "@/components/kit/WorldRoot";
import { VariantSwitch } from "@/components/ui/VariantSwitch";
import { TabRail, type TabDef } from "@/components/ui/signal";

import { needsDecision } from "./calendarModel";
import { ChannelsTab } from "./ChannelsTab";
import { MetricsTab } from "./MetricsTab";
import { ModeBadge, SourceBadge } from "./parts";
import { ScheduleTab } from "./ScheduleTab";
import { useCalendar, useNow } from "./useCalendar";

type Tab = "schedule" | "channels" | "metrics";
const TABS: readonly Tab[] = ["schedule", "channels", "metrics"];
const parseTab = (v: string | null): Tab => (TABS.includes(v as Tab) ? (v as Tab) : "schedule");

export default function CalendarView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = parseTab(params.get("tab"));
  const cal = useCalendar();
  const now = useNow();
  const { toasts, push, dismiss } = useToast();

  const setTab = useCallback(
    (t: Tab) => {
      const p = new URLSearchParams(params.toString());
      if (t === "schedule") p.delete("tab");
      else p.set("tab", t);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const slots = cal.schedule?.ok ? cal.schedule.data.slots : null;
  const decide = slots ? slots.filter(needsDecision).length : null;
  const chans = cal.channels?.ok ? cal.channels.data.channels : null;
  const ready = chans ? chans.filter((c) => c.status !== "not_wired").length : null;
  const pubs = cal.metrics?.ok ? cal.metrics.data.publications.length : null;

  const tabs: TabDef<Tab>[] = [
    {
      id: "schedule",
      label: "Schedule",
      testId: "calendar-tab-schedule",
      tally: decide === null ? undefined : { value: decide, label: "decide", tone: decide > 0 ? "rose" : "neutral" },
      tone: decide ? "rose" : undefined,
    },
    {
      id: "channels",
      label: "Channels",
      testId: "calendar-tab-channels",
      tally: ready === null || !chans ? undefined : { value: ready, of: chans.length, label: "ready", tone: "cyan" },
    },
    {
      id: "metrics",
      label: "Metrics",
      testId: "calendar-tab-metrics",
      tally: pubs === null ? undefined : { value: pubs, label: "pubs" },
    },
  ];

  const fixture = [cal.schedule, cal.channels, cal.exports, cal.metrics].some((r) => r?.ok && r.source === "fixture");

  return (
    <WorldRoot world="obsidian">
      <main tabIndex={-1} className="space-y-6 pb-28">
        <h1 className="sr-only">Calendar</h1>
        <TabRail
          label="calendar"
          tabs={tabs}
          active={tab}
          onSelect={setTab}
          trailing={
            <span className="flex items-center gap-2">
              <SourceBadge source={fixture ? "fixture" : null} />
              <ModeBadge mode={cal.channels?.ok ? cal.channels.data.mode : null} />
            </span>
          }
        />
        <div role="tabpanel" aria-label={tab}>
          {tab === "schedule" ? (
            <ScheduleTab cal={cal} now={now} push={push} />
          ) : tab === "channels" ? (
            <ChannelsTab cal={cal} now={now} />
          ) : (
            <MetricsTab cal={cal} push={push} />
          )}
        </div>
      </main>
      {tab === "schedule" && <VariantSwitch labels={["Week", "Lanes", "Agenda"]} />}
      <ToastTray toasts={toasts} onDismiss={dismiss} />
    </WorldRoot>
  );
}
