// THE DOOR — the public landing. One picture at page scale that says what the
// studio is (a star atlas of real candidates, four of them picked and joined by
// a cut), and one button that opens Google's sign-in. Everything behind it is
// gated (components/ui/AuthGate).
//
// The studio itself lives at /studio, opened from a row on /projects.
//
// History: round 1 ran three doors (an aperture, a transport, a contact sheet);
// the contact sheet won and shipped as a wall of thirty frames. On 2026-09-29
// the owner chose the Almanac from contest landing-nextgen-brand-r2 to replace
// it: see app/_landing/Door.tsx.
//
// The optional `slot` on the door is where the brand kit's link will sit once
// the /kit route exists; nothing fills it yet.

import Door from "./_landing/Door";

export default function LandingPage() {
  return <Door />;
}
