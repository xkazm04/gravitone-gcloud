"use client";

// Step 4, the sleeve: the picture, large, with its true size and the store's rules beside it, and
// its three sources - generate (N square takes of the sleeve prompt, launched as one `release-sleeve`
// job and read back as candidates; WP3), upload (the file's own pixels, measured here), or a still
// from a music video the track has. The prompt is the release's own field (an edit, so the agent's
// suggestion for it sits under it); the takes and the job are the step's. On the fixture side the
// takes act answers on the page from the fixture's pictures and launches nothing: its view carries
// no job id, which the step shows as state.
import { useEffect, useState } from "react";

import { PRICES } from "@/lib/imaging/pricing";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Plate, PlateMissing } from "@gt/ui/components/desk/Plate.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { TextArea } from "@gt/ui/components/field/Field.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Hint } from "@gt/ui/components/hint/Hint.tsx";
import { Seg } from "@gt/ui/components/seg/Seg.tsx";
import { StatusPill } from "@gt/ui/components/status/StatusPill.tsx";
import { SLEEVE_PX, type Release, type Sleeve, type SleeveSource } from "@gt/domain/release";
import type { SleeveCandidate, SleeveLaunchAnswer, SleeveProvider, SleeveTakesView } from "@gt/domain/release.sleeve";

import { Problems } from "./Problems.tsx";
import { problemsOf, type StepProps } from "./steps.ts";
import { Suggest } from "./Suggest.tsx";
import s from "./sleeve.module.css";

const SOURCE_LABEL: Readonly<Record<SleeveSource, string>> = { generated: "generate", upload: "upload", "mv-look": "MV look" };
const usdOf = (provider: string): number | undefined => PRICES.find((p) => p.provider === provider)?.usdPerImage;
const FLARE = usdOf("leonardo-flare");
const TAKES = 4;
const POLL_MS = 2000;
const SETTLED: ReadonlySet<string> = new Set(["done", "failed", "cancelled", "interrupted", "paused"]);

/** The Server Actions, loaded on the first press: nothing of the server's door enters the step's first load. */
const sleeveActs = () => import("../sleeveActs.ts");

/** The pixels a picture really has, read off the decoded image - never the file's claim. */
function measure(href: string, done: (w: number, h: number) => void, fail: (why: string) => void): void {
  const img = new Image();
  img.onload = () => done(img.naturalWidth, img.naturalHeight);
  img.onerror = () => fail(`${href}: the image did not decode`);
  img.src = href;
}
const measured = (href: string): Promise<{ w: number; h: number } | null> => new Promise((res) => measure(href, (w, h) => res({ w, h }), () => res(null)));

const draftPrompt = (r: Release): string =>
  [`Square album cover for "${r.title}" by ${r.artist}`, r.genre.primary === null ? null : `${r.genre.primary}${r.genre.secondary === null ? "" : ` / ${r.genre.secondary}`} mood`, "no text, no logos, no frame"]
    .filter((x): x is string => x !== null)
    .join(", ");

type Run =
  | { readonly kind: "idle" }
  | { readonly kind: "receipt"; readonly answer: Extract<SleeveLaunchAnswer, { kind: "receipt" | "stale" }> }
  | { readonly kind: "view"; readonly view: SleeveTakesView }
  | { readonly kind: "error"; readonly message: string };

/** The fixture's takes act: its pictures as the candidates, measured here, no job. */
async function fixtureTakes(props: StepProps): Promise<SleeveTakesView> {
  const looks = props.read.mvLooks.slice(0, TAKES);
  const sized = await Promise.all(looks.map(async (m, i) => ({ m, i, px: await measured(m.href) })));
  const candidates: SleeveCandidate[] = sized.flatMap(({ m, i, px }) => (px === null ? [] : [{ n: i + 1, href: m.href, widthPx: px.w, heightPx: px.h, rgb: true, provider: "fixture", model: m.title, dry: false }]));
  return { jobId: null, state: "done", takes: TAKES, candidates, misses: [], error: null };
}

function Candidates({ view, current, onPick }: { readonly view: SleeveTakesView; readonly current: string | null; readonly onPick: (c: SleeveCandidate) => void }) {
  if (view.candidates.length === 0) return null;
  return (
    <ul className={`${s.looks} ${s.takes}`} aria-label="sleeve takes">
      {view.candidates.map((c) => (
        <li key={c.n}>
          <button type="button" className={s.look} aria-pressed={c.href === current} aria-label={`use take ${c.n}, ${c.widthPx} by ${c.heightPx} pixels`} onClick={() => onPick(c)}>
            <Plate src={c.href} alt="" className={s.lookImg} width={160} aspect={1} lazy />
            <span className={s.takeMeta}>
              <span className={s.dims}>
                {c.widthPx} × {c.heightPx}
              </span>
              <Chip label={c.rgb ? "RGB" : "not RGB"} tone={c.rgb ? "emerald" : "rose"} />
              {c.dry && <Chip label="dry" tone="amber" ghost />}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RunState({ view }: { readonly view: SleeveTakesView }) {
  return (
    <div className={s.row} aria-label="sleeve job">
      {view.jobId === null ? <Chip label="no job" ghost /> : <StatusPill machine="job" state={view.state} />}
      {view.jobId !== null && <span className={s.jobId}>{view.jobId}</span>}
      <Chip label="takes" value={`${view.candidates.length}/${view.takes}`} casing="lower" />
    </div>
  );
}

function Generate({ props, onSleeve }: { readonly props: StepProps; readonly onSleeve: (sl: Sleeve) => void }) {
  const { release: r, dispatch } = props;
  const fixture = props.read.source === "fixture";
  const prompt = r.sleevePrompt ?? draftPrompt(r);
  const [provider, setProvider] = useState<SleeveProvider>("codex");
  const [run, setRun] = useState<Run>({ kind: "idle" });
  const [pending, setPending] = useState(false);
  const each = provider === "codex" ? 0 : FLARE;

  // A release's newest run, read back on the real side: its candidates survive a reload.
  useEffect(() => {
    if (fixture) return;
    let live = true;
    void sleeveActs()
      .then((a) => a.sleeveLatestAct({ releaseId: r.id }))
      .then((res) => {
        if (live && res.ok && res.value !== null) setRun({ kind: "view", view: res.value });
      });
    return () => {
      live = false;
    };
  }, [fixture, r.id]);

  // A job still queued or running is read again until it settles.
  const polling = run.kind === "view" && run.view.jobId !== null && !SETTLED.has(run.view.state) ? run.view.jobId : null;
  useEffect(() => {
    if (polling === null) return;
    const t = setTimeout(() => {
      void sleeveActs()
        .then((a) => a.sleeveJobAct({ jobId: polling }))
        .then((res) => setRun(res.ok ? { kind: "view", view: res.value } : { kind: "error", message: res.error.error }));
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [polling, run]);

  const press = async (token?: string) => {
    setPending(true);
    try {
      if (fixture) {
        setRun({ kind: "view", view: await fixtureTakes(props) });
        return;
      }
      const a = await sleeveActs();
      const res = await a.sleeveTakesAct({ ask: { releaseId: r.id, prompt, provider, takes: TAKES }, ...(token === undefined ? {} : { token }) });
      if (!res.ok) setRun({ kind: "error", message: res.error.error });
      else if (res.value.kind === "launched") setRun({ kind: "view", view: res.value.view });
      else setRun({ kind: "receipt", answer: res.value });
    } catch (e) {
      setRun({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setPending(false);
    }
  };

  const running = polling !== null;
  return (
    <div className={s.panel}>
      <TextArea label="sleeve prompt" value={prompt} rows={5} onChange={(v) => dispatch({ type: "patch", id: r.id, fields: { sleevePrompt: v } })} />
      <Suggest path="sleevePrompt" session={props.session} />
      <div className={s.row}>
        <Seg
          label="image provider"
          options={[
            { value: "codex", label: "Codex $0" },
            { value: "leonardo", label: FLARE === undefined ? "Leonardo · unpriced" : `Leonardo $${FLARE.toFixed(4)}` },
          ]}
          value={provider}
          onChange={(p) => {
            setProvider(p);
            if (run.kind === "receipt") setRun({ kind: "idle" });
          }}
        />
        {provider === "leonardo" && <Hint name="Leonardo price basis" text="GPT Image 2.5 Flare, 6 credits at 1024×1024, as measured" />}
      </div>
      <div className={s.row}>
        <Button
          label={`${TAKES} takes`}
          pending={pending || running}
          disabled={prompt.trim() === ""}
          badge={each === undefined ? undefined : { label: "total", value: `$${(each * TAKES).toFixed(2)}` }}
          onPress={() => void press()}
        />
        {run.kind === "receipt" && (
          <>
            {run.answer.kind === "stale" && <Chip label="receipt moved" tone="amber" />}
            <Button label="Confirm" tone="amber" pending={pending} badge={{ label: "receipt", value: run.answer.usd === null ? "unpriced" : `$${run.answer.usd.toFixed(2)}`, tone: "amber" }} onPress={() => void press(run.answer.token)} />
          </>
        )}
      </div>
      {run.kind === "error" && <ErrorLine message={run.message} live />}
      {run.kind === "view" && (
        <>
          <RunState view={run.view} />
          {run.view.error !== null && <ErrorLine message={run.view.error} live />}
          {run.view.misses.map((m) => (
            <ErrorLine key={m.n} message={`take ${m.n}: ${m.reason}`} />
          ))}
          <Candidates view={run.view} current={r.sleeve?.href ?? null} onPick={(c) => onSleeve({ source: "generated", href: c.href, widthPx: c.widthPx, heightPx: c.heightPx, rgb: c.rgb })} />
        </>
      )}
    </div>
  );
}

function Upload({ onSleeve }: { readonly onSleeve: (sl: Sleeve) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={s.panel}>
      <label className={s.file}>
        <input
          type="file"
          accept="image/jpeg,image/png"
          className={s.fileInput}
          aria-label="sleeve image file"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            if (file === undefined) return;
            const href = URL.createObjectURL(file);
            setError(null);
            measure(
              href,
              (w, h) => onSleeve({ source: "upload", href, widthPx: w, heightPx: h, rgb: /^image\/(jpeg|png)$/.test(file.type) }),
              () => {
                URL.revokeObjectURL(href);
                setError(`${file.name}: the image did not decode`);
              },
            );
          }}
        />
        <span aria-hidden="true">Choose a JPG or PNG</span>
      </label>
      {error !== null && <ErrorLine message={error} live />}
    </div>
  );
}

function MvLooks({ props, onSleeve }: { readonly props: StepProps; readonly onSleeve: (sl: Sleeve) => void }) {
  const [error, setError] = useState<string | null>(null);
  const current = props.release.sleeve?.href ?? null;
  if (props.read.mvLooks.length === 0) return <Chip label="no music-video stills" ghost />;
  return (
    <div className={s.panel}>
      <ul className={s.looks} aria-label="music-video stills">
        {props.read.mvLooks.map((m) => (
          <li key={m.href}>
            <button
              type="button"
              className={s.look}
              aria-pressed={m.href === current}
              aria-label={`use the still from ${m.title}`}
              onClick={() => {
                setError(null);
                measure(m.href, (w, h) => onSleeve({ source: "mv-look", href: m.href, widthPx: w, heightPx: h, rgb: true }), setError);
              }}
            >
              <Plate src={m.href} alt="" className={s.lookImg} width={160} aspect={1} lazy />
              <span className={s.lookTitle}>{m.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {error !== null && <ErrorLine message={error} live />}
    </div>
  );
}

export function StepSleeve(props: StepProps) {
  const { release: r, problems, dispatch } = props;
  const sl = r.sleeve;
  const [source, setSource] = useState<SleeveSource>(sl?.source ?? (props.read.mvLooks.length > 0 ? "mv-look" : "upload"));
  const onSleeve = (next: Sleeve | null) => dispatch({ type: "sleeve", id: r.id, sleeve: next });
  const square = sl === null || sl.widthPx === sl.heightPx;
  return (
    <div className={s.sleeve}>
      <figure className={s.stage} data-square={square ? "" : undefined}>
        {sl !== null && sl.href !== null ? (
          <Plate src={sl.href} alt={`sleeve of ${r.title}`} className={s.art} aspect={sl.widthPx > 0 && sl.heightPx > 0 ? sl.widthPx / sl.heightPx : 1} />
        ) : (
          <PlateMissing label="no sleeve" className={s.missing} aspect={1} />
        )}
        {sl !== null && (
          <figcaption className={s.caption}>
            <span className={s.dims}>
              {sl.widthPx} × {sl.heightPx} px
            </span>
            <Chip label={sl.rgb ? "RGB" : "not RGB"} tone={sl.rgb ? "emerald" : "rose"} />
            <Chip label={SOURCE_LABEL[sl.source]} casing="lower" />
          </figcaption>
        )}
      </figure>
      <div className={s.side}>
        <Problems problems={problemsOf(problems, "sleeve")} label="sleeve problems" />
        <section aria-label="store rules">
          <CapsHeading text="Stores ask for" variant="section" />
          <Facts
            facts={[
              { term: "shape", value: "square" },
              { term: "size", value: `${SLEEVE_PX} × ${SLEEVE_PX} px` },
              { term: "colour", value: "RGB" },
            ]}
          />
        </section>
        <section aria-label="sleeve source">
          <CapsHeading text="Source" variant="section" />
          <Seg label="sleeve source" options={(["mv-look", "upload", "generated"] as const).map((v) => ({ value: v, label: SOURCE_LABEL[v] }))} value={source} onChange={setSource} />
          {source === "generated" && <Generate props={props} onSleeve={onSleeve} />}
          {source === "upload" && <Upload onSleeve={onSleeve} />}
          {source === "mv-look" && <MvLooks props={props} onSleeve={onSleeve} />}
        </section>
        {sl !== null && <Button label="Remove sleeve" size="sm" tone="rose" onPress={() => onSleeve(null)} />}
      </div>
    </div>
  );
}
