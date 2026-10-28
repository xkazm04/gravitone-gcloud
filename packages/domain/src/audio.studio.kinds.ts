// THE AUDIO STUDIO'S CLOSED VOCABULARY, zod-free so a client island can import it: the node kinds a
// turn may show, the action kinds it may propose, where each action goes, the stem roles and the caps.
// The schemas that hold a turn to it are ./audio.studio.ts; the door is ./audio.studio.door.ts.
// (A classic zod import in a client module costs ~93 KB gzip on first load - ./door.ts.)

export const STUDIO_TURN_VERSION = 1;

export const STUDIO_NODE_KINDS = ["track", "stems", "sections", "candidates", "heard", "pull", "duel", "measures"] as const;
export type StudioNodeKind = (typeof STUDIO_NODE_KINDS)[number];

export const STUDIO_ACTION_KINDS = ["play", "hear", "use_candidate", "swap_stem", "mute", "solo", "level", "pan", "settle_pull", "pick", "render", "say"] as const;
export type StudioActionKind = (typeof STUDIO_ACTION_KINDS)[number];

/** Where an action goes when pressed: `local` changes only what this page plays (the transport);
 *  `agent` is sent back to the agent as the user's next message. Rendering never sends either. */
export const STUDIO_ACTION_GOES: Readonly<Record<StudioActionKind, "local" | "agent">> = {
  play: "local", hear: "local", mute: "local", solo: "local", level: "local", pan: "local",
  use_candidate: "agent", swap_stem: "agent", settle_pull: "agent", pick: "agent", render: "agent", say: "agent",
};

/** Stem roles. A role may repeat (two leads); the stem's `id` is what is unique. */
export const STUDIO_ROLES = ["drums", "percussion", "bass", "chords", "pad", "lead", "texture"] as const;
export type StudioRole = (typeof STUDIO_ROLES)[number];

export const STUDIO_MAX = { nodes: 12, actions: 8, stems: 8, sections: 8, candidates: 8, links: 16, measures: 12 } as const;
