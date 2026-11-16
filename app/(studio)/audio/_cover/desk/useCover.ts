"use client";

// ONE COVER IN HAND: what the owner is editing before a launch (the section, the styles, the lyrics), the
// receipt read and its confirm, the pick, the remix and the back-filled styles. Every write is the server's,
// through the acts; after one the view is re-read. The island holds only what is not the store's yet.
//
// THE RECEIPT. Launch asks acts.launch with no token and shows what comes back; Confirm sends its token. A stale
// answer replaces the receipt with the fresh one, its moved cells marked (receiptChanges), and waits for a second
// Confirm: nothing is queued on a receipt the owner has not read.
//
// THE BRIEF (cover brief, WP-B) is read and confirmed the same way through acts.brief; its state is the record's.
// When the record says the brief is done, the fields are reset to what it wrote, once per brief.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { COVER_SECTION_MAX_S, COVER_SECTION_MIN_S, type CoverCard, type CoverPlan } from "@gt/domain/cover";
import { receiptChanges } from "@gt/ui/components/produce/produce.ts";
import { fitSpan, type Span } from "@gt/ui/components/rangepick/rangepick.ts";

import type { CoverActs } from "../contract.ts";
import { hearUrl, type Heard } from "./audio.ts";
import { readSnapshot, serverReadSnapshot, subscribeRead } from "./brief/readClock.ts";
import type { CoverFlow, Launching } from "./coverFlow.ts";
import type { Sender } from "./send.ts";
import { failWords, useAfterPick } from "./useAfterPick.ts";

export type { BriefFlow, CoverFlow, Launching } from "./coverFlow.ts";

export function useCover(card: CoverCard, acts: CoverActs, sender: Sender, refresh: () => void): CoverFlow {
  const r = card.record;
  const [heard, setHeard] = useState<Heard | null>(null);
  const [heardError, setHeardError] = useState<string | null>(null);
  const lenS = heard?.lenS ?? r.source.durationS;
  const limits = { lenS, minS: COVER_SECTION_MIN_S, maxS: COVER_SECTION_MAX_S };
  const [span, setSpanRaw] = useState<Span>(() => fitSpan(r.section, limits));
  const [style, setStyle] = useState(r.style);
  const [sourceStyle, setSourceStyle] = useState(r.sourceStyle ?? "");
  const [lyrics, setLyrics] = useState(r.lyrics);
  const [launching, setLaunching] = useState<Launching | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const inflight = useRef(false);
  const [briefing, setBriefing] = useState<Launching | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefExisting, setBriefExisting] = useState<string | null>(null);
  const readAtMs = useSyncExternalStore(subscribeRead, readSnapshot, serverReadSnapshot);

  // What a finished brief wrote is the record's; the fields take it once per brief (React's reset-on-prop pattern).
  const wrote = r.brief?.state === "done" ? r.brief.at : null;
  const [wroteSeen, setWroteSeen] = useState(wrote);
  if (wroteSeen !== wrote) {
    setWroteSeen(wrote);
    if (wrote !== null) {
      setSpanRaw(fitSpan(r.section, limits));
      setStyle(r.style);
      setSourceStyle(r.sourceStyle ?? "");
      setLyrics(r.lyrics);
      setLaunching(null);
    }
  }

  useEffect(() => {
    let live = true;
    void hearUrl(card.sourceUrl, r.id).then((a) => {
      if (!live) return;
      if (a.ok) {
        setHeard(a.value);
        setHeardError(null);
      } else setHeardError(a.error);
    });
    return () => {
      live = false;
    };
  }, [card.sourceUrl, r.id]);

  const editable = r.state === "draft" || r.state === "failed";
  const setSpan = (s: Span): void => {
    if (!editable) return;
    setSpanRaw(s);
    setLaunching(null);
  };
  const plan = (): CoverPlan => ({ id: r.id, startS: span.startS, endS: span.endS, style: style.trim(), lyrics, ...(sourceStyle.trim() === "" ? {} : { sourceStyle: sourceStyle.trim() }) });

  const once = async (f: () => Promise<void>): Promise<void> => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    try {
      await f();
    } catch (e) {
      setError(failWords(e));
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  };

  const launch = (): void =>
    void once(async () => {
      setError(null);
      const a = await acts.launch(plan());
      if (!a.ok) return setError(a.error.error);
      if (a.value.kind === "receipt") setLaunching({ receipt: a.value.receipt, readAtMs: Date.now() });
      else refresh();
    });

  const confirm = (): void =>
    void once(async () => {
      if (launching === null) return;
      setError(null);
      const a = await acts.launch(plan(), launching.receipt.token);
      if (!a.ok) return setError(a.error.error);
      const v = a.value;
      if (v.kind === "stale") setLaunching({ receipt: v.fresh, changes: receiptChanges(launching.receipt, v.fresh), readAtMs: Date.now() });
      else if (v.kind === "receipt") setLaunching({ receipt: v.receipt, readAtMs: Date.now() });
      else {
        setLaunching(null);
        refresh();
      }
    });

  const briefAsk = (): void =>
    void once(async () => {
      setBriefError(null);
      setBriefExisting(null);
      const a = await acts.brief(r.id);
      if (!a.ok) return setBriefError(a.error.error);
      if (a.value.kind === "receipt") setBriefing({ receipt: a.value.receipt, readAtMs: Date.now() });
      else {
        if (a.value.kind === "existing") setBriefExisting(a.value.jobId);
        refresh();
      }
    });

  const briefConfirm = (): void =>
    void once(async () => {
      if (briefing === null) return;
      setBriefError(null);
      const a = await acts.brief(r.id, briefing.receipt.token);
      if (!a.ok) return setBriefError(a.error.error);
      const v = a.value;
      if (v.kind === "stale") setBriefing({ receipt: v.fresh, changes: receiptChanges(briefing.receipt, v.fresh), readAtMs: Date.now() });
      else if (v.kind === "receipt") setBriefing({ receipt: v.receipt, readAtMs: Date.now() });
      else {
        setBriefing(null);
        if (v.kind === "existing") setBriefExisting(v.jobId);
        refresh();
      }
    });

  const pick = (seed: number): void => {
    if (picking !== null) return;
    setPicking(seed);
    setPickError(null);
    acts
      .pick(r.id, seed)
      .then((a) => {
        if (!a.ok) setPickError(a.error.error);
        else refresh();
      }, (e: unknown) => setPickError(failWords(e)))
      .finally(() => setPicking(null));
  };

  return {
    card,
    heard,
    heardError,
    lenS,
    span,
    setSpan,
    style,
    setStyle,
    sourceStyle,
    setSourceStyle,
    lyrics,
    setLyrics,
    editable,
    launching,
    busy,
    error,
    launch,
    confirm,
    cancel: () => setLaunching(null),
    picking,
    pickError,
    pick,
    ...useAfterPick(r, acts, sender, refresh),
    brief: { launching: briefing, busy, error: briefError, existing: briefExisting, ask: briefAsk, confirm: briefConfirm, cancel: () => setBriefing(null), readAtMs },
  };
}
