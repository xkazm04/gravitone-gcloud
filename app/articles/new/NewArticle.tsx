"use client";

// /articles/new — a topic (a registry subject, or the operator's own words), an
// optional angle, the model and its effort; Start creates the run and opens it.
//
// The subject list arrives as data from the server page (./page.tsx), which
// read it through lib/articles/registryRead.ts. This file imports nothing from
// lib/articles/ but its types.

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { useMemo, useState } from "react";

import { Field, Segmented, TextArea, TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Primitives";
import { Select, type SelectGroup, type SelectOption } from "@/components/ui/Select";
import { Hint } from "@/components/ui/signal";
import { SURFACE } from "@/components/ui/tokens";
import { EFFORT_LEVELS, type CreateRunInput, type EffortLevel } from "@/lib/articles/types";

import { createRun } from "../articlesClient";

export interface PickerSubject {
  bundle: string;
  slug: string;
  category: string;
}

type Kind = "subject" | "free";

/** The model ids offered. The app's own default, then the CLI's aliases for
 *  the latest of each family (`claude --model` takes either form). */
const modelOptions = (dflt: string): SelectOption<string>[] => [
  { value: dflt, label: dflt },
  ...["opus", "sonnet"].filter((m) => m !== dflt).map((m) => ({ value: m, label: m })),
];

export default function NewArticle({
  subjects,
  registryError,
  defaultModel,
}: {
  subjects: PickerSubject[];
  registryError: string | null;
  defaultModel: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(subjects.length ? "subject" : "free");
  const [bundle, setBundle] = useState("");
  const [slug, setSlug] = useState("");
  const [text, setText] = useState("");
  const [angle, setAngle] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [effort, setEffort] = useState<EffortLevel>("high");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bundles = useMemo<SelectOption<string>[]>(() => {
    const n = new Map<string, number>();
    for (const s of subjects) n.set(s.bundle, (n.get(s.bundle) ?? 0) + 1);
    return [...n].map(([b, c]) => ({ value: b, label: b, meta: c }));
  }, [subjects]);

  const slugs = useMemo<SelectGroup<string>[]>(() => {
    const byCat = new Map<string, SelectOption<string>[]>();
    for (const s of subjects) {
      if (s.bundle !== bundle) continue;
      const cat = s.category || "uncategorised";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push({ value: s.slug, label: s.slug, trigger: s.slug });
    }
    return [...byCat].sort(([a], [b]) => a.localeCompare(b)).map(([label, options]) => ({ label, options }));
  }, [subjects, bundle]);

  const ready = kind === "subject" ? !!bundle && !!slug : text.trim().length > 0;

  const start = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const a = angle.trim();
    const input: CreateRunInput = {
      topic: kind === "subject" ? { kind, bundle, subject: slug, text: "", ...(a ? { angle: a } : {}) } : { kind, text: text.trim(), ...(a ? { angle: a } : {}) },
      model,
      effort,
    };
    const r = await createRun(input);
    if (r.ok) {
      router.push(`/articles/${encodeURIComponent(r.data.run.id)}`);
      return;
    }
    setBusy(false);
    setError(r.error);
  };

  return (
    <main tabIndex={-1} className="mx-auto max-w-3xl space-y-5 pt-1 pb-28" data-testid="articles-new-form">
      <Link href="/articles" className="font-jetbrains inline-flex items-center gap-1.5 text-label text-white/55 hover:text-white">
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
        Articles
      </Link>
      <h1 className="font-instrument text-4xl text-white">New article</h1>

      <form
        className={`${SURFACE} space-y-5 rounded-2xl p-6`}
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <Segmented<Kind>
          label="Topic"
          value={kind}
          onChange={setKind}
          options={[
            { id: "subject", label: "Registry subject" },
            { id: "free", label: "Own words" },
          ]}
        />

        {kind === "subject" ? (
          registryError ? (
            <p role="alert" className="font-jetbrains rounded-xl border border-rose-400/30 bg-rose-400/[0.06] px-4 py-3 text-label break-words text-rose-100" data-testid="articles-registry-error">
              {registryError}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                  label="bundle"
                  value={bundle}
                  placeholder="choose a bundle"
                  options={bundles}
                  onChange={(b) => {
                    setBundle(b);
                    setSlug("");
                  }}
                  className="w-full"
                  testId="articles-bundle"
                />
              <Select label="subject" value={slug} placeholder={bundle ? "choose a subject" : "bundle first"} options={slugs} onChange={setSlug} className="w-full" minWidth={320} testId="articles-subject" />
            </div>
          )
        ) : (
          <Field label="Topic" htmlFor="article-topic">
            <TextInput id="article-topic" value={text} maxLength={600} onChange={(e) => setText(e.target.value)} placeholder="what the post is about" data-testid="articles-topic-text" />
          </Field>
        )}

        <Field label="Angle" htmlFor="article-angle" hint="optional">
          <TextArea id="article-angle" rows={3} value={angle} maxLength={600} onChange={(e) => setAngle(e.target.value)} placeholder="the claim, the reader, the stakes" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="model" value={model} options={modelOptions(defaultModel)} onChange={setModel} className="w-full" testId="articles-model" />
          <Select<EffortLevel> label="effort" value={effort} options={EFFORT_LEVELS.map((e) => ({ value: e, label: e }))} onChange={setEffort} className="w-full" testId="articles-effort" />
        </div>

        {error && (
          <p role="alert" className="font-jetbrains rounded-xl border border-rose-400/30 bg-rose-400/[0.06] px-4 py-3 text-label break-words text-rose-100" data-testid="articles-create-error">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!ready || busy} data-testid="articles-start">
            <Play aria-hidden className="mr-2 inline h-4 w-4" />
            {busy ? "Starting…" : "Start"}
          </Button>
          <Hint label="what a run spends">live web research on the Claude seat; stops at the gate</Hint>
        </div>
      </form>
    </main>
  );
}
