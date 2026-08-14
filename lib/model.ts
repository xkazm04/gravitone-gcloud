/** The model the notebook was researched with, and the one recalibration uses.
 *
 *  Its own module so a client component can name it without importing
 *  lib/anthropic.ts — that file pulls in the SDK and reads credentials, and
 *  neither belongs in a browser bundle.
 */
export const MODEL = "claude-opus-5";
