"use client";

// The catalogue card (side A2): the release's metadata as a store's upload form asks for it, set as a printer's form -
// fully in this direction's design. Every edit is the wizard's own `patch` event; the agent's notes on these fields
// sit on the card's margin, the store's rules on its foot.
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Field, Select } from "@gt/ui/components/field/Field.tsx";
import { GENRES, type Genre } from "@gt/domain/release";

import type { ReleaseFields } from "../../../../../../_release/draft.ts";
import { pendingIn } from "../../../../../../_release/pending.ts";
import { orNull } from "../../../../../../_release/wizard/fmt.ts";
import { problemsOf } from "../../../../../../_release/wizard/steps.ts";
import type { SideProps } from "../liner.ts";
import { Margin } from "../Margin.tsx";
import { Errata } from "../Print.tsx";
import { FormCell, FormRule, PrintedCard } from "../PrintedCard.tsx";

const GENRE_OPTIONS: readonly { readonly value: Genre | ""; readonly label: string }[] = [{ value: "", label: "—" }, ...GENRES.map((g) => ({ value: g, label: g }))];

export function DetailsCard({ open, onClose, side }: { readonly open: boolean; readonly onClose: () => void; readonly side: SideProps }) {
  const { release: r, problems, dispatch, session } = side;
  const set = (fields: ReleaseFields) => dispatch({ type: "patch", id: r.id, fields });
  const notes = pendingIn(session.pending, "details").filter((p) => !p.path.startsWith("track:"));
  return (
    <PrintedCard open={open} onClose={onClose} title="Catalogue" mark="A2 · the release" wide foot={<Button label="Done" size="sm" tone="cyan" onPress={onClose} />}>
      <FormRule title="the record">
        <FormCell term="title" w="wide">
          <Field label="release title" value={r.title} onChange={(v) => set({ title: v })} />
        </FormCell>
        <FormCell term="version">
          <Field label="release version" value={r.version ?? ""} placeholder="Deluxe" onChange={(v) => set({ version: orNull(v) })} />
        </FormCell>
        <FormCell term="artist">
          <Field label="artist" value={r.artist} onChange={(v) => set({ artist: v })} />
        </FormCell>
        <FormCell term="label">
          <Field label="record label" value={r.label ?? ""} onChange={(v) => set({ label: orNull(v) })} />
        </FormCell>
        <FormCell term="UPC">
          <Field label="UPC" value={r.upc ?? ""} maxLength={13} placeholder="012345678905" onChange={(v) => set({ upc: orNull(v) })} />
        </FormCell>
      </FormRule>
      <FormRule title="out">
        <FormCell term="release date">
          <Field label="release date" value={r.releaseDate ?? ""} placeholder="YYYY-MM-DD" maxLength={10} onChange={(v) => set({ releaseDate: orNull(v) })} />
        </FormCell>
        <FormCell term="language">
          <Field label="language" value={r.language} placeholder="en" maxLength={35} onChange={(v) => set({ language: v })} />
        </FormCell>
        <FormCell term="primary genre">
          <Select label="primary genre" options={GENRE_OPTIONS} value={r.genre.primary ?? ""} onChange={(v) => set({ genre: { ...r.genre, primary: v === "" ? null : v } })} />
        </FormCell>
        <FormCell term="secondary genre">
          <Select label="secondary genre" options={GENRE_OPTIONS} value={r.genre.secondary ?? ""} onChange={(v) => set({ genre: { ...r.genre, secondary: v === "" ? null : v } })} />
        </FormCell>
      </FormRule>
      <Margin notes={notes} session={session} side="the catalogue" />
      <Errata problems={problemsOf(problems, "details").filter((p) => p.at === "release")} label="catalogue problems" />
    </PrintedCard>
  );
}
