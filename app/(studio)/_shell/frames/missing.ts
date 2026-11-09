// What a studio address that called `notFound()` was looking for, in the work's own words, and the
// door back (../../not-found.tsx). The id in the URL is the work - `no project nope` - and a
// "page not found" sentence would be the app talking about itself.
//
// Three reads call notFound() today: a project (projects/[id]), a part of one (projects/[id]/[part])
// and a style (library/style/[id]). Anything else under the studio falls back to the address's
// last segment and its section.

import { SECTIONS, sectionOf } from "../nav.ts";

export type Missing = { readonly label: string; readonly door: { readonly label: string; readonly href: string } };

const seg = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function missing(pathname: string): Missing {
  const parts = pathname.split("/").filter((p) => p.length > 0).map(seg);
  const [head, a, b] = parts;
  if (head === "projects" && a !== undefined && a !== "runs") {
    if (b === undefined) return { label: `no project ${a}`, door: { label: "projects", href: "/projects" } };
    return { label: `no part ${b} in ${a}`, door: { label: a, href: `/projects/${encodeURIComponent(a)}` } };
  }
  if (head === "library" && a === "style" && b !== undefined) return { label: `no style ${b}`, door: { label: "library", href: "/library" } };
  const id = sectionOf(pathname);
  const section = SECTIONS.find((x) => x.id === id) ?? SECTIONS[0];
  const last = parts[parts.length - 1];
  return {
    label: last === undefined ? "nothing here" : `no ${last}`,
    door: section === undefined ? { label: "floor", href: "/floor" } : { label: section.label.toLowerCase(), href: section.href },
  };
}
