// THE RELEASE DRAFT (spark audio-distribution; persisted by spark studio-to-release): one owned model for the
// whole wizard (registry wizard-flows: "one model owns every step"). The page holds it in a reducer for the
// optimistic view; the SAME pure `applyEdit` is what the server runs on the stored record (./acts.ts), so the
// screen and the store can never disagree about what an edit does. Pure: ids and clocks come in on the event.
import type { ChannelRow, MasterRef, Release, ReleaseChannelId, ReleaseTrack, ShelfTake, Sleeve, Split } from "@gt/domain/release";

export interface DraftState {
  readonly releases: readonly Release[];
  readonly openId: string | null;
}

export type ReleaseFields = Partial<Pick<Release, "title" | "version" | "artist" | "label" | "releaseDate" | "language" | "genre" | "upc" | "sleevePrompt">>;
export type TrackFields = Partial<Pick<ReleaseTrack, "title" | "version" | "isrc" | "explicit" | "lyrics" | "songwriters" | "credits" | "ai" | "rights">>;

export type DraftEvent =
  | { readonly type: "open"; readonly id: string | null }
  | { readonly type: "create"; readonly id: string; readonly artist: string; readonly takes: readonly ShelfTake[] }
  | { readonly type: "patch"; readonly id: string; readonly fields: ReleaseFields }
  | { readonly type: "patchTrack"; readonly id: string; readonly index: number; readonly fields: TrackFields }
  | { readonly type: "addTrack"; readonly id: string; readonly take: ShelfTake }
  | { readonly type: "removeTrack"; readonly id: string; readonly index: number }
  | { readonly type: "moveTrack"; readonly id: string; readonly from: number; readonly to: number }
  | { readonly type: "sleeve"; readonly id: string; readonly sleeve: Sleeve | null }
  | { readonly type: "toggleChannel"; readonly id: string; readonly channel: ReleaseChannelId }
  | { readonly type: "splits"; readonly id: string; readonly splits: readonly Split[] }
  | { readonly type: "schedule"; readonly id: string };

export const initialDraft = (releases: readonly Release[], openId: string | null): DraftState => ({
  releases,
  openId: openId !== null && releases.some((r) => r.id === openId) ? openId : null,
});

const NO_MASTER: MasterRef = { state: "none", recipe: null, takeId: null, audioHref: null, before: null, after: null, error: null };

/** A shelf take as a release track: nothing about it is known beyond what the take carries. */
export function trackOf(take: ShelfTake): ReleaseTrack {
  return {
    takeId: take.takeId,
    title: take.title,
    version: null,
    isrc: null,
    explicit: false,
    lyrics: null,
    durationS: take.durationS,
    audioHref: take.audioHref,
    songwriters: [],
    credits: [],
    ai: { lyrics: false, music: true, audio: "all", persona: null },
    rights: { vendor: take.provider === "local" ? null : take.provider, model: null, planTier: null, generatedAt: null, briefDigest: null, reference: null, licence: "unknown" },
    master: NO_MASTER,
  };
}

/** A fresh release from picked takes; its title is the first track's until someone types one. */
export function releaseOf(id: string, artist: string, takes: readonly ShelfTake[]): Release {
  return {
    id,
    title: takes[0]?.title ?? "",
    version: null,
    artist,
    label: null,
    releaseDate: null,
    language: "en",
    genre: { primary: null, secondary: null },
    upc: null,
    tracks: takes.map(trackOf),
    sleeve: null,
    sleevePrompt: null,
    channels: [],
    splits: [],
    status: "draft",
  };
}

const move = <T,>(xs: readonly T[], from: number, to: number): T[] => {
  const out = [...xs];
  const [x] = out.splice(from, 1);
  if (x !== undefined) out.splice(Math.max(0, Math.min(out.length, to)), 0, x);
  return out;
};

function edit(s: DraftState, id: string, f: (r: Release) => Release): DraftState {
  return { ...s, releases: s.releases.map((r) => (r.id === id ? f(r) : r)) };
}

const editTrack = (r: Release, index: number, f: (t: ReleaseTrack) => ReleaseTrack): Release => ({ ...r, tracks: r.tracks.map((t, i) => (i === index ? f(t) : t)) });

/** The events that change a stored release; `open` and `create` are the page's own (create is an act of its own). */
export type ReleaseEdit = Exclude<DraftEvent, { readonly type: "open" } | { readonly type: "create" }>;

/** One edit applied to one release - the reducer's arm for it, callable by the server on the stored record. */
export function applyEdit(r: Release, e: ReleaseEdit): Release {
  return reduceDraft({ releases: [r], openId: r.id }, e).releases[0] ?? r;
}

export const isReleaseEdit = (e: DraftEvent): e is ReleaseEdit => e.type !== "open" && e.type !== "create";

export function reduceDraft(s: DraftState, e: DraftEvent): DraftState {
  switch (e.type) {
    case "open":
      return { ...s, openId: e.id };
    case "create":
      return { releases: [releaseOf(e.id, e.artist, e.takes), ...s.releases], openId: e.id };
    case "patch":
      return edit(s, e.id, (r) => ({ ...r, ...e.fields }));
    case "patchTrack":
      return edit(s, e.id, (r) => editTrack(r, e.index, (t) => ({ ...t, ...e.fields })));
    case "addTrack":
      return edit(s, e.id, (r) => (r.tracks.some((t) => t.takeId === e.take.takeId) ? r : { ...r, tracks: [...r.tracks, trackOf(e.take)] }));
    case "removeTrack":
      return edit(s, e.id, (r) => ({ ...r, tracks: r.tracks.filter((_, i) => i !== e.index) }));
    case "moveTrack":
      return edit(s, e.id, (r) => ({ ...r, tracks: move(r.tracks, e.from, e.to) }));
    case "sleeve":
      return edit(s, e.id, (r) => ({ ...r, sleeve: e.sleeve }));
    case "toggleChannel":
      return edit(s, e.id, (r) => ({ ...r, channels: r.channels.includes(e.channel) ? r.channels.filter((c) => c !== e.channel) : [...r.channels, e.channel] }));
    case "splits":
      return edit(s, e.id, (r) => ({ ...r, splits: e.splits }));
    case "schedule":
      return edit(s, e.id, (r) => ({ ...r, status: "scheduled" }));
  }
}

/** One Calendar slot per picked channel (S2's `release:<id>` item kind): what Publish would create. */
export interface PlannedSlot {
  readonly channel: ReleaseChannelId;
  readonly at: string | null;
  readonly state: ChannelRow["state"];
  readonly detail: string | null;
}

export function plannedSlots(r: Release, rows: readonly ChannelRow[]): PlannedSlot[] {
  return r.channels.map((c) => {
    const row = rows.find((x) => x.id === c);
    return { channel: c, at: r.releaseDate, state: row?.state ?? "not-wired", detail: row?.detail ?? null };
  });
}
