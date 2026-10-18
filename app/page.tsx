// THE LANDING — the public page. A paper galaxy of everything the studio makes:
// every project type, its templates and the library, read from the registries
// that own them, and one button that opens Google's sign-in (or, signed in,
// the way through). Everything behind it is gated on the server: the (studio) layout asks
// `principal()` before anything renders (app/(studio)/layout.tsx; v1's client-side AuthGate
// retired with v1's screens).
//
// The studio itself lives at /projects - the Plan, a project's parts and Runs.
//
// History: round 1 ran three doors (an aperture, a transport, a contact sheet);
// the contact sheet won and shipped as a wall of thirty frames. On 2026-09-29
// the owner chose the Almanac star atlas from contest landing-nextgen-brand-r2;
// on 2026-10-07 the Paper Cosmos from contest landing-universe replaced it,
// because the atlas was hand-placed and already behind the registries. See
// app/_landing/cosmos/Cosmos.tsx.

import Cosmos from "./_landing/cosmos/Cosmos";

export default function LandingPage() {
  return <Cosmos />;
}
