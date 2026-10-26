// THE LESSONS SECTION OF THE AUDIO DESK (Phase 6, L65): the signed lessons of one kind - the
// beliefs the next hunt's map is briefed with (lib/sound/hunt.ts huntPrompt quotes them) and
// `pipeline/sound.mts knowledge` turns into knowledge/audio/. Read-only here: a lesson is signed
// where its evidence is (a hunt's lesson part, a strengths cell), never typed in from nowhere.
import { LessonList } from "@gt/ui/components/audio/LessonList.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";

import { huntHref } from "../_hunt/url.ts";
import type { LessonsView } from "./read.ts";
import s from "../_hunt/hunt.module.css";

export function Lessons({ view }: { readonly view: LessonsView }) {
  const n = view.lessons.ok ? view.lessons.value.length : 0;
  return (
    <section className={s.section} aria-label="lessons">
      <CapsHeading text="lessons" tally={{ value: n, label: "signed" }} level={2} />
      {view.hunts !== null && <ErrorLine message={view.hunts} />}
      {!view.lessons.ok ? <ErrorLine message={view.lessons.error} /> : n === 0 ? <Empty label="no lessons signed yet" /> : <LessonList lessons={view.lessons.value} huntHref={(id) => huntHref(view.kind, id)} />}
    </section>
  );
}
