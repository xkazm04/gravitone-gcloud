// THE LIBRARY'S AREAS — one registry, read by the Library's tab rail and by the
// public landing, so an area added here appears in both without a second edit.
//
// Until 2026-10-07 the four areas existed only as inline JSX in LibraryView's
// tab list, which left the landing (app/_landing/cosmos) two choices: hand-copy
// the list and drift, or not show the library at all. Order is the rail's order.
//
// `locked` carries the reason an area exists but cannot be opened yet; the rail
// shows it as the tab's disabled reason and the landing draws the area strapped
// shut. Per-area COUNTS are not here on purpose: they live in each user's
// IndexedDB and the landing is a public page that must never invent one.

export interface LibraryArea {
  id: "styles" | "assets" | "animations" | "audio";
  label: string;
  locked?: string;
}

export const LIBRARY_AREAS: readonly LibraryArea[] = [
  { id: "styles", label: "Styles" },
  { id: "assets", label: "Assets" },
  { id: "animations", label: "Animations", locked: "no engine yet" },
  { id: "audio", label: "Audio" },
];

export const libraryArea = (id: LibraryArea["id"]): LibraryArea =>
  LIBRARY_AREAS.find((a) => a.id === id) as LibraryArea;
