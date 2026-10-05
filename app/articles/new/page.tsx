import { connection } from "next/server";

import AuthGate from "@/components/ui/AuthGate";
import StudioFrame from "@/components/ui/StudioFrame";
import { listTopicSubjects } from "@/lib/articles/registryRead";
import { MODEL } from "@/lib/model";

import NewArticle, { type PickerSubject } from "./NewArticle";

export const metadata = {
  title: "New article | Gravitone",
};

// THE REGISTRY IS READ HERE, ON THE SERVER, and only here. registryRead.ts finds
// the registry through server-side configuration and the filesystem; the form
// below is a client component and receives the subject list as data, so no
// browser chunk carries the reader or names where it looks. `connection()`
// keeps the read per request: the registry moves under the app (a /forge run, a
// merged PR), and a list frozen at build time would offer subjects that are gone.
export default async function Page() {
  await connection();
  let subjects: PickerSubject[] = [];
  let registryError: string | null = null;
  try {
    subjects = (await listTopicSubjects()).map(({ bundle, slug, category }) => ({ bundle, slug, category }));
  } catch (e) {
    registryError = e instanceof Error ? e.message : String(e);
  }
  return (
    <AuthGate>
      <StudioFrame>
        <NewArticle subjects={subjects} registryError={registryError} defaultModel={MODEL} />
      </StudioFrame>
    </AuthGate>
  );
}
