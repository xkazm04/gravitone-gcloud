// WHAT THE SHELF SAYS ABOUT A PROJECT'S CONTENT - the cut's length against the length it was
// composed for, the picture's address, and the search over the words the summary carries. Pure, so
// the list draws them and a probe asserts them without a browser.
import type { ProjectGroup, ProjectList, ProjectPoster, ProjectSummary } from "@gt/domain/produce";

/** Seconds as `m:ss`; null (not 0) is unknown and reads `?`. */
export const clock = (s: number | null): string => {
  if (s === null) return "?";
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** `1:30 / 2:00`, `? / 2:00`, `1:30`, or null when the project knows neither. */
export const runtimeWords = (p: Pick<ProjectSummary, "runtimeS" | "targetS">): string | null =>
  p.runtimeS === null && p.targetS === null ? null : p.targetS === null ? clock(p.runtimeS) : `${clock(p.runtimeS)} / ${clock(p.targetS)}`;

export const posterSrc = (p: ProjectPoster): string => `/api/blob/${p.sha256}?type=${encodeURIComponent(p.mime)}`;

/** Every word of the query is found in the project's title, topic, notebook or script. */
export const matches = (p: Pick<ProjectSummary, "text">, query: string): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== "");
  return words.every((w) => p.text.includes(w));
};

/** The prototype's list groups, in its order, each with its mark's tone. */
export const GROUPS: readonly { readonly id: ProjectGroup; readonly label: string; readonly tone: string }[] = [
  { id: "weir", label: "At the weir", tone: "amber" },
  { id: "blocked", label: "Blocked", tone: "rose" },
  { id: "active", label: "Running · queued", tone: "cyan" },
  { id: "plans", label: "Plans", tone: "faint" },
  { id: "shipped", label: "Shipped", tone: "emerald" },
];

/** The list in the order its keys walk it (↑/↓): group by group. */
export const ordered = (list: ProjectList): ProjectSummary[] => GROUPS.flatMap((g) => list.projects.filter((p) => p.group === g.id));

