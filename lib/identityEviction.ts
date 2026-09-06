"use client";

// THE EVICTION OWNER — the one routine that wipes everything belonging to a
// signed-out identity.
//
// WHY THIS FILE EXISTS. Every project, theme, asset and step this studio holds
// is keyed to a Firebase uid and persists in IndexedDB and localStorage. Nothing
// removed any of it. Records are keyed `by-uid`, so a second account never SAW
// the first one's rows — but they were still resident on the machine, still
// rendered by anything that read the store directly, and a shared laptop kept
// them until someone cleared site data by hand. At the instant identity flips,
// user-scoped state is not stale, it is ILLEGITIMATE, and the cost of keeping it
// is not a wrong number.
//
// ── WHERE THIS LIVES, AND WHY IT MATTERS ────────────────────────────────────
//
// Below both the identity layer and the stores: this file imports every store it
// clears, and NONE of them import this file. Putting the routine inside
// lib/useAuth.tsx would give the auth context a dependency on every feature in
// the app, and the import cycle that follows is usually resolved by somebody
// quietly deleting a clear.
//
// ── THE TRIGGERS, ENUMERATED ────────────────────────────────────────────────
//
// "Identity changed" is not one event, and inferring it from a credential
// comparison misses most of these. Every one below calls `evictIdentity`:
//
//   · a deliberate sign-out                       → reason "signed-out"
//   · the session ending on its own (expiry)      → reason "session-ended"
//   · revocation from elsewhere (admin, password  → reason "session-ended"
//     change, device removed)
//   · a sign-out in ANOTHER TAB of this profile   → reason "session-ended"
//   · switching accounts directly — the dangerous → reason "account-switched"
//     one, because there is no signed-out moment
//     in between for anything else to notice
//
// The last four are all observed the same way: `onAuthStateChanged` reports a uid
// that is not the uid we were holding. lib/useAuth.tsx compares by DURABLE
// IDENTIFIER (uid) and never by display name or email — those change without the
// person changing, and a reclaimed address stays equal while pointing at somebody
// else.
//
// AND ONE DELIBERATE EXCLUSION, recorded as an exclusion because the next
// maintainer will be tempted to add it "in the safe direction":
//
//   · A PLAIN CREDENTIAL REFRESH IS NOT AN IDENTITY FLIP. Firebase refreshes the
//     ID token on its own cadence. The bearer changes; the user does not.
//     Evicting on refresh would turn routine background maintenance into a
//     periodic wipe of the user's own work on a schedule nobody would ever
//     connect back to the refresh interval. `useAuth` subscribes to
//     onAuthStateChanged, not onIdTokenChanged, and that choice is this rule.
//
// ── WHAT IT WIPES: EVERYTHING USER-SCOPED, ON PURPOSE ───────────────────────
//
// Clearing everything reads as laziness, so here is the asymmetry written down.
// Over-wiping costs a refetch — a slower screen once, at a moment the user is
// already being interrupted. Under-wiping costs a cross-account disclosure. They
// are not comparable, and a "clear the ones whose keys look user-scoped"
// predicate produces under-wiping by construction: a store added later with a
// shape the predicate does not recognise is simply not evicted, nothing fails,
// no test notices, and the defect surfaces on a shared machine.
//
// So every user-scoped store is listed here explicitly, and A NEW STORE'S REVIEW
// HAS ONE ANSWERABLE QUESTION: is it user-scoped, and if so, where is its line in
// this file?
//
// The identity-INDEPENDENT state is the enumerated exception, and it is held in
// `IDENTITY_INDEPENDENT_LOCAL_KEYS` below so a probe can walk every module that
// writes localStorage and demand each key be on ONE of the two lists:
//   · `gravitone.deck.art` — components/ui/deck/useArtVariant.ts. Which art
//     variant the deck cards draw with: a per-browser display preference that
//     says nothing about who is signed in and holds nothing they made. It was
//     written before this paragraph knew it existed ("nothing yet", until
//     2026-09-05), which is exactly the accident the list is here to prevent.
//   There is still no theme switch, no language preference and no "seen this
//   once" flag. If one is added, it is listed HERE with its reason.

import {
  ASSETS_STORE,
  BY_PROJECT,
  BY_UID,
  PROJECTS_STORE,
  STEPS_STORE,
  THEMES_STORE,
  UPLOADS_STORE,
  openDb,
} from "@/lib/studioDb";
// The uploads store is the one place this shelf OWNS bytes (lib/assets.ts): an
// asset row keeps an `upload:<id>` pointer and the picture lives under that id,
// with NO uid on it — the account scoping is on the row that points here. So
// the bytes are found the way `deleteAsset` finds them, through the pointer, and
// they go in the same transaction as the rows. Until 2026-09-05 this file
// deleted the rows by key and never read them, so every uploaded reference the
// departed account had handed over — the only copy, multi-megabyte, a picture
// of whatever they were working on — stayed resident under an id nothing could
// name again, still spending the quota and still readable by anything that
// opened the store.
import { readUploadPointer } from "@/lib/assets";
import { reportStorageTrouble } from "@/app/_phases/_shared/stepStore";
// The job store, like every other store this file clears, is imported BY it and
// does not import it. See the eviction door in lib/jobs.tsx: removing
// `gravitone.jobs.v1` from localStorage evicts the record on disk and leaves the
// root-mounted provider's live copy of it untouched, which is the half a user of
// the next account can actually read.
import { __announceIdentityEvicted } from "@/lib/jobs";

/**
 * WHY the identity changed.
 *
 * The eviction is identical either way; the NARRATION is not. A user who signed
 * out asked for this and expects the entry screen. A user whose session expired
 * asked for nothing, and treating the two identically is what produces the
 * familiar report of being "randomly logged out" — a complaint about the missing
 * explanation, not about the eviction. The reason is carried so a surface can say
 * which happened and offer the matching way back.
 */
export type EvictionReason = "signed-out" | "session-ended" | "account-switched";

export interface EvictionReport {
  uid: string;
  reason: EvictionReason;
  projects: number;
  steps: number;
  themes: number;
  assets: number;
  /** Upload byte records removed — the blobs behind the evicted account's
   *  `upload:` assets. Counted apart from `assets` because the two can differ
   *  (a shelf full of pointers to files on disk has many assets and no uploads),
   *  and a wipe that took the rows and left the pictures has to be readable as
   *  exactly that. */
  uploads: number;
  /** localStorage keys removed. */
  local: number;
  /** Mounted job stores told to drop their in-memory copy of the tray. Zero is
   *  legitimate — no provider is mounted (a Node probe, a server render) — and
   *  is counted rather than assumed, so "nobody was listening" and "nobody was
   *  told" are distinguishable in the line below. */
  trays: number;
  /** True when the wipe could not be completed. The identity transition still
   *  proceeds — see `evictIdentity` — but the caller may say so. */
  failed: boolean;
}

/** The job/notification store. NOT uid-keyed — it is one record for the profile —
 *  so it is cleared wholesale: a job label is what the previous user asked a model
 *  to research, in their own words, and a notification tray that survives an
 *  account switch shows one person's work to another. */
const JOBS_KEY = "gravitone.jobs.v1";

/**
 * Every localStorage key this eviction removes.
 *
 * Listed rather than matched by prefix, for the same reason the stores are: a
 * pattern silently misses whatever is added next, nothing fails, and the defect
 * surfaces on a shared machine. Exported so a probe can hold this list against
 * the modules that actually write those keys.
 */
export function userScopedLocalKeys(uid: string): string[] {
  return [
    `gravitone.seeded.${uid}`, // lib/useProjects.ts — "this account's shelf was seeded"
    `gravitone.assets.seeded.${uid}`, // lib/useAssets.ts — same, for the library
    JOBS_KEY, // lib/jobs.tsx — profile-wide, cleared wholesale (see above)
  ];
}

/**
 * Every localStorage key this eviction deliberately LEAVES — the enumerated
 * exception from the header, as data. A key that is on neither list is the
 * defect: a writer nobody reviewed for scoping. Exported for the same probe
 * that holds `userScopedLocalKeys` against the writers.
 */
export const IDENTITY_INDEPENDENT_LOCAL_KEYS: readonly string[] = [
  "gravitone.deck.art", // components/ui/deck/useArtVariant.ts — a display preference
];

/**
 * Classify an identity transition. `null` means NOT a flip — do not evict.
 *
 * The whole trigger table, as one pure function, so the rules can be asserted
 * rather than read. Note what returns `null`:
 *
 *   · was === now — including a plain CREDENTIAL REFRESH, which changes the
 *     bearer and not the user. This is the deliberate exclusion; a maintainer
 *     who makes it evict "in the safe direction" turns routine background
 *     maintenance into a periodic wipe of the user's own work.
 *   · was === null — the first sign-in of the session. Nothing was held, so
 *     there is nothing illegitimate to remove, and wiping here would delete the
 *     work of the account that is signing IN.
 */
export function transitionFor(was: string | null, now: string | null): EvictionReason | null {
  if (!was) return null;
  if (was === now) return null;
  // Signed out — deliberately, or because the session ended, was revoked, or was
  // ended in another tab. Those are indistinguishable from here; `signOut()`
  // names its own case before this listener ever sees it.
  if (!now) return "session-ended";
  // A DIFFERENT uid with no signed-out moment in between: the dangerous one.
  return "account-switched";
}

/**
 * Wipe every trace of `uid` from this machine.
 *
 * NEVER REJECTS, and that is load-bearing. Signing out also tells Firebase to
 * invalidate the session, and that call can fail — offline, timed out, an
 * authority that is down. The local eviction must happen ANYWAY and must not be
 * able to block the transition: a sign-out that leaves caches intact because a
 * request failed is the worst outcome available, since the user has been told
 * they are signed out, the screen agrees, and the data is still resident and
 * still rendered by the next thing that reads it. Remote invalidation is
 * best-effort; local eviction is the guarantee.
 *
 * A failure is reported through the storage-trouble channel — the same bell every
 * other storage failure reaches — rather than thrown, because there is no caller
 * in a position to retry it.
 */
export async function evictIdentity(uid: string, reason: EvictionReason): Promise<EvictionReport> {
  const report: EvictionReport = {
    uid,
    reason,
    projects: 0,
    steps: 0,
    themes: 0,
    assets: 0,
    uploads: 0,
    local: 0,
    trays: 0,
    failed: false,
  };
  if (!uid) return report;

  // localStorage first: it is synchronous and cannot fail halfway, so doing it
  // before the database means a crash in the (much larger) IDB half still leaves
  // the cheap half done rather than the other way round.
  try {
    if (typeof localStorage !== "undefined") {
      for (const k of userScopedLocalKeys(uid)) {
        if (localStorage.getItem(k) !== null) {
          localStorage.removeItem(k);
          report.local++;
        }
      }
    }
  } catch (e) {
    report.failed = true;
    reportStorageTrouble("write", uid, "sign-out", e);
  }

  // The IN-MEMORY half of the job tray, announced immediately after the stored
  // half is gone. Synchronous, and outside the try above on purpose: it touches
  // no storage, so a localStorage failure must not be the reason the bell keeps
  // showing the previous account's work. Counted into the report beside the
  // keys, because a wipe that told nobody and a wipe with nobody to tell are
  // different facts and the log has to be able to say which.
  report.trays = __announceIdentityEvicted();

  if (typeof indexedDB === "undefined") return report;

  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      // ONE transaction over all five stores. A wipe that half-commits is worse
      // than one that does not run: it leaves an account's steps behind with no
      // projects to reach them by — or its upload bytes behind with no asset row
      // pointing at them — which no surface will ever list and no future
      // eviction will ever find, because the by-uid rows they were reachable
      // through are gone.
      const tx = db.transaction(
        [PROJECTS_STORE, STEPS_STORE, THEMES_STORE, ASSETS_STORE, UPLOADS_STORE],
        "readwrite",
      );
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("eviction aborted"));
      tx.onerror = () => reject(tx.error ?? new Error("eviction failed"));

      const projects = tx.objectStore(PROJECTS_STORE);
      const steps = tx.objectStore(STEPS_STORE);

      // Steps are keyed `${projectId}:${phase}` and indexed BY_PROJECT, not by
      // uid — so the project ids have to be read before the steps can be found.
      // Both halves stay inside this transaction: the deletes are issued from the
      // read's own success callback, which keeps the transaction alive rather than
      // letting it auto-commit in between.
      const projectKeys = projects.index(BY_UID).getAllKeys(uid);
      projectKeys.onsuccess = () => {
        const ids = (projectKeys.result as IDBValidKey[]) ?? [];
        report.projects = ids.length;
        for (const id of ids) {
          projects.delete(id);
          const stepKeys = steps.index(BY_PROJECT).getAllKeys(id as string);
          stepKeys.onsuccess = () => {
            const keys = (stepKeys.result as IDBValidKey[]) ?? [];
            report.steps += keys.length;
            for (const k of keys) steps.delete(k);
          };
        }
      };

      const themes = tx.objectStore(THEMES_STORE);
      const themeKeys = themes.index(BY_UID).getAllKeys(uid);
      themeKeys.onsuccess = () => {
        const keys = (themeKeys.result as IDBValidKey[]) ?? [];
        report.themes = keys.length;
        for (const k of keys) themes.delete(k);
      };

      // Assets are read as RECORDS, not keys, because the row is the only thing
      // that knows whether bytes live behind it. The uploads store has no uid
      // index on purpose (studioDb) — the scoping is on the pointer — so the
      // pointer is followed here exactly as lib/assets.ts#deleteAsset follows it,
      // inside the same transaction, so a row can never outlive its bytes and
      // bytes can never outlive the account that owned them.
      const assets = tx.objectStore(ASSETS_STORE);
      const uploads = tx.objectStore(UPLOADS_STORE);
      const assetRows = assets.index(BY_UID).getAll(uid);
      assetRows.onsuccess = () => {
        const rows = (assetRows.result as { id: IDBValidKey; src?: unknown }[]) ?? [];
        report.assets = rows.length;
        for (const row of rows) {
          assets.delete(row.id);
          const uploadId = typeof row.src === "string" ? readUploadPointer(row.src) : null;
          if (uploadId) {
            uploads.delete(uploadId);
            report.uploads++;
          }
        }
      };
    });
  } catch (e) {
    report.failed = true;
    reportStorageTrouble("write", uid, "sign-out", e);
  }

  console.log(
    `[identity] evicted uid=${uid.slice(0, 6)}… reason=${reason} projects=${report.projects} ` +
      `steps=${report.steps} themes=${report.themes} assets=${report.assets} uploads=${report.uploads} ` +
      `local=${report.local} ` +
      `trays=${report.trays}` +
      (report.failed ? " FAILED" : ""),
  );
  return report;
}
