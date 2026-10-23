/** Resolve after `ms` milliseconds. The one sleep for lib/; the kernel keeps its own. */
export const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));
