// What a studio read could not find (`notFound()` in projects/[id], projects/[id]/[part] and
// library/style/[id]), drawn inside the shell: the header stays, and the body names the missing
// work by its id (./_shell/frames/missing.ts). Before this file the operator met Next's default
// white 404 inside a dark studio. An address no route matches is the root's, not this one.
//
// NO loading.tsx MAY SIT ABOVE A PAGE THAT CALLS notFound(). A loading frame starts the response
// stream before the page runs, so the status is already 200 when notFound() fires: the screen is
// right and the answer is wrong. Measured 2026-11-10 (spark fable-ten): with frames on projects,
// projects/[id], projects/[id]/[part], library and library/style/[id] every unknown project, part
// and style answered 200, and the live lane's `seeded()` helper, which finds a project by asking
// for a 200, took the first id it tried. Those five frames were removed; these routes keep the 404.
import { NotFound } from "./_shell/frames/NotFound.tsx";

export default function StudioNotFound() {
  return <NotFound />;
}
