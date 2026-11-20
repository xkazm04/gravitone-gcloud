// THE KNOW-HOW PROJECTION (spark device-metadata-sync, 2026-11-20). What one machine learned, as text, tracked in the
// repo's `knowhow/` folder and carried by ordinary commits: character cores and their prompts, each graph lane's
// recipes and lessons, and production state. Every record names the device that owns it. Media bytes, machine paths,
// secrets and runtime facts (jobs, spend, the event ledger, seq ids) never enter it. The repo is public: everything
// here is published on push, by the operator's choice.
//
// Topology (registry sync-replication / topology-declaration), per stream:
//   characters  - hub-and-spoke through git; any device creates (chr: ids are fixed); a record changed on two devices
//                 keeps the newer `at` and the other goes to knowhow/conflicts/ (never silent). Visuals are PER DEVICE.
//   lanes       - append-only; one file per record, never rewritten, so a merge is a union and cannot conflict.
//   productions - one-way mirror from the owning device; every other device holds it read-only.

/** `dev:<uuid>`, minted once per machine into the gitignored .gravitone/device.json. */
export type DeviceId = string;
export type Device = { readonly id: DeviceId; readonly name: string };

/** A media reference that never carries bytes or a machine path: a content hash and a logical location. */
export type MediaRef = {
  readonly kind: "image" | "video" | "audio";
  /** sha256 of the file's bytes, hex. */
  readonly hash: string;
  /** `<root>/<relative>` with a logical root (e.g. `production-fixture/unlatched/plates/P-K00.jpg`), forward slashes. */
  readonly at: string;
};

/** One device's pictures of a character: devices keep their own visual record (operator, 2026-11-20). */
export type CharacterVisual = { readonly kind: "portrait" | "sheet"; readonly media: MediaRef; readonly style?: string };

export type KnowhowCharacter = {
  readonly v: 1;
  readonly id: string; // chr:<key>
  readonly owner: DeviceId; // the device that created it
  readonly at: string; // ISO time of the last change to the text fields
  readonly sourceKey?: string;
  readonly card: { readonly name: string; readonly age?: number; readonly look: string; readonly personality?: string; readonly [k: string]: unknown };
  /** Her identity block, verbatim (what every prompt that draws her leads with). */
  readonly identity: string;
  /** Per art style (a production's look or a Library style slug): the prompts that drew her in it. */
  readonly looks: Readonly<Record<string, { readonly portraitPrompt?: string; readonly sheetPrompt?: string }>>;
  /** Per device id: the pictures that device holds of her. */
  readonly visuals: Readonly<Record<DeviceId, readonly CharacterVisual[]>>;
};

export const LANE_RECORD_KINDS = ["recipe", "lesson", "finding", "bible", "method"] as const;
export type LaneRecordKind = (typeof LANE_RECORD_KINDS)[number];

/** One piece of a lane's know-how. Written once, never rewritten (append-only stream). */
export type KnowhowLaneRecord = {
  readonly v: 1;
  readonly id: string; // stable: `<lane>:<kind>:<sha1 of text, 12 hex>`
  readonly lane: string; // the graph lane: "music-clip", "character", "scout:F1", "style", ...
  readonly kind: LaneRecordKind;
  readonly text: string;
  /** What backs it: a quote, a measurement, a run id; never a machine path. */
  readonly evidence?: string;
  readonly owner: DeviceId;
  readonly at: string;
};

/** A production as the owning device last exported it. Other devices hold it read-only. */
export type KnowhowProduction = {
  readonly v: 1;
  readonly id: string;
  readonly owner: DeviceId;
  /** The owning device's name, for the read-only sentence another device shows. */
  readonly ownerName?: string;
  readonly at: string;
  readonly title: string;
  readonly look: string;
  readonly cast: string; // chr: id
  /** The graph without bytes: each node's station, label, state, madeFrom, prompt, verdict, drift, at/dur, media ref. */
  readonly nodes: readonly {
    readonly id: string;
    readonly station: string;
    readonly label: string;
    readonly state: string;
    readonly madeFrom: readonly string[];
    readonly prompt?: string;
    readonly verdict?: { readonly verdict: "keep" | "reject"; readonly reasons: readonly string[]; readonly note?: string };
    readonly drift?: { readonly identity: string; readonly room: string; readonly wardrobe: string; readonly reason: string; readonly by: string };
    readonly at?: number;
    readonly dur?: number;
    readonly media?: MediaRef;
  }[];
};

/** The folder layout, relative to the repo root. */
export const KNOWHOW_DIR = "knowhow";
export const knowhowPaths = {
  character: (key: string): string => `${KNOWHOW_DIR}/characters/${key}.json`,
  lane: (lane: string, id: string): string => `${KNOWHOW_DIR}/lanes/${lane.replace(/[^a-z0-9-]+/gi, "_")}/${id.replace(/[^a-z0-9-]+/gi, "_")}.json`,
  production: (id: string): string => `${KNOWHOW_DIR}/productions/${id.replace(/[^a-z0-9-]+/gi, "_")}.json`,
  conflict: (id: string, device: DeviceId, at: string): string => `${KNOWHOW_DIR}/conflicts/${id.replace(/[^a-z0-9-]+/gi, "_")}--${device.replace(/[^a-z0-9-]+/gi, "_")}--${at.replace(/[^0-9]/g, "")}.json`,
} as const;

/** A record is someone else's when its owner is not this device. */
export const isForeign = (owner: DeviceId | undefined, self: DeviceId): boolean => owner !== undefined && owner !== self;
