/** Which presses a window-level foundry key handler must leave alone.
 *
 *  A chord belongs to the browser or the OS: Ctrl+K is the browser's search,
 *  Ctrl+X is cut, Ctrl+U is view-source, Ctrl/Alt+Arrow jump words and history.
 *  The cull, the Extract board, the Dojo gate and the lightbox all bound bare
 *  K / X / U / Enter on `window` with no modifier check, so each of those
 *  shortcuts also stamped a verdict on the focused plate.
 *
 *  An auto-repeated press is refused for everything but the arrows: holding an
 *  arrow walks the grid, which is what a held arrow means, but holding K must not
 *  decide every tile the focus passes over. This is the rule the Board already
 *  applies (lib/board/keys.ts `boardKeyAction`); here it is one function the five
 *  foundry handlers call first, held by tests/golden-path/foundry-key-guard.probe. */
export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
}

export function refusedKey(e: KeyLike): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  return Boolean(e.repeat) && !e.key.startsWith("Arrow");
}
