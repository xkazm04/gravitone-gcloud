// GENERATED from packages/ui/tokens/source.json by pipeline/gen-tokens.mts - do not edit.
// Regenerate with: npm run tokens:gen

export const tokens = {
  // ground
  "faint": "#7a8398",
  "hair": "rgba(255,255,255,.08)",
  "hair-2": "rgba(255,255,255,.14)",
  "hair-3": "rgba(255,255,255,.22)",
  "ink": "#080a10",
  "ink-1": "#0b0e15",
  "ink-2": "#10141d",
  "ink-3": "#161b27",
  "ink-4": "#1d2331",
  "ink-bright": "#f3f6fb",
  "muted": "#9aa3b6",
  "text": "#d9dfea",
  // signal
  "amber": "#fbbf24",
  "amber-a": "rgba(251,191,36,.10)",
  "cyan": "#67e8f9",
  "cyan-a": "rgba(103,232,249,.10)",
  "emerald": "#6ee7b7",
  "emerald-a": "rgba(110,231,183,.10)",
  "rose": "#fb7185",
  "rose-a": "rgba(251,113,133,.12)",
  "violet": "#a78bfa",
  "violet-a": "rgba(167,139,250,.10)",
  "wall": "#c88f1c",
  "wall-hi": "#ffd66b",
  // actors
  "actor-agent": "#a78bfa",
  "actor-machine": "#67e8f9",
  "actor-operator": "#fbbf24",
  // type
  "fs-body": "15px",
  "fs-h1": "32px",
  "fs-h2": "19px",
  "fs-h3": "16px",
  "fs-meta": "13px",
  "fs-micro": "12px",
  "fs-read": "17px",
  "fs-ui": "14px",
  "mono": "\"JetBrains Mono\",\"Cascadia Mono\",Consolas,ui-monospace,monospace",
  "sans": "\"Inter\",\"Segoe UI Variable Text\",\"Segoe UI\",system-ui,-apple-system,sans-serif",
  "serif": "\"Iowan Old Style\",\"Charter\",\"Georgia\",serif",
  // space
  "sp-1": "4px",
  "sp-2": "6px",
  "sp-3": "8px",
  "sp-4": "10px",
  "sp-5": "12px",
  "sp-6": "18px",
  "sp-7": "24px",
  // radii
  "r": "10px",
  "r-lg": "14px",
  "r-sm": "7px",
  "r-xs": "5px",
  // motion
  "dur": ".3s",
  "dur-fast": ".15s",
  "dur-slow": ".6s",
  "ease": "cubic-bezier(.22,1,.36,1)",
  // frame
  "cal-w": "clamp(260px,19vw,340px)",
  "cols": "52px minmax(0,1.32fr) minmax(0,.9fr) minmax(0,1fr)",
  "hdr-h": "56px",
  "head-h": "40px",
  // roles-surface
  "focus-line": "rgba(103,232,249,.55)",
  "ink-veil": "rgba(8,10,16,.85)",
  "letterbox": "#000",
  "paper": "#ece6d8",
  "shadow": "rgba(0,0,0,.6)",
  "wash": "rgba(255,255,255,.04)",
  "wash-hi": "rgba(255,255,255,.05)",
  // roles-text
  "done-text": "#a7f3d0",
  "error-text": "#fecdd3",
  "illustrative-text": "#fcd77a",
  "reading": "#e9e4d8",
  "reference-text": "#c3cad8",
  // roles-shape
  "r-chip": "6px",
  "r-control": "8px",
  // roles-layer
  "z-docked": "25",
  "z-flyer": "200",
  "z-header": "30",
  "z-popover": "60",
  "z-scrim": "40",
  "z-sheet": "50",
  "z-toast": "210",
  "z-tooltip": "80",
} as const;

export type TokenName = keyof typeof tokens;

/** The custom-property reference for a token, e.g. `var(--ink-bright)`. */
export function cssVar(name: TokenName): string {
  return `var(--${name})`;
}
