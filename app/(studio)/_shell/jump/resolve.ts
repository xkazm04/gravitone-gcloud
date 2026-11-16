// WHERE JUMP GOES - one pure function from what the operator typed to the rows Jump draws
// (spark fable-ten, package C). Client-safe: plain data in, plain rows out.
//
// The routes are not spelled here. A record's id resolves through the function that already
// owns where a record lives (../links.ts `subjectLink`), and that function's rule is kept: never
// a link to a route that does not render. An id is offered at its own page when its SHAPE names
// one (a packet `pkt:<source>:<run>` is a Board, a kernel job `job:...` a bar in Runs), and every
// typed query also offers its history in the Ledger (`ledgerFor`), which always renders - so an
// id this table cannot place, or a well-formed one nobody minted, still lands on the one page
// that says everything the studio knows about it, never on a guess.
//
// Sections come from ../nav.ts (built ones only: an unbuilt section is no destination), projects
// from the Projects port's list, read by the caller.

import { ledgerFor, parsePacketId, subjectLink } from "../links.ts";
import type { Section } from "../nav.ts";

export type JumpProject = { readonly id: string; readonly title: string };
export type JumpDest = { readonly key: string; readonly label: string; readonly kind: string; readonly href: string };

/** A project's Plan. The same address as ../../projects/_plan/CompositionList.tsx `planHref` (not imported: it would pull the list's component module into Jump's chunk). */
const planHref = (id: string): string => `/projects/${encodeURIComponent(id)}`;

/** A pasted address may arrive encoded (`pkt%3Ascout%3A…`, copied out of a URL bar). */
function decoded(q: string): string {
  if (!q.includes("%")) return q;
  try {
    return decodeURIComponent(q);
  } catch {
    return q;
  }
}

const JOB = "job:";
const KERNEL_JOB = "kernel:job:";

/** The record page an id's shape names, through subjectLink; null when its shape names none. */
function recordOf(id: string): JumpDest | null {
  const at = (kind: string, label: string, subject: string): JumpDest => {
    const link = subjectLink({ subject: { kind, id: subject }, data: {} });
    return { key: `${kind}:${id}`, label: id, kind: label, href: link.href };
  };
  if (parsePacketId(id) !== null) return at("packet", "board", id);
  // A kernel id (`job:run:…`, `job:part:…`, what the kernel mints) or a Runs key that already
  // carries its source (`kernel:job:…`) is a bar in Runs; subjectLink keys it as Runs does.
  if ((id.startsWith(KERNEL_JOB) && id.length > KERNEL_JOB.length) || (id.startsWith(JOB) && id.length > JOB.length)) return at("job", "runs", id);
  return null;
}

const fold = (s: string): string => s.toLocaleLowerCase();

export function destinations(query: string, sections: readonly Section[], projects: readonly JumpProject[]): JumpDest[] {
  const built = sections.filter((s) => s.built);
  const sectionRow = (s: Section): JumpDest => ({ key: `section:${s.id}`, label: s.label, kind: "section", href: s.href });
  const projectRow = (p: JumpProject): JumpDest => ({ key: `project:${p.id}`, label: p.title, kind: "project", href: planHref(p.id) });
  const q = decoded(query.trim());
  if (q === "") return [...built.map(sectionRow), ...projects.map(projectRow)];
  const needle = fold(q);
  const record = recordOf(q);
  return [
    ...(record === null ? [] : [record]),
    ...built.filter((s) => fold(s.label).includes(needle)).map(sectionRow),
    ...projects.filter((p) => fold(p.title).includes(needle) || p.id === q).map(projectRow),
    { key: `ledger:${q}`, label: q, kind: "ledger", href: ledgerFor(q) },
  ];
}
