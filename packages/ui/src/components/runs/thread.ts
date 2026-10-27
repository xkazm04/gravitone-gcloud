// WHAT BLOCKS WHAT - pure: given the dependencies v1 records and a selection, which bars are
// lit, which links are drawn and in which tone (prototype projects.js `drawLinks`, studio.js
// `upstream`/`downstream`).
//
// An edge `{ from, to }` reads "`to` waits for `from`". The tones are the prototype's:
//   up    the selected job's upstream chain - what it waits for (cyan);
//   down  its downstream chain - what waits for it (amber);
//   rest  an edge inside a lit project that is on neither chain (faint);
//   bad   drawn dashed rose when the job it leads INTO is blocked (an upstream failed).
// Everything outside the lit set dims. Nothing here invents an edge: the caller passes only
// the dependencies a v1 store wrote down, and a job with none lights alone.

export type Dep = { readonly from: string; readonly to: string };

export type Tone = "up" | "down" | "rest";
export type Link = Dep & { readonly tone: Tone; readonly bad: boolean };

export type Lit = {
  /** The bars drawn at full strength; every other bar dims. */
  readonly ids: ReadonlySet<string>;
  readonly links: readonly Link[];
};

function walk(start: string, next: ReadonlyMap<string, readonly string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(next.get(start) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id) || id === start) continue;
    seen.add(id);
    stack.push(...(next.get(id) ?? []));
  }
  return seen;
}

function index(deps: readonly Dep[]): { ups: Map<string, string[]>; downs: Map<string, string[]> } {
  const ups = new Map<string, string[]>();
  const downs = new Map<string, string[]>();
  for (const d of deps) {
    // push, never spread: a spread copies the list per edge, quadratic in a node's fan-in.
    const u = ups.get(d.to);
    if (u === undefined) ups.set(d.to, [d.from]);
    else u.push(d.from);
    const w = downs.get(d.from);
    if (w === undefined) downs.set(d.from, [d.to]);
    else w.push(d.to);
  }
  return { ups, downs };
}

/** Everything `id` waits for, transitively. A cycle in the records ends the walk, never loops it. */
export const upstreamOf = (id: string, deps: readonly Dep[]): Set<string> => walk(id, index(deps).ups);
/** Everything that waits for `id`, transitively. */
export const downstreamOf = (id: string, deps: readonly Dep[]): Set<string> => walk(id, index(deps).downs);

/** The direct dependency of `id` that has failed, if any: what the inspector names as the block. */
export function blockedBy(id: string, deps: readonly Dep[], failed: (id: string) => boolean): string | null {
  for (const d of deps) if (d.to === id && failed(d.from)) return d.from;
  return null;
}

/**
 * The lit set for a selection. `job` lights its chains; `members` (a project's bars) lights a
 * whole thread with its internal edges at rest. Both may be given: the job's chains are toned
 * inside the project's thread. Null when nothing is selected - nothing dims.
 */
export function light(sel: { readonly job?: string | null; readonly members?: ReadonlySet<string> }, deps: readonly Dep[], blocked: ReadonlySet<string>): Lit | null {
  const job = sel.job ?? null;
  const members = sel.members ?? new Set<string>();
  if (job === null && members.size === 0) return null;
  const up = job === null ? new Set<string>() : upstreamOf(job, deps);
  const down = job === null ? new Set<string>() : downstreamOf(job, deps);
  const ids = new Set<string>([...members, ...up, ...down]);
  if (job !== null) ids.add(job);
  const links: Link[] = [];
  for (const d of deps) {
    if (!ids.has(d.from) || !ids.has(d.to)) continue;
    const isUp = job !== null && (d.to === job || (up.has(d.from) && up.has(d.to)));
    const isDown = job !== null && (d.from === job || (down.has(d.from) && down.has(d.to)));
    links.push({ ...d, tone: isUp ? "up" : isDown ? "down" : "rest", bad: blocked.has(d.to) });
  }
  return { ids, links };
}
