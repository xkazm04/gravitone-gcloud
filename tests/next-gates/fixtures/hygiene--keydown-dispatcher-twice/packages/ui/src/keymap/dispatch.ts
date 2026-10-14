export const on = (f: (e: KeyboardEvent) => void): void => window.addEventListener("keydown", f);
export const again = (f: (e: KeyboardEvent) => void): void => document.addEventListener("keydown", f);
