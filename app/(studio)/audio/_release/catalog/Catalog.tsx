"use client";

// THE CATALOG (`?s=release`, spark studio-to-release WP1): every stored release in the column of where it stands -
// draft, ready, scheduled, published (./catalog.ts reads it) - each a card that opens into the studio's package stage
// in the session it was born in. A new release from shelf takes is made here (the session's `create`, which the real
// side sends to the store) and opens in the wizard on this tab.
import Link from "next/link";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { EntryPill } from "@gt/ui/components/status/StatusPill.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";

import type { ReleaseRead } from "../_port/port.ts";
import type { ReleaseSessionApi } from "../session.ts";
import { clock, day, KIND_LABEL } from "../wizard/fmt.ts";
import { STATUS_ENTRY } from "../wizard/status.ts";
import { CATALOG_COLUMNS, catalogOf, type CatalogCard } from "./catalog.ts";
import { NewRelease } from "./NewRelease.tsx";
import s from "./catalog.module.css";

function Card({ card: c }: { readonly card: CatalogCard }) {
  return (
    <li>
      <Link href={c.href} className={s.card} aria-label={`open ${c.title} in the studio`}>
        {c.sleeve !== null ? <Plate src={c.sleeve} alt="" className={s.art} width={160} aspect={1} /> : <PlateMissing label="no sleeve" className={s.art} aspect={1} />}
        <span className={s.body}>
          <span className={s.title}>{c.title}</span>
          <span className={s.meta}>
            {c.artist === "" ? "" : `${c.artist} · `}
            {KIND_LABEL[c.kind]} · {c.tracks} {c.tracks === 1 ? "track" : "tracks"} · {clock(c.durationS)}
          </span>
          <span className={s.chips}>
            {c.releaseDate !== null && <Chip label={day(c.releaseDate)} casing="lower" tone="violet" />}
            {c.blocks > 0 && <Chip label="block" value={c.blocks} tone="rose" />}
            {c.warns > 0 && <Chip label="warn" value={c.warns} tone="amber" />}
            {c.pending > 0 && <Chip label="pending" value={c.pending} tone="amber" />}
            {c.sessionId === null && <Chip label="no session" casing="lower" ghost />}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function Catalog({ read, session, newId }: { readonly read: ReleaseRead; readonly session: ReleaseSessionApi; readonly newId: () => string }) {
  const [making, setMaking] = useState(false);
  const columns = catalogOf(session.records, read.source);
  return (
    <div className={s.catalog}>
      <header className={s.head}>
        <CapsHeading text="Releases" tally={{ value: session.records.length }} level={2} />
        <Button label={making ? "Close shelf" : "New release"} tone={making ? "neutral" : "emerald"} onPress={() => setMaking((m) => !m)} />
      </header>
      {making && (
        <NewRelease
          shelf={read.shelf}
          fixture={read.source === "fixture"}
          onStart={(takes) => {
            setMaking(false);
            session.dispatch({ type: "create", id: newId(), artist: read.artist, takes });
          }}
        />
      )}
      {session.notice !== null && <ErrorLine message={session.notice} />}
      <div className={s.columns}>
        {CATALOG_COLUMNS.map((st) => (
          <section key={st} className={s.column} aria-label={`${st} releases`}>
            <div className={s.columnHead}>
              <EntryPill entry={STATUS_ENTRY[st]} />
              <Tally value={columns[st].length} />
            </div>
            {columns[st].length === 0 ? (
              <Ghost label={`no ${st} releases`} />
            ) : (
              <ul className={s.cards}>
                {columns[st].map((c) => (
                  <Card key={c.id} card={c} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
