"use client";

// THE COVER DESK'S FIXTURE (spark track-mirror-studio, WP3): a history of covers, one per state plus a draft whose
// brief is running, audio synthesized in the browser, and stand-in acts that move the fixture through the flow
// (receipt, a stale confirm once, five takes, a pick, a remix), so the desk is driven before the engine and the doors exist. A draft's brief walks
// queued -> running -> done, one state per re-read, and on done writes the fields and launches the cover. Reached with
// `/audio?s=cover&fixture=<state>` on a development build only (./useDesk.ts reads the switch); a production
// build never honours it. Nothing here touches a store, a route or a vendor. A link sent here (cover from a link,
// WP-C) is "fetched" for LINK_FETCH_MS, so the fetching state can be seen, then made a draft carrying its link.
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { CoverDeskView, CoverRecord, CoverTake } from "@gt/domain/cover";

import type { CoverActs } from "../contract.ts";
import { base, briefDone, briefReceipt, card, OPENS_ON, receipt, records, SEEDS, SONG_S, takesFor } from "./fixtureRecords.ts";
import { wav, type Sounds } from "./fixtureSound.ts";
import type { Sender } from "./send.ts";

// An act's success, in the ActionResult shape the contract answers.
const ok = <T,>(value: T) => ({ ok: true as const, value });

export const FIXTURE_STATES = ["empty", "draft", "queued", "rendering", "failed", "judging", "picked", "remixed"] as const;
export type FixtureState = (typeof FIXTURE_STATES)[number];

/** How long the fixture's link takes to "download": long enough to be seen and photographed. */
const LINK_FETCH_MS = 2_500;
/** The video the fixture's link turns out to be. */
const LINK_TITLE = "Rain on Tin";

/** A whole song's rate: a history of 3-5 minute songs at 16 kHz would hold ~60 MB of blobs in a dev tab. */
const SONG_RATE = 8_000;
/** A song is this phrase played over and over under a slow verse/chorus swell, so its length costs a copy, not a synth. */
const PHRASE_S = 16;

// One set of sounds per page load, kept for its life: a fixture is a development page, and its blob URLs go
// with the tab.
let made: Sounds | null = null;
const clientSounds = (): Sounds =>
  (made ??= {
    source: wav(SONG_S, 0),
    songs: new Map(records().map((r, i) => [r.id, wav(r.source.durationS, i + 1, SONG_RATE, PHRASE_S)])),
    takes: SEEDS.map((seed) => wav(24, seed)),
    remix: wav(30, 7),
  });
const serverSounds = (): Sounds | null => null;
const noSubscribe = (): (() => void) => () => undefined;

const recordsFor = (state: FixtureState): CoverRecord[] => (state === "empty" ? [] : records());
const currentFor = (state: FixtureState): string | undefined => (state === "empty" ? undefined : OPENS_ON[state]);

export type FixtureDesk = { readonly view: CoverDeskView | null; readonly acts: CoverActs; readonly sender: Sender; readonly refresh: () => void; readonly select: (id: string | undefined) => void };

export function useFixture(state: FixtureState): FixtureDesk {
  // The audio is made in the browser only: the server's snapshot is none, so hydration matches and the
  // client's first render after it carries the sounds.
  const sounds = useSyncExternalStore(noSubscribe, clientSounds, serverSounds);
  const [recs, setRecs] = useState<CoverRecord[]>(() => recordsFor(state));
  const [currentId, setCurrentId] = useState<string | undefined>(() => currentFor(state));
  // A new `?fixture=` starts the fixture over (React's reset-on-prop pattern, during render).
  const [forState, setForState] = useState(state);
  if (forState !== state) {
    setForState(state);
    setRecs(recordsFor(state));
    setCurrentId(currentFor(state));
  }
  const staleOnce = useRef(true);
  // The re-read a confirm makes at once finds the brief still queued: it moves on the re-read after that.
  const briefJustQueued = useRef<string | null>(null);
  // A song dropped on the fixture plays as itself.
  const [dropped, setDropped] = useState<ReadonlyMap<string, string>>(new Map());

  const change = useCallback((id: string, f: (r: CoverRecord) => CoverRecord) => setRecs((rs) => rs.map((r) => (r.id === id ? f(r) : r))), []);

  const view = useMemo((): CoverDeskView | null => {
    if (sounds === null) return null;
    const covers = recs.map((r) => card(sounds, r, dropped));
    const current = covers.find((c) => c.record.id === currentId);
    return { covers, ...(current === undefined ? {} : { current }) };
  }, [sounds, recs, currentId, dropped]);

  const acts = useMemo(
    (): CoverActs => ({
      launch: async (plan, token) => {
        if (token === undefined) return ok({ kind: "receipt", receipt: receipt(plan.id, plan.startS, plan.endS, 0) });
        if (staleOnce.current) {
          staleOnce.current = false;
          return ok({ kind: "stale", fresh: receipt(plan.id, plan.startS, plan.endS, 1) });
        }
        change(plan.id, (r) => ({ ...r, state: "queued", section: { startS: plan.startS, endS: plan.endS }, style: plan.style, lyrics: plan.lyrics, ...(plan.sourceStyle === undefined ? {} : { sourceStyle: plan.sourceStyle }), takes: takesFor("queued"), jobId: `job:cover:${plan.id}` }));
        return ok({ kind: "launched", jobId: `job:cover:${plan.id}` });
      },
      brief: async (id, token) => {
        if (token === undefined) return ok({ kind: "receipt", receipt: briefReceipt(id) });
        const jobId = `job:cover-brief:${id}`;
        briefJustQueued.current = id;
        change(id, (r) => ({ ...r, brief: { state: "queued", jobId, at: new Date().toISOString() } }));
        return ok({ kind: "launched", jobId });
      },
      pick: async (id, seed) => {
        change(id, (r) => ({ ...r, state: "picked", winnerSeed: seed, exportFile: "winner.mp3" }));
        return ok({ winnerUrl: sounds?.takes[1] ?? "" });
      },
      saveStyles: async (id, styles) => {
        change(id, (r) => ({ ...r, ...(styles.sourceStyle === undefined ? {} : { sourceStyle: styles.sourceStyle }), ...(styles.remixStyle === undefined || r.remix === undefined ? {} : { remix: { ...r.remix, style: styles.remixStyle } }) }));
        return ok(undefined);
      },
    }),
    [change, sounds],
  );

  // A brief moves one state per refresh, and a queued cover one take, as the jobs would between two reads.
  const refresh = useCallback(() => {
    const now = new Date().toISOString();
    const hold = briefJustQueued.current;
    briefJustQueued.current = null;
    setRecs((rs) =>
      rs.map((r) => {
        if (r.brief?.state === "queued" && r.id === hold) return r;
        if (r.brief?.state === "queued") return { ...r, brief: { ...r.brief, state: "running", at: now } };
        if (r.brief?.state === "running") return briefDone(r, now);
        if (r.state !== "queued" && r.state !== "rendering") return r;
        const next = r.takes.findIndex((t) => t.state === "pending");
        if (next < 0) return { ...r, state: "judging" };
        const takes = r.takes.map((t, i): CoverTake => (i === next ? { ...t, state: "done", file: `takes/s${t.seed}.flac`, renderS: 60 } : t));
        return { ...r, state: takes.every((t) => t.state === "done") ? "judging" : "rendering", score: "score.abc", takes };
      }),
    );
  }, []);

  const sender = useMemo(
    (): Sender => ({
      source: async (f) => {
        const id = `cov-${Date.now().toString(16).slice(-12).padStart(12, "0")}`;
        const r: CoverRecord = { ...base(id.slice(4), f.title, 0), id: `cov-${id.slice(4)}`, rights: f.rights, state: "draft", takes: [], source: { file: "source.mp3", mime: f.file.type, name: f.file.name, durationS: SONG_S } };
        const { holder: _h, ...rest } = r;
        setRecs((rs) => [{ ...rest, ...(f.holder.trim() === "" ? {} : { holder: f.holder.trim() }) }, ...rs]);
        setDropped((m) => new Map(m).set(r.id, URL.createObjectURL(f.file)));
        setCurrentId(r.id);
        return { ok: true, id: r.id };
      },
      remix: async (f) => {
        change(f.id, (r) => ({ ...r, remix: { file: "remix.mp3", mime: f.file.type, name: f.file.name, style: f.style } }));
        return { ok: true, id: f.id };
      },
      link: async (f) => {
        await new Promise((done) => setTimeout(done, LINK_FETCH_MS));
        const v = /(?:v=|youtu\.be\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/.exec(f.url)?.[1] ?? "dQw4w9WgXcQ";
        const id = `cov-${Date.now().toString(16).slice(-12).padStart(12, "0")}`;
        const title = f.title.trim() === "" ? LINK_TITLE : f.title.trim();
        const { holder: _h, ...rest } = base(id.slice(4), title, 0);
        const r: CoverRecord = {
          ...rest,
          rights: f.rights,
          ...(f.holder.trim() === "" ? {} : { holder: f.holder.trim() }),
          state: "draft",
          takes: [],
          source: { file: "source.mp3", mime: "audio/mpeg", name: `${LINK_TITLE} [${v}].mp3`, durationS: SONG_S, url: `https://www.youtube.com/watch?v=${v}` },
        };
        setRecs((rs) => [r, ...rs]);
        setCurrentId(r.id);
        return { ok: true, id: r.id };
      },
    }),
    [change],
  );

  return { view, acts, sender, refresh, select: setCurrentId };
}
