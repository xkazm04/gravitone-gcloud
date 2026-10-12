// THE GALAXY — the one shape the Paper Cosmos engine draws from.
//
// It is the contest's data shape (landing-universe, data/SCHEMA.md) minus the
// fields the winner never read, so the engine ported from the winning variant
// runs on it unchanged. `data.ts` fills it from the app's registries; the
// engine never imports a registry itself, which is what lets it render a
// projected 20-type galaxy in a test exactly as it renders today's five.
//
// ABSENT VALUES: `art: null` means no real picture exists and the engine draws
// stylised paper art seeded from the id; `items: null` means the count is not
// known here (never 0, which would claim emptiness). Art is a URL path served
// from public/ ("/deck-art/…", "/presets/…").

export interface GalaxyType {
  id: string;
  label: string;
  art: string | null;
}

export interface GalaxyTemplate {
  id: string;
  label: string;
  /** a GalaxyType id */
  type: string;
  seconds: number | null;
  art: string | null;
}

export interface GalaxyCategory {
  id: string;
  label: string;
  items: number | null;
  art?: string | null;
}

export interface GalaxyFamily {
  id: string;
  label: string;
  status: "live" | "locked";
  categories: GalaxyCategory[];
}

export interface Galaxy {
  types: GalaxyType[];
  templates: GalaxyTemplate[];
  library: GalaxyFamily[];
  /** production steps in order, as the words the stage chips show */
  studioSteps: string[];
}
