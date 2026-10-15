// A state in words with its mark (tokens.css `.state`): the prototype's `GT.State(s, label)`,
// which took any string and so drew a colourless pill for any word nobody mapped. This one
// takes a machine and that machine's state, and nothing else.
import { cx } from "../cx.ts";
import { statusOf, type Machine, type StatusEntry, type Vocabulary } from "./status.ts";
import s from "./StatusPill.module.css";

export type StatusPillProps<M extends Machine> = { readonly machine: M; readonly state: Vocabulary[M] };

export function StatusPill<M extends Machine>({ machine, state }: StatusPillProps<M>) {
  return <EntryPill entry={statusOf(machine, state)} />;
}

/** The same pill for an entry already resolved (a wire token through `statusFromWire`). */
export function EntryPill({ entry }: { readonly entry: StatusEntry }) {
  return <span className={cx(s.state, s[entry.look])}>{entry.label}</span>;
}
