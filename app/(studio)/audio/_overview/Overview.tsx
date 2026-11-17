// THE AUDIO DESK'S OVERVIEW (design baseline P4, 2026-11-17; owner: "a first overview page, with kept chat interface
// but quick navigation cards in main content so user can pick which module to use or whether to rather use AI
// chat"). The rooms as cards in the column's own groups and order - the mark, the word, the room's count - where the
// studio's conversation would be; the composer under them is the studio's own, and a message sent from it opens
// the conversation in compose (../studio/_host/StudioHost.tsx `cover`). Every card is a plain link; the model is
// the column's (../../_shell/navModel.ts), so the cards and the column cannot disagree.
import Link from "next/link";

import { RoomGlyph } from "@gt/ui/components/glyph/RoomGlyph.tsx";

import type { Rooms } from "../../_shell/navModel.ts";
import s from "./overview.module.css";

export function Overview({ rooms }: { readonly rooms: Rooms }) {
  const groups = rooms.groups.filter((g) => g.label !== null && g.items.length > 0);
  return (
    <div className={s.overview} data-component="AudioOverview">
      {groups.map((g) => (
        <section key={g.id} className={s.group} aria-label={g.label ?? g.id}>
          <h2 className={s.head}>{g.label}</h2>
          <ul className={s.cards}>
            {g.items.map((r) => (
              <li key={r.id}>
                <Link className={s.card} href={r.href} prefetch={false} data-room={r.id}>
                  {r.glyph !== undefined && <RoomGlyph name={r.glyph} className={s.mark} />}
                  <span className={s.name}>{r.label}</span>
                  {r.tally !== undefined && (
                    <span className={s.tally} data-zero={r.tally.value === 0 ? "" : undefined}>
                      <b>{r.tally.value}</b> {r.tally.label}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
