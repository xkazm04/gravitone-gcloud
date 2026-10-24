// THE STUDIO'S IN-PAGE NAVIGATION TOOLS - what a desktop agent holding this page in a tab (Athena,
// athena-portable's page bridge) may do to the operator's VIEW, registered on `document.modelContext`
// by ./AgentNav.tsx when a bridge provides one. The data door is /api/mcp (docs/mcp.md); these move
// the screen only: no read the page does not already show, no write, so each declares itself
// reversible with no side effects and Athena's gate classifies it AUTO.
//
// Pure: the tool table, the input schemas (JSON Schema - the bridge carries them to the agent's
// catalog as they are) and the one guard that decides which addresses `open` may go to. The guard is
// the navigation registry's own (./nav.ts sectionOf): an address inside a studio section, or a Board
// packet, and never another origin (`//host`, `https:`) or a protocol trick (`javascript:`).

import { SECTIONS, sectionOf, type Section } from "./nav.ts";

export type NavToolName = "where_am_i" | "go_to" | "open";

export type NavTool = {
  readonly name: NavToolName;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly annotations: { readonly readOnlyHint: boolean };
  /** The bridge's own claim (packages/athena-bridge/gate.js flagsOf): reversible, nothing leaves the app. */
  readonly athena: { readonly reversible: true; readonly side_effects: "none" };
};

const SECTION_IDS = SECTIONS.filter((s) => s.built).map((s) => s.id);

const NAV_FLAGS = { reversible: true, side_effects: "none" } as const;

export const NAV_TOOLS: readonly NavTool[] = [
  {
    name: "where_am_i",
    title: "Where the studio is",
    description: "The address on screen, its studio section, the page heading, and every section with its address.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
    athena: NAV_FLAGS,
  },
  {
    name: "go_to",
    title: "Go to a section",
    description: `Show one studio section: ${SECTION_IDS.join(", ")}. Answers the address and heading once it is on screen.`,
    inputSchema: { type: "object", properties: { section: { type: "string", enum: SECTION_IDS } }, required: ["section"], additionalProperties: false },
    annotations: { readOnlyHint: false },
    athena: NAV_FLAGS,
  },
  {
    name: "open",
    title: "Open an address",
    description: "Show one studio address, e.g. a `view` link from /api/mcp: /projects/<id>, /projects/runs?job=<id>, /board/<packet>, /library?sel=<id>, /ledger?ev=<seq>.",
    inputSchema: { type: "object", properties: { path: { type: "string", maxLength: 300 } }, required: ["path"], additionalProperties: false },
    annotations: { readOnlyHint: false },
    athena: NAV_FLAGS,
  },
];

/** One path segment's and one query's characters: what the studio's own addresses use. */
const PATH_RE = /^\/(?!\/)[A-Za-z0-9/_:%.~-]*(\?[A-Za-z0-9=&_:%.~,-]*)?$/;
const BOARD_RE = /^\/board\/pkt(:|%3A)[A-Za-z0-9_-]+(:|%3A)[A-Za-z0-9_:%./-]+$/;

/** The address `open` may show, or why not, in the work's words. */
export function studioPath(raw: unknown): { readonly ok: true; readonly path: string } | { readonly ok: false; readonly reason: string } {
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, reason: "open needs a path such as /projects/runs" };
  if (raw.length > 300) return { ok: false, reason: "a studio address is at most 300 characters" };
  if (!PATH_RE.test(raw)) return { ok: false, reason: `${raw} is not a studio address: a path on this origin, starting with one /` };
  const pathname = raw.split("?")[0] ?? raw;
  if (BOARD_RE.test(pathname) || sectionOf(pathname) !== null) return { ok: true, path: raw };
  return { ok: false, reason: `${pathname} is in no studio section (${SECTION_IDS.join(", ")}) and is not a Board packet` };
}

/** The address a section id names, or undefined for a word the registry does not have. */
export function sectionHref(id: unknown): string | undefined {
  return SECTIONS.find((s: Section) => s.built && s.id === id)?.href;
}

/** What `where_am_i` and a finished navigation answer. */
export type Here = {
  readonly path: string;
  readonly section: Section["id"] | null;
  readonly heading: string | null;
  readonly title: string;
};

export function hereOf(path: string, title: string, heading: string | null): Here {
  return { path, section: sectionOf(path.split("?")[0] ?? path), heading, title };
}

/** The sections `where_am_i` lists beside the answer. */
export const SECTION_LIST: readonly { readonly id: Section["id"]; readonly label: string; readonly href: string }[] = SECTIONS.filter((s) => s.built).map((s) => ({ id: s.id, label: s.label, href: s.href }));

/**
 * Whether the screen has reached `target`: the same path, carrying every query parameter the target
 * named. A page may add its own (the Ledger selects its newest event as `?ev=<seq>`), and that is
 * still the address asked for; a parameter the target named with another value is not.
 */
export function arrived(target: string, current: string): boolean {
  const t = new URL(target, "http://studio.invalid");
  const c = new URL(current, "http://studio.invalid");
  if (t.pathname !== c.pathname) return false;
  for (const [k, v] of t.searchParams) if (c.searchParams.get(k) !== v) return false;
  return true;
}
