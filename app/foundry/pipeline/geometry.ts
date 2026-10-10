// THE BOARD'S GEOMETRY, as one door.
//
// This was 507 lines of four separable things that only shared the word
// "geometry". They are four files now, and this stays as the door so every
// existing `from "./geometry"` keeps working:
//
//   ./grid     the measurements (and the reason each is that number) and the types
//   ./buildLayout  the only thing here that allocates — the only thing here that allocates
//   ./cells    where a card is, what is on screen, what an arrow walks to
//   ./camera   the camera as arithmetic, with no browser in it

export * from "./grid";
export * from "./buildLayout";
export * from "./cells";
export * from "./camera";
