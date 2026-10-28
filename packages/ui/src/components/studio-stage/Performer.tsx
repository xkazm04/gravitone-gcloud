// ONE PERFORMER ON THE STAGE (spark audio-agent-studio, variant "stage"): a part of the song drawn
// as a player seen from the audience. Its role mark sits in a disc; a halo around the disc glows with
// the part's own loudness at the playhead (./stage.ts haloLevel), so who is playing is who you see.
// Presence says why a player is or is not heard: `on` plays, `out` stepped back (muted), `dim`
// another player has the spotlight, `soon` has no audio yet and is drawn as a dashed silhouette
// "joining soon". Apart from presence, `resting` says it sits out the section the strip shows. A
// spotlight (solo) lights a cone above it. The pips under the name are the part's entries per
// section, against the stage's lighting strip.
// Controls (play mark, faders) arrive as children: the tile proposes nothing on its own.
import type { CSSProperties, ReactNode } from "react";

import type { StudioRole } from "@gt/domain/audio.studio.kinds";
import { RoleGlyph } from "./RoleGlyph.tsx";
import { ROLE_WORDS } from "./stage.ts";
import s from "./Performer.module.css";

export type Presence = "on" | "out" | "dim" | "soon";

export type PerformerProps = {
  readonly role: StudioRole;
  /** What a listener hears in it ("warm finger bass"). */
  readonly label: string;
  readonly presence: Presence;
  /** It sits out the section the strip shows (picked, or under the playhead). */
  readonly resting?: boolean;
  readonly spotlight: boolean;
  /** 0..1, the halo at the playhead; 0 when silent. */
  readonly level: number;
  /** It is heard right now (its rim lights, steadier than the halo). */
  readonly sounding?: boolean;
  /** Its entries per section (omitted: plays everywhere, no pips drawn). */
  readonly enters?: readonly boolean[] | undefined;
  /** The section the strip has picked, its pip ringed. */
  readonly section?: number | null;
  /** Someone else is standing in for this player right now ("Smooth Synth Bass"). */
  readonly standIn?: string | null;
  /** How many players wait in the wings to take this spot. */
  readonly waiting?: number;
  readonly children?: ReactNode;
};

const STATUS: Readonly<Record<Presence, string>> = {
  on: "on stage",
  out: "stepped back",
  dim: "waiting while another plays alone",
  soon: "joining soon, not yet audible",
};

export function Performer({ role, label, presence, resting = false, spotlight, level, sounding = false, enters, section = null, standIn = null, waiting = 0, children }: PerformerProps) {
  const halo = { "--halo": String(Math.max(0, Math.min(1, level))) } as CSSProperties;
  return (
    <article className={s.performer} data-presence={presence} data-resting={resting || undefined} data-spot={spotlight || undefined} data-lit={sounding || undefined} aria-label={`${label}, ${ROLE_WORDS[role]}`}>
      {spotlight && <span className={s.cone} aria-hidden="true" />}
      <div className={s.head}>
        <span className={s.disc} style={halo}>
          <span className={s.halo} aria-hidden="true" />
          <RoleGlyph role={role} className={s.mark} />
        </span>
        <span className={s.words}>
          <b className={s.label}>{standIn ?? label}</b>
          <span className={s.role}>{ROLE_WORDS[role]}</span>
        </span>
      </div>
      <span className={s.status}>
        {standIn !== null && <span className={s.standIn}>{`stepping in for ${label}`}</span>}
        {spotlight && presence === "on" ? "in the spotlight" : STATUS[presence]}
        {resting && <span className={s.resting}>sits this part out</span>}
        {waiting > 0 && <span className={s.waiting}>{`${waiting} waiting in the wings`}</span>}
      </span>
      {enters !== undefined && (
        <span className={s.pips} role="img" aria-label={`plays in ${enters.filter(Boolean).length} of ${enters.length} parts of the song`}>
          {enters.map((on, i) => (
            <span key={i} className={s.pip} data-on={on || undefined} data-picked={section === i || undefined} />
          ))}
        </span>
      )}
      {children !== undefined && <div className={s.controls}>{children}</div>}
    </article>
  );
}
