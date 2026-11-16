"use client";

// The desk's top strip: every release as one chip-sized card (sleeve, title, kind, status, what
// blocks it), the open one pressed, and New at the end - from the picked takes, or blank.
import { releaseKind, type Release } from "@gt/domain/release";
import { releaseProblems } from "@gt/domain/release.problems";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";

import { KIND_LABEL, STATUS_TONE, count } from "./fmt.ts";
import s from "./desk.module.css";

export type StripProps = {
  readonly releases: readonly Release[];
  readonly currentId: string | null;
  readonly picked: number;
  readonly onOpen: (id: string) => void;
  readonly onNew: () => void;
};

export function Strip({ releases, currentId, picked, onOpen, onNew }: StripProps) {
  return (
    <nav className={s.strip} aria-label="releases">
      <ul className={s.stripList}>
        {releases.map((r) => {
          const ps = releaseProblems(r);
          const blocks = count(ps, "block");
          const warns = count(ps, "warn");
          return (
            <li key={r.id}>
              <button type="button" className={s.rel} aria-pressed={r.id === currentId} onClick={() => onOpen(r.id)}>
                {r.sleeve?.href ? <Plate src={r.sleeve.href} alt="" className={s.relThumb} /> : <PlateMissing className={s.relThumb} />}
                <span className={s.relText}>
                  <span className={s.relTitle}>{r.title.trim() === "" ? "untitled" : r.title}</span>
                  <span className={s.relMeta}>
                    {KIND_LABEL[releaseKind(r.tracks)]} · {r.tracks.length} {r.tracks.length === 1 ? "track" : "tracks"}
                    {r.releaseDate === null ? "" : ` · ${r.releaseDate}`}
                  </span>
                </span>
                <span className={s.relChips}>
                  <Chip label={r.status} tone={STATUS_TONE[r.status]} dot />
                  {blocks > 0 ? <Chip label="block" value={blocks} tone="rose" /> : warns > 0 ? <Chip label="warn" value={warns} tone="amber" /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <Button label="New" tone="cyan" onPress={onNew} {...(picked > 0 ? { badge: { label: "takes", value: picked, tone: "cyan" as const } } : {})} />
    </nav>
  );
}
