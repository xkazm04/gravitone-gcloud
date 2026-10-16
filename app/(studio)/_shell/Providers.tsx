"use client";

// THE SHELL'S RESIDENTS - everything that lives for the session and reaches across
// sections, and nothing else (app-shell shell-hosted-services: session-lifetime state,
// reach across sections, exactly one instance). Each names its reaper:
//
//   · the keymap dispatcher (@gt/ui/keymap/dispatch) - the app's one keydown listener.
//     Installed once for the life of the page; a full load (sign-out below) is its reaper.
//   · the live layer stack (@gt/ui/layers/live) - module state, no provider of its own:
//     a layer's owner unmounting removes its entry, so navigation is the reaper.
//   · the toast region - ALWAYS mounted, empty until news arrives (Toast.tsx), so the
//     region exists before the first announcement; its queue is ./toast.ts.
//   · the storage adapter (@gt/ui/storage) with identity eviction: every key the world
//     writes is registered in ./keys.ts. On mount the shell compares who it is serving
//     with who this browser last served and evicts on a flip (v1 lib/identityEviction.ts,
//     kept in meaning: a refresh of the same uid is NOT a flip, a first sign-in evicts
//     nothing). Sign-out evicts on BOTH outcomes of the remote call - the local wipe never
//     waits on the network.
//   · the session cookie's renewal (./session.ts) - follows Firebase's token rotation;
//     unsubscribed with the shell.
//
// Children's effects run before this one, so a screen's first read of a remembered key can
// precede the eviction; it reads through `useStored`, whose eviction arrives as an ordinary
// store notification, so a flipped identity's value is on screen for at most one commit.

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

import { AppError } from "@gt/domain/errors";
import { ensureDispatcher } from "@gt/ui/keymap/dispatch";
import { identityFlip } from "@gt/ui/storage/identity";
import { createStore, type Store } from "@gt/ui/storage/store";
import { Toast, type ToastLedger } from "@gt/ui/components/toast/Toast.tsx";
import { useAuth } from "@/lib/useAuth";

import { KEYS, LAST_IDENTITY } from "./keys.ts";
import { subscribeSessionCookie } from "./session.ts";
import { noReceipt, receipt, showToast, subscribeReceipts } from "./toast.ts";

const made = createStore(KEYS, () => (typeof window === "undefined" ? null : window.localStorage));
// A registration that could lie (a duplicate key, a key outside the namespace) is a
// programming error in keys.ts, not a runtime condition: fail the module, loudly.
if (!made.ok) throw made.error;
const store: Store = made.value;

type Shell = {
  readonly store: Store;
  /** One line; an act the ledger records passes its door too (a chip on the toast). */
  readonly toast: (message: string, ledger?: ToastLedger) => void;
  readonly signOut: () => Promise<void>;
};

const ShellContext = createContext<Shell | null>(null);

export function useShell(): Shell {
  const s = useContext(ShellContext);
  if (s === null) throw new AppError("internal", "useShell outside the (studio) shell");
  return s;
}

export function Providers({ identity, children }: { readonly identity: string | null; readonly children: ReactNode }) {
  const note = useSyncExternalStore(subscribeReceipts, receipt, noReceipt);
  const v1 = useAuth();

  useEffect(() => {
    ensureDispatcher();
  }, []);

  useEffect(() => {
    // null is "not known here" (the handoff has not run), never "signed out": judging it
    // as a flip would wipe the same person's keys every time their cookie expired with its
    // token. A real sign-out is the deliberate path below.
    if (identity === null) return;
    const was = store.read(LAST_IDENTITY);
    // An unreadable record of who was here cannot vouch that it was this person: wipe, in
    // the safe direction (over-wiping costs a refetch; under-wiping, a disclosure).
    const flip = was.ok ? identityFlip(was.value ?? null, identity) : "account-switched";
    const failures = flip === null ? [] : [...store.evict("identity").failures];
    const wrote = store.write(LAST_IDENTITY, identity);
    if (!wrote.ok) failures.push(wrote.error);
    if (failures.length > 0) showToast(`storage - ${failures.map((f) => f.message).join("; ")}`);
  }, [identity]);

  // The cookie follows Firebase's token rotation for as long as the shell is up.
  useEffect(() => subscribeSessionCookie((m) => showToast(`session not renewed - ${m}`)), []);

  const signOut = useCallback(async () => {
    const failures: string[] = [];
    const settle = async (what: string, run: () => Promise<unknown>): Promise<void> => {
      try {
        await run();
      } catch (cause) {
        failures.push(`${what}: ${cause instanceof Error ? cause.message : String(cause)}`);
      }
    };
    // The server cookie (Lot 8's /api/session) and v1's Firebase client session both end,
    // or the client would post a fresh token and sign straight back in.
    await settle("session", async () => {
      const r = await fetch("/api/session", { method: "DELETE" });
      if (!r.ok) throw new AppError("unavailable", `answered ${r.status}`);
    });
    await settle("firebase", () => v1.signOut());
    const report = store.evict("identity");
    store.remove(LAST_IDENTITY);
    for (const f of report.failures) failures.push(`storage: ${f.message}`);
    if (failures.length > 0) {
      showToast(`sign-out incomplete - ${failures.join("; ")}`);
      return;
    }
    // A full load, not a router push: it is the reaper of every module-level resident above.
    window.location.replace("/");
  }, [v1]);

  const shell = useMemo<Shell>(() => ({ store, toast: showToast, signOut }), [signOut]);

  return (
    <ShellContext.Provider value={shell}>
      {children}
      <Toast message={note.message} open={note.open} ledger={note.ledger} />
    </ShellContext.Provider>
  );
}
