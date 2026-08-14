/** The model the notebook was researched with, and the one recalibration uses.
 *
 *  Its own module so a client component can name it without importing
 *  `lib/claudeCli.ts` — that file spawns a child process (`node:child_process`),
 *  which is not something a browser bundle can contain. `RecalibrateControl.tsx`
 *  is the client that names it; `lib/claudeCli.ts` is the server that runs it.
 *
 *  The note here used to point at `lib/anthropic.ts` — an SDK wrapper that read
 *  an API key. It does not exist in this repo: the engine became the logged-in
 *  `claude` CLI, so there is no key to keep out of the bundle, only a process.
 */
export const MODEL = "claude-opus-5";
