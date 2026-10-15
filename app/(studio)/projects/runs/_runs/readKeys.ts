// The keys Runs answers in Phase 2, drawn from the ONE keymap (bindings.ts) and nothing else:
// the `projects` mode's rows whose verbs this page binds. The write verbs (compose, launch,
// retry, move, pause) keep their rows for Phase 4 but are neither bound nor drawn here - a
// legend that lists a key nobody answers is a dead door in another form.
import { BINDINGS } from "@gt/ui/keymap/bindings";
import { compile } from "@gt/ui/keymap/keymap";

export const READ_VERBS: ReadonlySet<string> = new Set(["runs", "plan", "job", "project", "deselect"]);

export const READ_KEYS = compile(BINDINGS.filter((b) => b.mode === "projects" && READ_VERBS.has(b.verb)));
