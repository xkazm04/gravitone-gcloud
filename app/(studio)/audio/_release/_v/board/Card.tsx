"use client";

// A release on the shelf: its sleeve is the face, the record behind it slides out under the pointer,
// and the strip under it carries what a label manager scans for - kind, tracks, what blocks, where
// it goes. A release with no sleeve is drawn as a blank sleeve with its title set on it.
import { CHANNEL_NAMES, releaseKind, type Release, type ReleaseChannelId } from "@gt/domain/release";
import type { ReleaseProblem } from "@gt/domain/release.problems";
import { SrOnly } from "@gt/ui/components/a11y/SrOnly.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { cx } from "@gt/ui/components/cx.ts";
import { Plate } from "@gt/ui/components/desk/Plate.tsx";

import { CHANNEL_MARK, clock, kindLabel, severityOf, shortDate, type Severity } from "./board.ts";
import s from "./board.module.css";

export function ChanMark({ channel }: { readonly channel: ReleaseChannelId }) {
  return (
    <span className={cx(s.chan, s[`chan_${channel}`])}>
      <span aria-hidden="true">{CHANNEL_MARK[channel]}</span>
      <SrOnly text={CHANNEL_NAMES[channel]} />
    </span>
  );
}

/** The sleeve, or a blank sleeve with the title on it; `disc` draws the record behind it. */
export function SleeveFace({ release, size, disc = true }: { readonly release: Release; readonly size: "card" | "sheet" | "spine"; readonly disc?: boolean }) {
  const href = release.sleeve?.href ?? null;
  return (
    <span className={cx(s.face, s[`face_${size}`])}>
      {disc && <span className={s.disc} aria-hidden="true" />}
      {href !== null ? (
        <Plate src={href} alt={`${release.title || "untitled"} sleeve`} className={s.sleeve} aspect={1} />
      ) : (
        <span className={cx(s.sleeve, s.blank)} role="img" aria-label={`${release.title || "untitled"}: no sleeve`}>
          <span className={s.blankTitle} aria-hidden="true">
            {release.title || "untitled"}
          </span>
          <span className={s.blankArtist} aria-hidden="true">
            {release.artist}
          </span>
        </span>
      )}
    </span>
  );
}

export function SeverityChips({ sev, quiet = false }: { readonly sev: Severity; readonly quiet?: boolean }) {
  if (sev.block === 0 && sev.warn === 0) return quiet ? null : <Chip label="clear" tone="emerald" dot />;
  return (
    <>
      {sev.block > 0 && <Chip label="block" value={sev.block} tone="rose" />}
      {sev.warn > 0 && <Chip label="warn" value={sev.warn} tone="amber" />}
    </>
  );
}

export function Card({ release, problems, compact, onOpen }: { readonly release: Release; readonly problems: readonly ReleaseProblem[]; readonly compact: boolean; readonly onOpen: () => void }) {
  const kind = releaseKind(release.tracks);
  const total = release.tracks.reduce((n, t) => n + t.durationS, 0);
  const sev = severityOf(problems);
  return (
    <li className={cx(s.card, compact && s.cardCompact)}>
      <button type="button" className={s.cardHit} onClick={onOpen} aria-expanded={false}>
        <SleeveFace release={release} size={compact ? "spine" : "card"} />
        <span className={s.cardTitle}>{release.title || "untitled"}</span>
        <span className={s.cardMeta}>
          <span>{release.artist || "no artist"}</span>
          <span aria-hidden="true">·</span>
          <span>{kindLabel(kind)}</span>
          <span aria-hidden="true">·</span>
          <span>{release.tracks.length === 1 ? "1 track" : `${release.tracks.length} tracks`}</span>
          {!compact && (
            <>
              <span aria-hidden="true">·</span>
              <span>{clock(total)}</span>
            </>
          )}
        </span>
        <span className={s.cardChips}>
          {release.releaseDate !== null && <Chip label="out" value={shortDate(release.releaseDate)} tone="violet" />}
          <SeverityChips sev={sev} />
        </span>
        {!compact && release.channels.length > 0 && (
          <span className={s.cardChans}>
            {release.channels.map((c) => (
              <ChanMark key={c} channel={c} />
            ))}
          </span>
        )}
      </button>
    </li>
  );
}
