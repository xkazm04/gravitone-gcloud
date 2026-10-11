// THE ONE HOOK a surface mounts to show storage trouble. Split out of the
// stepStore.ts door, which re-exports it. It is the module's only React code: a thin
// useSyncExternalStore over the trouble channel.

import { useSyncExternalStore } from "react";

import type { StorageTrouble } from "./storageOutcome";
import { lastStorageTrouble, onStorageTrouble, serverTrouble } from "./troubleChannel";

/** The whole subscription, for a surface that wants to say so. A user editing
 *  for an hour against a full quota finds out from this, before they close the
 *  tab — mounting it anywhere in the tree is enough. */
export function useStorageTrouble(): StorageTrouble | null {
  return useSyncExternalStore(onStorageTrouble, lastStorageTrouble, serverTrouble);
}
