// What a studio read could not find (`notFound()` in projects/[id], projects/[id]/[part] and
// library/style/[id]), drawn inside the shell: the header stays, and the body names the missing
// work by its id (./_shell/frames/missing.ts). Before this file the operator met Next's default
// white 404 inside a dark studio. An address no route matches is the root's, not this one.
import { NotFound } from "./_shell/frames/NotFound.tsx";

export default function StudioNotFound() {
  return <NotFound />;
}
