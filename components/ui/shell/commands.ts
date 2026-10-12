"use client";

// The verbs a mounted route contributes to the shell palette.
//
// A plain registry today; when the keymap registry of SIGNAL-A lands, its
// bindings register through the same door and this file is the only seam that
// changes. The store is split from the hooks so a probe can drive register /
// unregister without a renderer.

import { useEffect, useRef, useSyncExternalStore } from "react";

import type { ShellCommand } from "./palette";

export function createCommandRegistry() {
  let list: readonly ShellCommand[] = [];
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  return {
    /** Returns the unregister function. Re-registering an id replaces it. */
    register(cmds: readonly ShellCommand[]): () => void {
      const ids = new Set(cmds.map((c) => c.id));
      list = [...list.filter((c) => !ids.has(c.id)), ...cmds];
      emit();
      return () => {
        // Remove only what THIS registration put there: a later replacement of
        // the same id belongs to its own owner.
        list = list.filter((c) => !cmds.includes(c));
        emit();
      };
    },
    list: (): readonly ShellCommand[] => list,
    subscribe(f: () => void): () => void {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}

// Survives HMR the way the app's other singletons do.
const G = globalThis as { __gtShellCommands?: ReturnType<typeof createCommandRegistry> };
export const shellCommands = (G.__gtShellCommands ??= createCommandRegistry());

/** Contribute verbs while the calling route is mounted. `run` may close over
 *  fresh state: it is read through a ref, so callers need no useCallback. */
export function useShellCommands(cmds: readonly ShellCommand[]): void {
  const ref = useRef(cmds);
  useEffect(() => {
    ref.current = cmds;
  });
  const key = cmds.map((c) => `${c.id}\u0000${c.label}`).join("\u0001");
  useEffect(() => {
    const mine = ref.current.map((c) => ({
      id: c.id,
      label: c.label,
      run: () => ref.current.find((x) => x.id === c.id)?.run(),
    }));
    return shellCommands.register(mine);
  }, [key]);
}

export function useRegisteredCommands(): readonly ShellCommand[] {
  return useSyncExternalStore(shellCommands.subscribe, shellCommands.list, shellCommands.list);
}
