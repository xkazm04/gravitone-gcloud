"use client";

// ONE LEAF, UP CLOSE — the prompt the drafter wrote and why, and the one act
// its engine allows: render it (ElevenLabs), carry it to Suno and back by hand,
// or read what a local lane would need. Once it has a take: hear it, crown it,
// or reject it with the defect that sank it.

import { useRef, useState } from "react";

import { Check, Copy, Crown, Lock, Repeat, Upload, X } from "lucide-react";

import { PipRow } from "@/components/ui/signal";
import { copyText } from "@/app/library/audio/clipboard";
import type { DefectCode, Hunt, HuntNode, SoundTake } from "@/lib/sound/types";

import { engineById } from "../engines";
import {
  DefectChips,
  DefectPicker,
  ProviderChip,
  TechniqueChips,
  VerdictChip,
} from "../shared/Chips";
import { SpendButton } from "../shared/price";
import { ErrorLine } from "../shared/shell";
import { BTN, BTN_KEEP, BTN_REJECT, CAPS, CARD } from "../shared/ui";
import { PlayButton, TakeWave } from "../shared/Wave";
import { lengthOf, loopOf, sfxAnatomy } from "./model";
import type { HuntApi } from "./useHunt";

export function Inspector({
  api,
  hunt,
  node,
  takes,
}: {
  api: HuntApi;
  hunt: Hunt;
  node: HuntNode;
  takes: SoundTake[];
}) {
  const reach = api.reach(node.provider);
  const engine = engineById(api.reg, node.provider);
  const take = takes[0] ?? null;
  const busy = !!api.run;
  const anatomy = hunt.kind === "sfx" ? sfxAnatomy(node.prompt) : [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className={`${CAPS} truncate`}>{node.axis}</span>
          <ProviderChip provider={node.provider} engine={engine} />
        </div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-instrument text-2xl leading-tight text-white">
            {node.label}
          </h3>
          {node.winner && (
            <Crown
              className="mt-1.5 h-5 w-5 shrink-0 text-emerald-300"
              aria-label="winner"
            />
          )}
        </div>
        <span className="flex items-center gap-2 font-jetbrains text-label text-white/45">
          <span className="tabular-nums">{lengthOf(node.durationS)}</span>
          {hunt.kind === "sfx" && (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3.5 w-3.5" aria-hidden />
              {loopOf(node) ? "loop" : "one-shot"}
            </span>
          )}
        </span>
      </div>

      {node.rationale && (
        <p className="font-hanken text-label leading-snug text-white/65">
          {node.rationale}
        </p>
      )}

      {anatomy.length > 0 && (
        <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1">
          {anatomy.map((a) => (
            <div key={a.part} className="contents">
              <dt className={CAPS}>{a.part}</dt>
              <dd className="font-hanken text-label text-white/80">{a.text}</dd>
            </div>
          ))}
        </dl>
      )}

      <PromptField
        label={node.provider === "suno" ? "style" : "prompt"}
        text={node.prompt}
        onCopied={
          node.provider === "suno"
            ? () => void api.awaitReturn(hunt.id, node.id)
            : undefined
        }
      />
      {node.negative && (
        <PromptField
          label="exclude"
          text={node.negative}
          tone="rose"
          onCopied={
            node.provider === "suno"
              ? () => void api.awaitReturn(hunt.id, node.id)
              : undefined
          }
        />
      )}
      <TechniqueChips technique={node.technique} />

      {node.state === "failed" && node.error && <ErrorLine text={node.error} />}

      {take ? (
        <TakePanel
          api={api}
          hunt={hunt}
          node={node}
          take={take}
          versions={takes.length}
        />
      ) : node.state === "rendering" ? (
        <p className="animate-pulse font-jetbrains text-label text-cyan-200/75">
          rendering · {lengthOf(node.durationS)} of audio
        </p>
      ) : reach === "api" ? (
        <SpendButton
          cost={api.cost(node.durationS)}
          busy={busy}
          onClick={() => void api.render(hunt.id, [node.id])}
        >
          {node.state === "failed" ? "render again" : "render this leaf"}
        </SpendButton>
      ) : reach === "manual" ? (
        <ReturnDrop
          onFile={(f) => api.fileReturn(hunt.id, node.id, f)}
          awaiting={node.state === "awaiting-return"}
        />
      ) : (
        <NotInstalled
          needs={engine?.needs ?? []}
          candidates={engine?.candidates ?? []}
          reason={engine?.withheld[0]?.reason ?? null}
        />
      )}
    </div>
  );
}

function PromptField({
  label,
  text,
  tone,
  onCopied,
}: {
  label: string;
  text: string;
  tone?: "rose";
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`${CARD} px-3 py-2.5`}>
      <div className="flex items-center justify-between gap-2">
        <span className={CAPS}>{label}</span>
        <button
          type="button"
          onClick={async () => {
            const ok = await copyText(text);
            setCopied(ok);
            if (ok) onCopied?.();
          }}
          aria-label={`Copy the ${label}`}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-jetbrains text-label transition ${
            copied
              ? "border-emerald-400/40 text-emerald-200"
              : "border-white/12 text-white/60 hover:border-white/30 hover:text-white"
          }`}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <p
        className={`mt-1 font-hanken text-label leading-snug ${tone === "rose" ? "text-rose-100/80" : "text-white/85"}`}
      >
        {text}
      </p>
    </div>
  );
}

/** A heard leaf: listen, then the call — crown or reject. */
function TakePanel({
  api,
  hunt,
  node,
  take,
  versions,
}: {
  api: HuntApi;
  hunt: Hunt;
  node: HuntNode;
  take: SoundTake;
  versions: number;
}) {
  const [reasons, setReasons] = useState<DefectCode[]>(take.reasons);
  const [rejecting, setRejecting] = useState(false);
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <PlayButton take={take} size="lg" />
        <TakeWave
          take={take}
          height="h-16"
          bars={72}
          tone={node.winner ? "emerald" : "cyan"}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-jetbrains text-label text-white/40">
        <VerdictChip take={take} />
        {take.stage && <span>stage {take.stage}</span>}
        {versions > 1 && <span>{versions} takes</span>}
      </div>
      <DefectChips reasons={take.verdict === "rejected" ? take.reasons : []} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void api.crown(hunt.id, node.id, take, !node.winner)}
          aria-pressed={node.winner}
          className={`${BTN_KEEP} ${node.winner ? "bg-emerald-400/15" : ""}`}
        >
          <Crown className="h-4 w-4" aria-hidden />
          {node.winner ? "winner" : "crown winner"}
        </button>
        {!node.winner && (
          <button
            type="button"
            onClick={() => setRejecting((r) => !r)}
            aria-expanded={rejecting}
            className={BTN_REJECT}
          >
            <X className="h-4 w-4" aria-hidden />
            {take.verdict === "rejected" ? "rejected" : "reject"}
          </button>
        )}
      </div>
      {rejecting && !node.winner && (
        <div className="grid gap-2.5">
          <DefectPicker
            kind={hunt.kind}
            value={reasons}
            onChange={setReasons}
            keyed={false}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!reasons.length}
              onClick={() => {
                void api.reject(take, reasons);
                setRejecting(false);
              }}
              className={BTN_REJECT}
            >
              reject · {reasons.length}
            </button>
            {take.verdict === "rejected" && (
              <button
                type="button"
                onClick={() => {
                  setReasons([]);
                  void api.reject(take, []);
                  setRejecting(false);
                }}
                className={BTN}
              >
                clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** The Suno leg: the fields above copy; the file Suno gives back lands here. */
function ReturnDrop({
  onFile,
  awaiting,
}: {
  onFile: (f: File) => Promise<void>;
  awaiting: boolean;
}) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const take = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    await onFile(f);
    setBusy(false);
  };
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void take(e.dataTransfer.files[0]);
      }}
      className={`grid justify-items-start gap-2 rounded-xl border border-dashed px-4 py-4 transition ${
        over
          ? "border-amber-300/60 bg-amber-300/[0.08]"
          : awaiting
            ? "border-amber-400/35 bg-amber-400/[0.03]"
            : "border-white/20"
      }`}
    >
      <span
        className={`font-jetbrains text-label ${awaiting ? "text-amber-200/85" : "text-white/45"}`}
      >
        {awaiting ? "awaiting the return" : "suno · by hand"}
      </span>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className={`${BTN} ${busy ? "animate-pulse" : ""}`}
      >
        <Upload className="h-4 w-4" aria-hidden />
        {busy ? "filing…" : "drop the return"}
      </button>
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="sr-only"
        aria-label="Choose the audio file Suno returned"
        onChange={(e) => {
          void take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** A declared lane with nothing installed: what it would take, never a fake take. */
function NotInstalled({
  needs,
  candidates,
  reason,
}: {
  needs: string[];
  candidates: { name: string; licence: string }[];
  reason: string | null;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-jetbrains text-label text-white/50">
          <Lock className="h-4 w-4" aria-hidden />
          not installed
        </span>
        {needs.length > 0 && (
          <PipRow
            states={needs.map(() => "hollow" as const)}
            label={`0 of ${needs.length} prerequisites in place`}
          />
        )}
      </div>
      {reason && (
        <p className="font-hanken text-label leading-snug text-white/55">
          {reason}
        </p>
      )}
      <ul className="grid gap-1.5">
        {needs.map((n) => (
          <li
            key={n}
            className="flex items-center gap-2.5 font-hanken text-label text-white/60"
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/25"
            />
            {n}
          </li>
        ))}
      </ul>
      {candidates.length > 0 && (
        <div className="grid gap-1.5">
          {candidates.map((c) => (
            <div
              key={c.name}
              className="flex items-baseline justify-between gap-3 rounded-lg border border-white/6 px-3 py-1.5"
            >
              <span className="font-instrument text-content text-white/75">
                {c.name}
              </span>
              <span className="truncate font-jetbrains text-label text-white/35">
                {c.licence}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
