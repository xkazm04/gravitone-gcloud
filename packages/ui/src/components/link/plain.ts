// THE PLAIN-CLICK RULE for a link the kit routes client-side: a primary-button click with no
// modifier is the page's to route; anything else (middle button, a modified click that opens a tab
// or window) is the browser's. One spelling, so a new modifier is fixed once.
export type ClickLike = { readonly button: number; readonly metaKey: boolean; readonly ctrlKey: boolean; readonly shiftKey: boolean; readonly altKey: boolean };

export const plainClick = (e: ClickLike): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
