export const on = (f: (e: KeyboardEvent) => void): void => window.addEventListener("keydown", f);
