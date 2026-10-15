// The signal hues a chip or button may take, plus the neutral rest. Named for the hue
// because the hue IS the meaning here: tokens.css gives each exactly one ("cyan: running ·
// foundry · focus", "amber: awaiting the operator"), so `amber` reads as a role, not a paint.
export const TONES = ["neutral", "cyan", "violet", "emerald", "amber", "rose"] as const;
export type Tone = (typeof TONES)[number];
