"use client";

// THE SHELL PALETTE — go anywhere from anywhere. (Named ShellPalette.tsx, not
// Palette.tsx: beside palette.ts that pair differs only in case, which a
// case-insensitive checkout cannot hold and tsc rejects as TS1149.)
//
// Ctrl/⌘K (a deliberate global: it opens while focus is in an <input>) or the
// trigger button, which is also the navigation a phone-width window has beyond
// the scrolling module row. The index is derived (./palette.ts) from the stores
// the app already holds; this file only draws it.
//
// Loading is on OPEN, not on mount: the projects list and the Board's counts are
// real reads (IndexedDB, foundry summaries) and a shell that pays for them on
// every route would pay for a dialog most visits never open. `listProjects`, not
// `useProjects`, because the hook seeds a demo shelf on an empty account and a
// palette must never write.
//
// ARIA: the input is the combobox and keeps DOM focus; the list is a listbox and
// the highlighted option is named by aria-activedescendant (roving selection
// without moving focus, so typing never stops).

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { Tally } from "@/components/ui/signal";
import { useAuth } from "@/lib/useAuth";
import { useJobs } from "@/lib/jobs";
import { listProjects, type Project } from "@/lib/projects";
import { createRegistry } from "@/lib/board/registry";
import { SOURCE_ORDER } from "@/lib/board/source";
import type { BoardSourceId } from "@/lib/board/types";

import { useRegisteredCommands } from "./commands";
import {
  isPaletteChord,
  paletteIndex,
  pushRecent,
  rankEntries,
  readRecents,
  writeRecents,
  type Entry,
} from "./palette";

const KIND_LABEL: Record<Entry["kind"], string> = {
  place: "Place",
  "project-step": "Step",
  decision: "Decision",
  job: "Running",
  command: "Verb",
};
export default function ShellPalette({
  places,
}: {
  places: readonly { label: string; href: string }[];
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // The chord. Registered on window, with no target filter on purpose.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteChord(e)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search places, steps and decisions"
        aria-haspopup="dialog"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-white/70 transition hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300/70"
      >
        <Search className="h-4 w-4" aria-hidden />
      </button>
      <Modal open={open} onClose={close} title="Go to" className="max-w-xl">
        {/* Mounted only while open (Modal renders nothing otherwise), so the
            query, selection and every read below start fresh on each open
            without an effect that resets them. */}
        <PaletteBody places={places} onDone={close} />
      </Modal>
    </>
  );
}

function PaletteBody({
  places,
  onDone,
}: {
  places: readonly { label: string; href: string }[];
  onDone: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const { jobs } = useJobs();
  const commands = useRegisteredCommands();

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [boardCounts, setBoardCounts] = useState<Partial<Record<BoardSourceId, number | null>>>({});
  // Read once per open (this component mounts per open).
  const [recents] = useState(() => readRecents(uid));
  const listId = useId();

  // Counts move while the dialog is closed, so every open reads fresh.
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void listProjects(uid)
      .then((rows) => alive && setProjects(rows))
      .catch(() => alive && setProjects([]));
    const registry = createRegistry({ uid });
    for (const id of SOURCE_ORDER) {
      // A source that is unavailable or fails simply contributes no entry.
      void registry
        .get(id)
        .then((src) => src.count())
        .then((c) => alive && setBoardCounts((all) => ({ ...all, [id]: c.pending })))
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [uid]);

  const results = useMemo(
    () => rankEntries(paletteIndex({ projects, boardCounts, jobs, commands, places }), query, recents),
    [projects, boardCounts, jobs, commands, places, query, recents],
  );

  const optionId = (i: number) => `${listId}-o${i}`;
  const at = Math.min(active, Math.max(0, results.length - 1));

  const choose = (e: Entry) => {
    onDone();
    if (e.kind === "command") {
      e.run();
      return;
    }
    writeRecents(uid, pushRecent(recents, e.href));
    router.push(e.href);
  };

  return (
    <>
      <input
        autoFocus
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={results.length ? optionId(at) : undefined}
        aria-autocomplete="list"
        aria-label="Go to"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive(results.length ? (at + 1) % results.length : 0);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive(results.length ? (at - 1 + results.length) % results.length : 0);
          } else if (e.key === "Enter" && results[at]) {
            e.preventDefault();
            choose(results[at]);
          }
        }}
        className="font-jetbrains w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300/70"
      />
      <ul id={listId} role="listbox" aria-label="Results" className="mt-3 flex flex-col gap-0.5">
        {results.map((e, i) => (
          <li
            key={e.id}
            id={optionId(i)}
            role="option"
            aria-selected={i === at}
            onMouseMove={() => setActive(i)}
            onClick={() => choose(e)}
            className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
              i === at ? "bg-white/10 text-white" : "text-white/70"
            }`}
          >
            <span className="min-w-0 truncate">{e.label}</span>
            <span className="flex shrink-0 items-center gap-2">
              {e.facts.map((f, k) => (
                <Tally key={k} value={f.value} of={f.of} label={f.label} />
              ))}
              <span className="font-jetbrains text-label tracking-[0.14em] text-white/40 uppercase">
                {KIND_LABEL[e.kind]}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
