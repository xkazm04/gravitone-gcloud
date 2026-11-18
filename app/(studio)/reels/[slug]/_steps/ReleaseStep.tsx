"use client";

// The release step: `reel-release` launched (mix, encode, VMAF), each publish copy's size against its target and
// its VMAF, and the words both slots carry, editable until the release verdict (WP3's verdict bar) is given.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { Field, TextArea } from "@gt/ui/components/field/Field.tsx";

import type { ReelPublish } from "../../../../../lib/reel/store.ts";
import { FILM_FACES, type FilmFace } from "../../../../../lib/reel/types.ts";
import type { ActionResult } from "../../../../_server/actionCore.ts";
import type { ReelDetail } from "../../_port/types.ts";
import type { PublishInput } from "../../_actions/steps.ts";
import { JobLine } from "./JobLine.tsx";
import { Launch, type LaunchFn } from "./Launch.tsx";
import { fmtMb, fmtSeconds, inBand, jobOf, overTarget, targetOf } from "./view.ts";
import s from "./Steps.module.css";

export type ReleaseActs = { readonly launch: LaunchFn; readonly savePublish: (input: PublishInput) => Promise<ActionResult<ReelPublish>> };

function Copy({ face, detail }: { readonly face: FilmFace; readonly detail: ReelDetail }) {
  const c = detail.film?.copies[face];
  const src = face === "desktop" ? detail.media.releaseDesktop : detail.media.releasePhone;
  return (
    <div className={s.face} data-face={face}>
      <div className={s.row}>
        <Chip label={face} tone={c === undefined ? "neutral" : inBand(face, c.bytes) ? "emerald" : "rose"} dot={c !== undefined} />
        <Chip label="target" value={fmtMb(targetOf(face))} casing="lower" />
      </div>
      {c !== undefined && (
        <Facts
          facts={[
            { term: "size", value: `${fmtMb(c.bytes)} (${overTarget(face, c.bytes)})` },
            { term: "length", value: fmtSeconds(c.seconds) },
            { term: "VMAF", value: c.vmaf === undefined ? "—" : `${c.vmaf.mean.toFixed(1)} mean · ${c.vmaf.min.toFixed(1)} min` },
            { term: "bed", value: c.bedSha === undefined ? "silent" : c.bedSha.slice(0, 12) },
          ]}
        />
      )}
      {src !== undefined && <video className={s.player} controls preload="none" src={src} poster={face === "desktop" ? detail.media.posterDesktop : detail.media.posterPhone} aria-label={`${face} release copy`} />}
    </div>
  );
}

const tagsOf = (text: string): string[] => text.split(",").map((t) => t.trim()).filter((t) => t !== "");

export function ReleaseStep({ detail, acts }: { readonly detail: ReelDetail; readonly acts: ReleaseActs }) {
  const router = useRouter();
  const start = detail.publish ?? { title: detail.idea.title, description: detail.idea.hook, tags: [] };
  const [title, setTitle] = useState(start.title);
  const [description, setDescription] = useState(start.description);
  const [tags, setTags] = useState(start.tags.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(detail.publish !== undefined);
  const released = detail.stage === "released";

  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await acts.savePublish({ slug: detail.slug, title, description, tags: tagsOf(tags) });
      if (!r.ok) setError(r.error.error);
      else {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    setSaved(false);
  };

  return (
    <>
      <JobLine job={jobOf(detail.jobs, "reel-release")} />
      <div className={s.faces}>
        {FILM_FACES.map((f) => (
          <Copy key={f} face={f} detail={detail} />
        ))}
      </div>
      <Launch kind="reel-release" slug={detail.slug} label={detail.film?.copies.desktop === undefined ? "Release" : "Release again"} launch={acts.launch} disabled={detail.film?.bed === undefined || released} />
      <div className={s.form}>
        <div className={s.wide}>
          <Field label="publish title" value={title} onChange={edit(setTitle)} maxLength={100} disabled={released} />
        </div>
        <div className={s.wide}>
          <TextArea label="publish description" value={description} onChange={edit(setDescription)} maxLength={5000} rows={4} disabled={released} />
        </div>
        <div className={s.wide}>
          <Field label="publish tags, comma separated" value={tags} onChange={edit(setTags)} maxLength={600} placeholder="data, race, history" disabled={released} />
        </div>
      </div>
      <div className={s.row}>
        <Button label="Save words" tone="amber" size="sm" pending={busy} disabled={released || title.trim() === ""} onPress={() => void save()} />
        {saved && <Chip label="saved" tone="emerald" casing="lower" dot />}
      </div>
      {error !== undefined && <ErrorLine message={error} live />}
    </>
  );
}
