// THE SIGNED LESSONS of a kind, newest first: each claim verbatim (the work), what it rests on
// (n, the keep rate, the rubric mean, its techniques and provider), when it was signed, and - for
// a hunt's lesson - the hunt it answered, as a door back to that map. v1 had no such list on any
// surface (`pipeline/sound.mts lessons` printed them); the next hunt's prompt quotes these.
import { Chip } from "../chip/Chip.tsx";
import { Tally } from "../tally/Tally.tsx";
import s from "./Lesson.module.css";

export type LessonRow = {
  readonly id: string;
  readonly claim: string;
  readonly source: "triage" | "hunt";
  readonly provider: string | null;
  readonly technique: readonly string[];
  readonly n: number;
  readonly keepRate: number | null;
  readonly meanScore: number | null;
  readonly confirmedAt: string;
  readonly hunt?: { readonly id: string; readonly idea: string | null };
};

export function LessonList({ lessons, huntHref }: { readonly lessons: readonly LessonRow[]; readonly huntHref: (id: string) => string }) {
  return (
    <ol className={s.list} aria-label="signed lessons">
      {lessons.map((l) => (
        <li key={l.id} className={s.row}>
          <p className={s.said}>{l.claim}</p>
          <div className={s.meta}>
            <Tally value={l.n} label="judged" />
            {l.keepRate !== null && <Chip label="kept" value={`${Math.round(l.keepRate * 100)}%`} tone="emerald" />}
            {l.meanScore !== null && <Chip label="mean" value={l.meanScore} />}
            <Chip label={l.source} casing="lower" />
            {l.provider !== null && <Chip label={l.provider} casing="lower" />}
            {l.technique.map((t) => (
              <Chip key={t} label={t} tone="violet" casing="lower" ghost />
            ))}
            <span>{l.confirmedAt.slice(0, 10)}</span>
            {l.hunt !== undefined && <a href={huntHref(l.hunt.id)}>{l.hunt.idea ?? l.hunt.id}</a>}
          </div>
        </li>
      ))}
    </ol>
  );
}
