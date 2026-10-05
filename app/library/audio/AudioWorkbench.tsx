"use client";

// THE AUDIO WORKBENCH — the Library's audio module (ModuleId "audio"), "the
// Recipe Book": terms on the left, the ledger in the middle, the take and its
// recipe on the right.
//
// This is the contest entry the module was judged on (the arena's B/variant-3,
// previously mounted here verbatim in an iframe beside a second, React
// implementation) ported into React and made the only one. The entry's
// numbers were already all read off one model (core.js) and its only page
// state was view state (app.js); the port keeps that split:
//
//   ./book.ts           the model — verdicts, vocabulary, prompts, variations,
//                       references — pure, read off the takes every render
//   ./useAudioShelf.ts  the takes, on lib/assets (verdicts and scores ride on
//                       Asset.meta through updateAssetMeta; returned files on
//                       putUploads), seeded once from ./audioSeed.ts
//   ./bookStore.ts      the team's hand on each term, and the drafts sent out
//   ./engine.ts         one transport for the module
//   this file           view state (filters, sort, selection, the queue) and
//                       the keys
//
// What the port deliberately did NOT carry over is listed in its CSS header
// (./audio-workbench.css) and in two places below: the breadcrumb (the tab rail
// above already says Library · Audio), and the printed keymap (behind a
// <Keycaps> glyph on the ledger, per components/ui/signal/Keycaps.tsx).

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ToastTray, WorldRoot, useToast } from "@/components/kit";
import { Ghost } from "@/components/ui/signal";
import { useAuth } from "@/lib/useAuth";

import { analyzeFile, type Stage } from "./analysis";
import {
  RUBRIC,
  VORDER,
  blankSeed,
  conceptFor,
  counts,
  dimsFor,
  groupOf,
  nearestTerms,
  reasons as reasonsOf,
  recipeOf,
  references,
  seedOf,
  sfxVocabulary,
  tagsOf,
  takeFromAsset,
  variations,
  verdict,
  vocabulary,
  compose,
  newDraft,
  returnMeta,
  type Grouping,
  type Hand,
  type RatingKey,
  type Seed,
  type Take,
  type Target,
  type TermFacet,
  type TermSort,
  type Verdict,
} from "./book";
import { useBook } from "./bookStore";
import { copyText } from "./clipboard";
import { Engine } from "./engine";
import { Composer, Drafts, Recipe, TakePanel, Variations, type ComposerState } from "./Inspector";
import Ledger, { COLS, sortRows, visibleCols, type ColId, type Sort } from "./Ledger";
import References, { type Analyzed } from "./References";
import Terms from "./Terms";
import { useAudioShelf } from "./useAudioShelf";

import "./audio-workbench.css";

type TypeFilter = "all" | "track" | "sfx";
type Tab = "take" | "refs";

const TYPES: readonly [TypeFilter, string][] = [
  ["all", "All"],
  ["track", "Tracks"],
  ["sfx", "Effects"],
];

const isField = (el: Element | null) =>
  !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el as HTMLElement).isContentEditable);

const toggled = <T,>(set: ReadonlySet<T>, v: T): Set<T> => {
  const n = new Set(set);
  if (n.has(v)) n.delete(v);
  else n.add(v);
  return n;
};

export default function AudioWorkbench({ onCount }: { onCount?: (n: number) => void }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const shelf = useAudioShelf(uid);
  const { book, error: bookError, update: updateBook } = useBook(uid);
  const [engine] = useState(() => new Engine());
  useEffect(() => () => engine.dispose(), [engine]);
  const { toasts, push, dismiss } = useToast();

  // ── view state (app.js's S) ──
  const [type, setType] = useState<TypeFilter>("all");
  const [verdicts, setVerdicts] = useState<ReadonlySet<Verdict>>(() => new Set());
  const [q, setQ] = useState("");
  const [term, setTerm] = useState<{ facet: TermFacet; term: string } | null>(null);
  const [refFilter, setRefFilter] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<Grouping>("recipe");
  const [sort, setSort] = useState<Sort>({ col: "age", dir: "desc" });
  const [sel, setSel] = useState<string | null>(null);
  const [dim, setDim] = useState(0);
  const [queue, setQueue] = useState<string[] | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectInsp, setRejectInsp] = useState(false);
  const [tab, setTab] = useState<Tab>("take");
  const [termSort, setTermSort] = useState<TermSort>("rate");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [termCollapsed, setTermCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [target, setTarget] = useState<Target>("suno");
  const [stages, setStages] = useState<{ now: Stage; err?: string } | null>(null);
  const [analysis, setAnalysis] = useState<Analyzed | null>(null);
  const [kbd, setKbd] = useState(false);
  const [drawer, setDrawer] = useState<"inspector" | "terms" | null>(null);
  const [width, setWidth] = useState(1440);

  const rootRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** One-shot DOM moves requested by a handler and performed after the render
   *  that follows it — the entry did them inline after innerHTML. */
  const pending = useRef<{ composer?: boolean; row?: string }>({});
  const firstScrollDone = useRef(false);

  // ── derived (every number read off the takes, every render) ──
  const takes = useMemo(() => (shelf.assets ?? []).map(takeFromAsset), [shelf.assets]);
  const byId = useMemo(() => new Map(takes.map((t) => [t.id, t] as const)), [takes]);
  const voc = useMemo(() => vocabulary(takes, book.hands), [takes, book.hands]);
  const sfxVoc = useMemo(() => sfxVocabulary(takes), [takes]);
  const allReasons = useMemo(() => reasonsOf(takes), [takes]);
  const refs = useMemo(() => references(takes), [takes]);
  const all = useMemo(() => counts(takes), [takes]);

  // The page opens on work: the newest unjudged take (app.js, "first selection").
  const first = useMemo(
    () => takes.filter((t) => verdict(t) === "unjudged").sort((a, b) => b.created_at - a.created_at)[0] ?? takes[0],
    [takes],
  );
  const selId = sel ?? first?.id ?? null;
  const selTake = selId ? byId.get(selId) : undefined;
  const composerState: ComposerState =
    composer ??
    (first && first.kind === "track"
      ? { seed: seedOf(first), from: first.title, parent: first.id, ref: null }
      : { seed: blankSeed(), from: "blank", parent: null, ref: null });

  useEffect(() => {
    if (shelf.assets) onCount?.(shelf.assets.length);
  }, [shelf.assets, onCount]);

  const matches = useCallback(
    (t: Take) => {
      if (queue) return queue.includes(t.id);
      if (type !== "all" && t.kind !== type) return false;
      if (verdicts.size && !verdicts.has(verdict(t))) return false;
      if (refFilter && t.reference_track_id !== refFilter) return false;
      if (term) {
        const arr = term.facet === "sfx_category" ? [t.sfx_category] : t[term.facet];
        if (!arr.includes(term.term)) return false;
      }
      if (q) {
        const hay = [t.title, t.id, t.vendor, t.reject_reason, t.prompt_round, t.key, recipeOf(t), ...tagsOf(t)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    },
    [queue, type, verdicts, refFilter, term, q],
  );

  /** The visible order: groups by size (returns first, the other type's
   *  buckets last), rows sorted within (app.js#view). */
  const groups = useMemo(() => {
    const rows = sortRows(takes.filter(matches), sort);
    if (grouping === "none" || queue) return [{ group: null, rows }];
    const m = new Map<string, Take[]>();
    for (const r of rows) {
      const g = groupOf(r, grouping) ?? "";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(r);
    }
    const rank = (g: string) =>
      /^Draft returns|^Returns/.test(g) ? 0 : /^Effects|^Tracks$/.test(g) && type === "all" ? 2 : 1;
    return [...m.entries()]
      .sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length)
      .map(([group, rows]) => ({ group: group as string | null, rows }));
  }, [takes, matches, sort, grouping, queue, type]);

  const visibleIds = useMemo(
    () => groups.flatMap((g) => (g.group && collapsed.has(g.group) ? [] : g.rows.map((r) => r.id))),
    [groups, collapsed],
  );
  const shown = groups.reduce((a, g) => a + g.rows.length, 0);
  const queueable = queue ? 0 : takes.filter((t) => matches(t) && verdict(t) === "unjudged").length;
  const cols = visibleCols(width);

  const urlFor = useCallback((t: Take) => (t.upload_id ? (shelf.urls.get(t.upload_id) ?? null) : null), [shelf.urls]);
  const playable = (t: Take) => (t.upload_id ? shelf.urls.has(t.upload_id) : true);

  // ── writes ──
  const { patch } = shelf;
  const keep = (id: string) => patch(id, { verdict: "kept", reject_reason: undefined });
  const reject = (id: string, reason: string) => patch(id, { verdict: "rejected", reject_reason: reason });
  const clearVerdict = (id: string) => patch(id, { verdict: "unjudged", reject_reason: undefined });
  const rate = (id: string, key: RatingKey, v: number) => {
    const t = byId.get(id);
    if (!t) return;
    patch(id, {
      ratings: {
        melody: null,
        instrument_choice: null,
        instrument_quality: null,
        ...(t.ratings ?? {}),
        [key]: v,
      },
    });
  };
  const setHand = (id: string, h: Hand) =>
    updateBook((b) => ({
      ...b,
      hands: { ...b.hands, [id]: { ...(b.hands[id] ?? {}), ...h } },
    }));

  // ── selection ──
  const select = (id: string, opts?: { tab?: Tab; drawer?: boolean }) => {
    if (selId !== id) {
      setRejectInsp(false);
      if (rejecting && rejecting !== id) setRejecting(null);
      const t = byId.get(id);
      const dims = dimsFor(t);
      if (t && !dims.includes(dim)) setDim(dims[0]);
    }
    setSel(id);
    if (opts?.tab) setTab(opts.tab);
    if (opts?.drawer) setDrawer("inspector");
  };

  const nextUnjudged = (fromId: string) => {
    const i = visibleIds.indexOf(fromId);
    for (let k = 1; k <= visibleIds.length; k++) {
      const id = visibleIds[(i + k) % visibleIds.length];
      const t = byId.get(id);
      if (id !== fromId && t && verdict(t) === "unjudged") return id;
    }
    return null;
  };

  /** Judge, then move to the next unjudged take in view (app.js#verdictThen). */
  const verdictThen = (id: string, fn: () => void) => {
    const nxt = nextUnjudged(id);
    fn();
    if (nxt) {
      setSel(nxt);
      setDim(dimsFor(byId.get(nxt))[0]);
    }
    setRejecting(null);
    setRejectInsp(false);
    if (queue && !queue.some((qid) => qid !== id && byId.get(qid) && verdict(byId.get(qid)!) === "unjudged"))
      push({
        kind: "ok",
        text: `queue ${queue.length}/${queue.length}`,
        key: "queue",
      });
  };

  const commitReject = (id: string, reason: string) => {
    const t = byId.get(id);
    setKbd(true);
    verdictThen(id, () => reject(id, reason));
    if (t) push({ kind: "ok", text: `rejected · ${t.title}`, key: "verdict" });
  };

  const keepNext = (id: string) => {
    const t = byId.get(id);
    verdictThen(id, () => keep(id));
    if (t) push({ kind: "ok", text: `kept · ${t.title}`, key: "verdict" });
  };

  // ── the composer ──
  const setSeed = (seed: Seed, from: string, parent: string | null, ref: string | null) => {
    setComposer({ seed: { ...blankSeed(), ...seed }, from, parent, ref });
    setTab("take");
    pending.current.composer = true;
  };

  const copyDraft = async (seed: Seed, tgt: Target, parent: string | null, ref: string | null) => {
    const text = compose(seed, tgt, book.hands);
    const draft = newDraft(seed, tgt, text, parent, ref);
    updateBook((b) => ({ ...b, drafts: [draft, ...b.drafts] }));
    const ok = await copyText(text);
    if (ok) {
      const at = Date.now();
      updateBook((b) => ({
        ...b,
        drafts: b.drafts.map((d) => (d.id === draft.id ? { ...d, copied_at: at } : d)),
      }));
    }
    push({
      kind: ok ? "ok" : "info",
      text: ok
        ? `copied for ${tgt === "suno" ? "Suno" : "ElevenLabs"} · awaiting return`
        : "clipboard blocked · draft kept",
      key: "copy",
    });
  };

  /** A returned file becomes a new unjudged take whose parent, draft and prompt
   *  are recorded on it (core.js#attachReturn). */
  const attach = async (file: File, draftId: string) => {
    const d = book.drafts.find((x) => x.id === draftId);
    const parent = d?.parent_id ? byId.get(d.parent_id) : undefined;
    const row = await shelf.attachReturn(file, returnMeta(d, parent));
    if (!row) return;
    const t = takeFromAsset(row);
    setFlash(t.id);
    setSel(t.id);
    setQueue(null);
    setVerdicts(new Set());
    setTerm(null);
    setRefFilter(null);
    setQ("");
    if (searchRef.current) searchRef.current.value = "";
    const g = groupOf(t, grouping);
    if (g) setCollapsed((c) => toggledOff(c, g));
    setKbd(true);
    pending.current.row = t.id;
    push({ kind: "ok", text: `returned · ${t.title}`, key: "return" });
  };

  const analyze = async (file: File) => {
    setStages({ now: "decode" });
    setAnalysis(null);
    let last: Stage = "decode";
    try {
      const a = await analyzeFile(file, (s) => {
        last = s;
        setStages({ now: s });
      });
      setAnalysis({ ...a, terms: nearestTerms(a.tempo, takes) });
    } catch (e) {
      setStages({
        now: last,
        err: `could not decode · ${e instanceof Error && e.message ? e.message : "unsupported file"}`,
      });
    }
  };

  // ── keys (app.js's document keydown) ──
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const t = e.target as Element | null;
    if (isField(t)) return;
    if (e.key === "Escape") {
      setDrawer(null);
      return;
    }
    if (e.key === "/") {
      e.preventDefault();
      searchRef.current?.focus();
      return;
    }
    // Nothing focused yet: the selected row takes the keys, so rating starts
    // on first load.
    let row = t?.closest?.("tr.row") as HTMLElement | null;
    if (!row && (t === document.body || t === document.documentElement) && selId) {
      row = midRef.current?.querySelector<HTMLElement>(`tr.row[data-id="${CSS.escape(selId)}"]`) ?? null;
      row?.focus({ preventScroll: true });
    }
    if (!row || !rootRef.current?.contains(row)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const id = row.dataset.id!;
    const take = byId.get(id);
    if (!take) return;
    const dims = dimsFor(take);
    const cur = dims.includes(dim) ? dim : dims[0];
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp" || k === "j" || k === "k") {
      e.preventDefault();
      setKbd(true);
      const i = visibleIds.indexOf(id);
      const n = visibleIds[Math.max(0, Math.min(visibleIds.length - 1, i + (k === "ArrowDown" || k === "j" ? 1 : -1)))];
      if (n && n !== id) select(n);
    } else if (k === "ArrowRight" || k === "ArrowLeft" || k === "Tab") {
      const fwd = k === "ArrowRight" || (k === "Tab" && !e.shiftKey);
      const np = dims.indexOf(cur) + (fwd ? 1 : -1);
      if (k === "Tab" && (np < 0 || np >= dims.length)) return; // let Tab leave the table at the ends
      e.preventDefault();
      setKbd(true);
      setDim(dims[Math.max(0, Math.min(dims.length - 1, np))]);
    } else if (/^[0-9]$/.test(k)) {
      e.preventDefault();
      setKbd(true);
      const v = k === "0" ? 10 : Number(k);
      const pos = dims.indexOf(cur);
      setDim(pos < dims.length - 1 ? dims[pos + 1] : cur);
      rate(id, RUBRIC[cur].key, v);
    } else if (k === "Enter") {
      e.preventDefault();
      setKbd(true);
      keepNext(id);
    } else if (k === "Backspace" || k === "x" || k === "X" || k === "Delete") {
      e.preventDefault();
      setKbd(true);
      setRejecting(id);
    } else if (k === "u" || k === "U") {
      e.preventDefault();
      setKbd(true);
      clearVerdict(id);
    } else if (k === " ") {
      e.preventDefault();
      setKbd(true);
      engine.toggle(take, urlFor(take));
    } else if (k === "o" || k === "O") {
      setDrawer("inspector");
    }
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  // ── layout: the pane fills the viewport under the tab rail ──
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.setProperty("--ab-h", `calc(100dvh - ${Math.round(top + 16)}px)`);
    };
    fit();
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, []);

  // The sticky heads stack under the column head (and the queue bar, when on).
  useLayoutEffect(() => {
    const host = midRef.current;
    if (!host) return;
    const ch = host.querySelector<HTMLElement>(".colhead");
    const qb = host.querySelector<HTMLElement>(".queue");
    const hh = ch?.offsetHeight ?? 44;
    host.style.setProperty("--hh", `${hh}px`);
    host.style.setProperty("--th", `${hh + (qb?.offsetHeight ?? 0)}px`);
  });

  // The selected row takes focus when the keyboard is driving.
  useEffect(() => {
    if (!kbd || !selId || rejecting) return;
    const active = document.activeElement;
    if (active && active !== document.body && isField(active)) return;
    const host = midRef.current;
    const tr = host?.querySelector<HTMLElement>(`tr.row[data-id="${CSS.escape(selId)}"]`);
    if (!host || !tr) return;
    if (document.activeElement !== tr) tr.focus({ preventScroll: true });
    const r = tr.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    // The CELLS stick, not the <thead>: a row group's own box stays where the
    // flow put it, so measuring it (as the entry did) reads a header scrolled
    // away and lets the selected row hide under the real one.
    const top = host.querySelector(".ab-tbl thead th")?.getBoundingClientRect().bottom ?? h.top + 86;
    if (r.top < top) host.scrollTop -= top - r.top + 8;
    else if (r.bottom > h.bottom - 8) host.scrollTop += r.bottom - h.bottom + 40;
  }, [kbd, selId, rejecting]);

  // The inspector opens at the top of a newly selected take.
  useEffect(() => {
    if (tab === "take" && rightRef.current) rightRef.current.scrollTop = 0;
  }, [selId, tab]);

  // One-shot moves a handler asked for.
  useEffect(() => {
    const p = pending.current;
    if (p.composer) {
      p.composer = false;
      const c = rightRef.current?.querySelector("[data-composer]");
      c?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    }
    if (p.row) {
      const host = midRef.current;
      const tr = host?.querySelector<HTMLElement>(`tr.row[data-id="${CSS.escape(p.row)}"]`);
      if (host && tr) host.scrollTop = Math.max(0, tr.offsetTop - host.clientHeight / 3);
      p.row = undefined;
    }
  });

  // First load: bring the opening take a third of the way down the ledger.
  useEffect(() => {
    if (firstScrollDone.current || !selId) return;
    const host = midRef.current;
    const tr = host?.querySelector<HTMLElement>(`tr.row[data-id="${CSS.escape(selId)}"]`);
    if (!host || !tr) return;
    firstScrollDone.current = true;
    host.scrollTop = Math.max(0, tr.offsetTop - host.clientHeight / 3);
  }, [selId, takes.length]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  const storageError = shelf.error ?? bookError;
  const nT = takes.filter((t) => t.kind === "track").length;
  const curated = voc.filter((v) => v.stance || v.phrase).length;
  const refName = refFilter ? refs.find((r) => r.ref.id === refFilter)?.ref.title : null;
  const queueDone = queue ? queue.filter((id) => byId.get(id) && verdict(byId.get(id)!) !== "unjudged").length : 0;
  const keys = useMemo(
    () => [...new Set(takes.map((t) => t.key).filter((k): k is string => Boolean(k)))].sort(),
    [takes],
  );
  const vars = selTake ? variations(selTake, voc) : [];

  return (
    <WorldRoot world="obsidian" className="ab-world">
      <div
        ref={rootRef}
        className={`ab${drawer === "inspector" ? " drawer-open" : ""}${drawer === "terms" ? " terms-open" : ""}`}
      >
        <header className="ab-top">
          <h2 className="sr-only">Audio</h2>
          <div className="ab-top__row">
            <div className="census" data-testid="audio-census">
              <span className="tally">
                <b>{takes.length}</b>
                <small>takes</small>
              </span>
              <span className="tally t-tracks">
                <b>{nT}</b>
                <small>tracks</small>
              </span>
              <span className="tally t-effects">
                <b>{takes.length - nT}</b>
                <small>effects</small>
              </span>
              <span className="tally">
                <b>{allReasons.length}</b>
                <small>reasons</small>
              </span>
              <span className="tally">
                <b>{curated}</b>
                <small>curated terms</small>
              </span>
            </div>
            <div className="bigbar" role="group" aria-label="Verdicts across the corpus">
              {VORDER.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`seg-${v}`}
                  style={{ flexGrow: all[v] }}
                  aria-label={`${all[v]} ${v}`}
                  aria-pressed={verdicts.has(v)}
                  onClick={() => {
                    setVerdicts((s) => toggled(s, v));
                    setQueue(null);
                  }}
                />
              ))}
            </div>
          </div>
          <div className="ab-top__row">
            <button
              type="button"
              className="btn only-narrow"
              aria-expanded={drawer === "terms"}
              onClick={() => setDrawer((d) => (d === "terms" ? null : "terms"))}
            >
              Terms
            </button>
            <div className="seg" role="group" aria-label="Type">
              {TYPES.map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={type === k}
                  onClick={() => {
                    setType(k);
                    setQueue(null);
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="census" role="group" aria-label="Verdict filter">
              {VORDER.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`tally t-${v}`}
                  aria-pressed={verdicts.has(v)}
                  onClick={() => {
                    setVerdicts((s) => toggled(s, v));
                    setQueue(null);
                  }}
                >
                  <b>{all[v]}</b>
                  <small>{v}</small>
                </button>
              ))}
            </div>
            <input
              ref={searchRef}
              className="search"
              type="search"
              placeholder="Search title, tag, reason"
              aria-label="Search"
              data-testid="audio-search"
              onChange={(e) => {
                const v = e.target.value.trim().toLowerCase();
                if (searchTimer.current) clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => {
                  setQ(v);
                  setQueue(null);
                }, 90);
              }}
            />
            <span className="census">
              {term && (
                <span className="filterchip">
                  {term.term}
                  <button type="button" aria-label="Clear term filter" onClick={() => setTerm(null)}>
                    ×
                  </button>
                </span>
              )}
              {refFilter && (
                <span className="filterchip">
                  ref · {refName ?? refFilter}
                  <button type="button" aria-label="Clear reference filter" onClick={() => setRefFilter(null)}>
                    ×
                  </button>
                </span>
              )}
            </span>
            <span className="grow" />
            {storageError && (
              <div className="storage" role="alert">
                {storageError}
              </div>
            )}
            <button
              type="button"
              className="btn only-narrow"
              aria-expanded={drawer === "inspector"}
              onClick={() => setDrawer((d) => (d === "inspector" ? null : "inspector"))}
            >
              Inspector
            </button>
          </div>
        </header>

        <div className="ab-cols">
          <aside className="ab-col ab-col--left" aria-label="Terms">
            <Terms
              sections={[
                {
                  id: "genre_tags",
                  label: "Genre",
                  list: voc.filter((v) => v.facet === "genre_tags"),
                },
                {
                  id: "mood_tags",
                  label: "Mood",
                  list: voc.filter((v) => v.facet === "mood_tags"),
                },
                {
                  id: "instrumentation",
                  label: "Instrument",
                  list: voc.filter((v) => v.facet === "instrumentation"),
                },
                { id: "sfx_category", label: "Effect category", list: sfxVoc },
              ]}
              termSort={termSort}
              onTermSort={setTermSort}
              collapsed={termCollapsed}
              onToggleSection={(id) => setTermCollapsed((c) => toggled(c, id))}
              active={term}
              onPick={(facet, t) => {
                setTerm((cur) => (cur && cur.facet === facet && cur.term === t ? null : { facet, term: t }));
                setQueue(null);
                setDrawer(null);
              }}
              onHand={setHand}
            />
          </aside>

          <main ref={midRef} className="ab-col ab-col--mid" aria-label="Ledger" data-testid="audio-ledger">
            {shelf.assets === null ? (
              <>
                <div className="colhead">
                  <h2>Ledger</h2>
                </div>
                <Ghost shape="row" count={6} label="Loading the audio shelf" className="p-4" />
              </>
            ) : (
              <Ledger
                groups={groups}
                cols={cols}
                total={shown}
                corpus={takes.length}
                sort={sort}
                onSort={(col: ColId) =>
                  setSort((s) =>
                    s.col === col
                      ? { col, dir: s.dir === "asc" ? "desc" : "asc" }
                      : {
                          col,
                          dir: COLS.find((c) => c.id === col)?.num ? "desc" : "asc",
                        },
                  )
                }
                grouping={grouping}
                onGrouping={setGrouping}
                collapsed={collapsed}
                onToggleGroup={(g) => setCollapsed((c) => toggled(c, g))}
                queue={queue}
                queueDone={queueDone}
                queueable={queueable}
                onQueue={() => {
                  const ids = visibleIds
                    .filter((id) => byId.get(id) && verdict(byId.get(id)!) === "unjudged")
                    .slice(0, 20);
                  if (!ids.length) return;
                  setQueue(ids);
                  setSel(ids[0]);
                  setKbd(true);
                  setDim(dimsFor(byId.get(ids[0]))[0]);
                }}
                onExitQueue={() => setQueue(null)}
                sel={selId}
                dim={dim}
                kbd={kbd}
                flash={flash}
                rejecting={rejecting}
                reasons={allReasons}
                onRowClick={(id) => {
                  setKbd(true);
                  select(id, { drawer: width < 1000 });
                }}
                onRejectCommit={commitReject}
                onRejectCancel={() => {
                  setRejecting(null);
                  setKbd(true);
                }}
                engine={engine}
                urlFor={urlFor}
                onPlay={(t) => engine.toggle(t, urlFor(t))}
                verdictOf={(id) => {
                  const t = byId.get(id);
                  return t ? verdict(t) : null;
                }}
              />
            )}
          </main>

          <aside ref={rightRef} className="ab-col ab-col--right" aria-label="Inspector and composer">
            <div className="colhead">
              <div className="tabs" role="tablist" aria-label="Inspector">
                <button type="button" role="tab" aria-selected={tab === "take"} onClick={() => setTab("take")}>
                  Take · Compose
                </button>
                <button type="button" role="tab" aria-selected={tab === "refs"} onClick={() => setTab("refs")}>
                  References <span className="mono">{refs.length}</span>
                </button>
              </div>
              <span className="grow" />
              <button
                type="button"
                className="btn only-narrow"
                aria-label="Close inspector"
                onClick={() => setDrawer(null)}
              >
                ×
              </button>
            </div>
            {tab === "refs" ? (
              <References
                refs={refs}
                stages={stages}
                analysis={analysis}
                onSeedRef={(r) => {
                  const lib = r.methods[0];
                  setSeed(
                    conceptFor(r.ref.id, { tempo: lib.tempo, key: lib.key }, takes),
                    `${r.ref.artist} — ${r.ref.title}`,
                    null,
                    r.ref.id,
                  );
                }}
                onOpenRef={(id) => {
                  setRefFilter(id);
                  setQueue(null);
                  setGrouping("none");
                }}
                onAnalyze={(f) => void analyze(f)}
                onSeedAnalysis={(a) =>
                  setSeed(
                    {
                      genres: a.terms.genres,
                      moods: a.terms.moods,
                      instruments: a.terms.instruments,
                      bpm: a.tempo,
                      key: a.key,
                      avoid: [],
                    },
                    a.name,
                    null,
                    null,
                  )
                }
              />
            ) : (
              <>
                <TakePanel
                  take={selTake}
                  dim={dim}
                  engine={engine}
                  url={selTake ? urlFor(selTake) : null}
                  playable={selTake ? playable(selTake) : false}
                  rejectOpen={rejectInsp}
                  reasons={allReasons}
                  onRate={(key, n) => {
                    if (!selTake) return;
                    setDim(RUBRIC.findIndex((x) => x.key === key));
                    setKbd(false);
                    rate(selTake.id, key, n);
                  }}
                  onKeep={() => selTake && keepNext(selTake.id)}
                  onRejectOpen={() => setRejectInsp(true)}
                  onRejectCommit={(r) => selTake && commitReject(selTake.id, r)}
                  onRejectCancel={() => setRejectInsp(false)}
                  onClear={() => selTake && clearVerdict(selTake.id)}
                  onSeedFrom={() =>
                    selTake && setSeed(seedOf(selTake), selTake.title, selTake.id, selTake.reference_track_id)
                  }
                  onFilterTerm={(facet, t) => {
                    setTerm({ facet, term: t });
                    setQueue(null);
                  }}
                />
                {selTake && (
                  <Recipe
                    take={selTake}
                    byId={byId}
                    takes={takes}
                    drafts={book.drafts}
                    hands={book.hands}
                    onOpen={(id) => select(id, { tab: "take" })}
                  />
                )}
                {selTake && (
                  <Variations
                    list={vars}
                    onLoad={(v) =>
                      setSeed(v.seed, `${v.axis} · ${selTake.title}`, selTake.id, selTake.reference_track_id)
                    }
                    onCopy={(v) =>
                      void copyDraft(
                        v.seed,
                        selTake.vendor === "elevenlabs" ? "elevenlabs" : target,
                        selTake.id,
                        selTake.reference_track_id,
                      )
                    }
                  />
                )}
                <Composer
                  state={composerState}
                  voc={voc}
                  hands={book.hands}
                  target={target}
                  keys={keys}
                  onSeed={(seed) => setComposer({ ...composerState, seed })}
                  onBlank={() => setSeed(blankSeed(), "blank", null, null)}
                  onTarget={setTarget}
                  onCopy={() => void copyDraft(composerState.seed, target, composerState.parent, composerState.ref)}
                />
                <Drafts
                  drafts={book.drafts}
                  takes={takes}
                  byId={byId}
                  onOpen={(id) => select(id, { tab: "take" })}
                  onAttach={(f, id) => void attach(f, id)}
                />
              </>
            )}
          </aside>
        </div>
        <div className="scrim" onClick={() => setDrawer(null)} aria-hidden="true" />
      </div>
      <ToastTray toasts={toasts} onDismiss={dismiss} />
    </WorldRoot>
  );
}

function toggledOff(set: ReadonlySet<string>, v: string): ReadonlySet<string> {
  if (!set.has(v)) return set;
  const n = new Set(set);
  n.delete(v);
  return n;
}
