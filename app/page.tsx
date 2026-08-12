// THE DOOR — the public landing. No headline, no subtitle, no feature list:
// one picture at page scale that says what the studio is, and one button that
// opens Google's sign-in. Everything behind it is gated (components/ui/AuthGate).
//
// The studio itself used to live at this route; it now sits at /studio, opened
// from a row on /projects.
//
// Prototype round 1 ran three doors — an aperture (the studio as a lens), a
// transport (the studio as a finished cut) and this one. The contact sheet won:
// the other two drew the instrument and the result, and only this one draws the
// WORK — candidates on a wall, four of them ringed because somebody decided.

import GateContactSheet from "./_landing/GateContactSheet";

export default function LandingPage() {
  return <GateContactSheet />;
}
