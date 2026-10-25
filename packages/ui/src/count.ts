// THE ONE SINGULAR/PLURAL RULE for every count the kit speaks (`1 item`, `2 items`, `1 day`).
// Regular nouns only: an irregular one is written whole at its call site.

/** The noun for `n`: singular at exactly one, else with an `s`. */
export const plural = (n: number, noun: string): string => (n === 1 ? noun : `${noun}s`);

/** `n` and its noun: `1 event`, `0 events`. */
export const count = (n: number, noun: string): string => `${n} ${plural(n, noun)}`;
