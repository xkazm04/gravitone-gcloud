// /projects/new - v1's creation wizard, retired in Phase 4 wave D. A project is composed from a
// recipe now (Compose, over the composition list); the old address opens it there.
import { redirect } from "next/navigation";

export default function V1NewProject() {
  redirect("/projects?compose=1");
}
