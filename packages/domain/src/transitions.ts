import { err, ok, type Result } from "./errors.ts";

export type Machine<S extends string> = {
  readonly states: readonly S[];
  can(from: S, to: S): boolean;
  assert(from: S, to: S): Result<S>;
  next(from: S): readonly S[];
};

/**
 * A state machine as data. Declare the table `as const satisfies Record<...>`
 * so `S` is inferred from its keys: adding a state is one edit, and the union
 * changes with it.
 */
export function defineMachine<const T extends Record<keyof T, readonly (keyof T & string)[]>>(
  table: T,
): Machine<keyof T & string> {
  type S = keyof T & string;
  const states = Object.keys(table).filter((k): k is S => k in table);
  const next = (from: S): readonly S[] => table[from];
  const can = (from: S, to: S): boolean => next(from).includes(to);
  return {
    states,
    can,
    next,
    assert: (from, to) => (can(from, to) ? ok(to) : err("refused", `transition ${from} -> ${to} is not declared`)),
  };
}
