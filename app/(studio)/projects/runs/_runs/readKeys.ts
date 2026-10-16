// The keys Runs answers, drawn from the ONE keymap (bindings.ts) and nothing else: the
// `projects` rows this page binds, and the `projects.runs` rows that only Runs has (pause ·
// resume, re-route, acknowledge a hold). The legend is drawn for one mode, so the Runs rows are
// drawn under `projects` here - for the drawing only; the dispatcher still resolves them in
// `projects.runs`. A row nobody here answers (rename, launch) is not drawn: a legend that lists
// a key nobody answers is a dead door in another form.
import { BINDINGS } from "@gt/ui/keymap/bindings";
import { compile } from "@gt/ui/keymap/keymap";

export const RUNS_VERBS: ReadonlySet<string> = new Set(["runs", "plan", "job", "project", "deselect", "compose", "retry", "move"]);

export const RUNS_KEYS = compile(
  BINDINGS.flatMap((b) => (b.mode === "projects" && RUNS_VERBS.has(b.verb) ? [b] : b.mode === "projects.runs" ? [{ ...b, mode: "projects" }] : [])),
);
