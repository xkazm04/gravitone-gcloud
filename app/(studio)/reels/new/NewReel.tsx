"use client";

// The idea form: title, hook, path, and the slug the folder takes. The slug follows the title until the operator
// types one of their own. The rules are the server's (lib/reel/state.ts parseIdea, lib/reel/store.ts isReelSlug):
// the counters here only mirror the limits, and a refusal comes back in parseIdea's own sentence.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Field, TextArea } from "@gt/ui/components/field/Field.tsx";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { IDEA_LIMITS, slugOf } from "./slug.ts";
import s from "./NewReel.module.css";

type Create = (input: { readonly slug: string; readonly title: string; readonly hook: string; readonly path: string }) => Promise<ActionResult<{ readonly slug: string }>>;

function Count({ n, max, min = false }: { readonly n: number; readonly max: number; readonly min?: boolean }) {
  const bad = min ? n < max : n > max;
  return <Chip label={min ? `≥ ${max}` : `≤ ${max}`} value={n} tone={n === 0 ? "neutral" : bad ? "rose" : "emerald"} casing="lower" name={`${n} characters, ${min ? "at least" : "at most"} ${max}`} />;
}

export function NewReel({ create }: { readonly create: Create }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [path, setPath] = useState("");
  const [slug, setSlug] = useState("");
  const [ownSlug, setOwnSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const shownSlug = ownSlug ? slug : slugOf(title);

  async function submit(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await create({ slug: shownSlug, title, hook, path });
      if (!r.ok) setError(r.error.error);
      else router.push(`/reels/${encodeURIComponent(r.value.slug)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={s.page}>
      <h1 className={s.title}>New reel</h1>
      <form
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className={s.line}>
          <Field label="title" value={title} onChange={setTitle} maxLength={IDEA_LIMITS.title + 20} placeholder="Who led the box office, 1977–2025" />
          <Count n={title.length} max={IDEA_LIMITS.title} />
        </div>
        <div className={s.line}>
          <Field label="hook, a question" value={hook} onChange={setHook} maxLength={IDEA_LIMITS.hook + 20} placeholder="Which studio owned the summer?" />
          <Count n={hook.length} max={IDEA_LIMITS.hook} />
          <Chip label="?" tone={hook.trim().endsWith("?") ? "emerald" : "neutral"} name={hook.trim().endsWith("?") ? "ends with a question mark" : "no question mark yet"} />
        </div>
        <div className={s.line}>
          <TextArea label="path: why someone keeps watching, with names and dates" value={path} onChange={setPath} maxLength={4000} rows={4} placeholder="Paramount leads to 1985, Disney takes it with The Lion King in 1994, Marvel holds it from 2012" />
          <Count n={path.trim().length} max={IDEA_LIMITS.path} min />
        </div>
        <div className={s.line}>
          <Field
            label="slug"
            value={shownSlug}
            onChange={(v) => {
              setOwnSlug(true);
              setSlug(v);
            }}
            maxLength={60}
          />
          <span className={s.mono}>{`/reels/${shownSlug}`}</span>
        </div>
        {error !== undefined && <ErrorLine message={error} live />}
        <div className={s.foot}>
          <Button label="Create reel" tone="emerald" solid pending={busy} disabled={shownSlug === "" || title.trim() === ""} submit />
          <Button label="Cancel" href="/reels" />
        </div>
      </form>
    </main>
  );
}
