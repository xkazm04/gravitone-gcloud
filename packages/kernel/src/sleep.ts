/** The one timer promise the kernel waits on between retries (blob renames, lease waits, job backoff). */
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
