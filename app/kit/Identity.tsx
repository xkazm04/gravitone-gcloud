"use client";

// IDENTITY — the Almanac world as a specification: the mark and its construction,
// the palette as roles with contrast computed from the tokens, the type pairing
// with each size measured off the rendered sample, the motif and marks drawn from
// real kit parts, and the motion signature.
//
// Nothing here is a picture of the kit: the marks are the kit's own components and
// every colour is `var(--al-*)`. The ratios and the hex values are read from
// WORLD_ALMANAC, so retuning a token moves its row.

import { useEffect, useRef, useState } from "react";

import { BOX, CONS, FIGURES } from "@/app/_landing/sky";
import {
  Chip,
  Credit,
  DataTable,
  Kicker,
  Magnitude,
  Stats,
  StatusGlyph,
  StatusPill,
  Tag,
  Tile,
  VerdictKeys,
  type StatusKind,
} from "@/components/kit";
import { ASTERISM_PATH, ASTERISM_STARS, Mark, Wordmark } from "@/components/kit/brand";
import { WORLD_ALMANAC } from "@/components/ui/tokens";

import { MOTION, MUTING_FLOOR, MUTING_TOKENS, NON_COLOUR, TOKEN_ROLES, TYPE_ROLES } from "./catalog";
import { contrast, mixHex, resolve, tierOf } from "./contrast";

const ZOOM = 19;
const pct = (v: number) => `${(((v + ZOOM) / (2 * ZOOM)) * 100).toFixed(2)}%`;
const bearing = (deg: number) => ((Math.round(deg) % 360) + 360) % 360;

/** The construction sheet: one circle of radius 10, five stars, the G as four arcs and a bar. */
function Construction() {
  const ticks = Array.from({ length: 36 }, (_, i) => {
    const a = (i * 10 * Math.PI) / 180;
    const len = i % 9 === 0 ? 1.4 : i % 3 === 0 ? 0.9 : 0.5;
    return `M ${(12.6 * Math.cos(a)).toFixed(3)} ${(12.6 * Math.sin(a)).toFixed(3)} L ${((12.6 + len) * Math.cos(a)).toFixed(3)} ${((12.6 + len) * Math.sin(a)).toFixed(3)}`;
  });
  return (
    <div className="kr-cons" role="img" aria-label="G asterism construction: five studio steps on a circle of radius 10, Cut inside on the crossbar">
      <svg viewBox={`${-ZOOM} ${-ZOOM} ${2 * ZOOM} ${2 * ZOOM}`} aria-hidden="true">
        <g fill="none" style={{ stroke: "var(--al-gold)" }}>
          <circle r="10" strokeOpacity="0.35" strokeWidth="0.08" strokeDasharray="0.3 0.3" />
          <circle r="12.6" strokeOpacity="0.2" strokeWidth="0.05" />
          <path d={ticks.join(" ")} strokeOpacity="0.6" strokeWidth="0.06" />
          <path d="M -12 0 H 12 M 0 -12 V 12" strokeOpacity="0.25" strokeWidth="0.05" />
          {ASTERISM_STARS.filter((s) => s.bearing !== null).map((s) => (
            <path key={s.step} d={`M 0 0 L ${s.x} ${s.y}`} strokeOpacity="0.18" strokeWidth="0.05" />
          ))}
        </g>
        <path d="M 0 0 L 7.071 -7.071" fill="none" strokeWidth="0.05" strokeDasharray="0.25 0.25" style={{ stroke: "var(--al-vellum)" }} />
        <path d={ASTERISM_PATH} fill="none" strokeLinecap="round" strokeWidth="0.22" style={{ stroke: "var(--al-gold)" }} />
        {ASTERISM_STARS.map((s) => (
          <g key={s.step}>
            <circle cx={s.x} cy={s.y} r={s.r + 0.3} style={{ fill: "var(--al-night)" }} />
            <circle cx={s.x} cy={s.y} r={s.r} style={{ fill: s.step === "Cut" ? "var(--al-ald)" : "var(--al-white)" }} />
          </g>
        ))}
      </svg>
      <span className="kr-cons__r" style={{ left: pct(3.4), top: pct(-4.6), fontSize: "1.125rem" }}>r</span>
      {ASTERISM_STARS.map((s) => {
        const cut = s.bearing === null;
        const x = cut ? s.x - 1 : s.x * 1.55;
        const y = cut ? s.y + 2.9 : s.y * 1.55;
        return (
          <span key={s.step} className={`kr-cons__l k-caps${cut ? " kr-cons__l--cut" : ""}`} style={{ left: pct(x), top: pct(y) }}>
            {s.step}
            {s.bearing !== null && ` ${bearing(s.bearing)}°`}
          </span>
        );
      })}
    </div>
  );
}

function Logo() {
  return (
    <div className="kr-ident">
      <Construction />
      <div>
        <div className="kr-lockups">
          <figure>
            <Mark size={24} construction={false} title="Gravitone, smallest use" />
            <span className="k-caps">24px, floor</span>
          </figure>
          <figure>
            <Mark size={40} title="Gravitone" />
            <span className="k-caps">40px</span>
          </figure>
          <figure>
            <div style={{ padding: 32, border: "1px dashed var(--k-hair-2)" }}>
              <Mark size={64} title="Gravitone, with clear space" />
            </div>
            <span className="k-caps">clear space, 1 radius</span>
          </figure>
        </div>
        <DataTable
          head={["Part", "Rule"]}
          rows={[
            ["Circle", <code key="c">r = 10</code>],
            ["Stars", "Research 315° · Script 200° · Frames 120° · Score 10°"],
            ["Cut", "inside the circle, on the crossbar; the only red"],
            ["Line", "four arcs and the bar, stroke 2.1 of 10"],
          ]}
        />
        <div className="kr-wm">
          <Wordmark height={96} />
        </div>
        <div className="kr-row">
          <Wordmark height={14} />
          <Wordmark height={24} />
          <Wordmark height={40} />
          <span className="k-caps k-muted">Hanken Grotesk 700 · tracking 0.16em · the O carries the Cut star</span>
        </div>
      </div>
    </div>
  );
}

const GROUND = ["--al-night", "--al-deep", "--al-field"];
const tokenKeys = Object.keys(WORLD_ALMANAC);
/** A token's flat colour, resolving the colour-mix text variants; null for gradients and curves. */
const flat = (k: string) => resolve(WORLD_ALMANAC[k], WORLD_ALMANAC);

function ratioCell(a: string, against: string) {
  if (NON_COLOUR.includes(a)) return "—";
  if (GROUND.includes(a)) return <span className="k-caps k-muted">ground</span>;
  const [fg, bg] = [flat(a), flat(against)];
  const r = fg && bg ? contrast(fg, bg) : null;
  if (r === null || a === against) return "—";
  const t = tierOf(r);
  // A token that is not a text colour prints its ratio as a fact about the fill, not a grade.
  const mark = TOKEN_ROLES[a].text ? t : "non-text";
  return (
    <span className="kr-tier">
      <b>{r.toFixed(1)}</b>
      <i className={TOKEN_ROLES[a].text && (t === "fails" || (MUTING_TOKENS.includes(a) && r < MUTING_FLOOR)) ? "kr-rowflag" : undefined}>{mark}</i>
    </span>
  );
}

/** A hue drawn as text is `hue` mixed toward white; the raw hue and the mix are both measured, on all three grounds. */
function TextOnHue() {
  const white = flat("--al-white")!;
  const hues: { name: string; from: string; mix: number; recipe: string }[] = [
    { name: "Aldebaran", from: "--al-ald", mix: 65, recipe: "--al-ald-t · 65% + white" },
    { name: "Antares", from: "--al-ant", mix: 70, recipe: "--al-ant-t · 70% + white" },
    ...CONS.map((c) => ({ name: `${c.name} tint`, from: `--al-tint-${c.id}`, mix: 70, recipe: "70% + white" })),
  ];
  const on = (fg: string) => GROUND.map((g) => contrast(fg, flat(g)!)!);
  const cell = (r: number, key: string) => (
    <span key={key} className="kr-tier">
      <b>{r.toFixed(1)}</b>
      <i className={r < 7 ? "kr-rowflag" : undefined}>{tierOf(r)}</i>
    </span>
  );
  return (
    <DataTable
      head={["Hue", "Raw on night", "Raw on deep", "Raw on field", "As text", "On night", "On deep", "On field"]}
      rows={hues.map((h) => {
        const raw = flat(h.from)!;
        const as = mixHex(raw, white, h.mix);
        const [r, t] = [on(raw), on(as)];
        return [
          h.name,
          cell(r[0], "r0"),
          cell(r[1], "r1"),
          cell(r[2], "r2"),
          <span key="a" className="kr-out">{h.recipe}</span>,
          cell(t[0], "t0"),
          cell(t[1], "t1"),
          cell(t[2], "t2"),
        ];
      })}
    />
  );
}

function Palette() {
  const rows = tokenKeys.map((k) => {
    const role = TOKEN_ROLES[k];
    const ease = k === "--al-ease";
    return [
      ease ? <span key="s" className="k-caps k-muted">curve</span> : <span key="s" className="kr-sw" style={{ background: `var(${k})` }} aria-hidden="true" />,
      <span key="n">
        <code>{k}</code>
        <br />
        <span className="k-muted">{role.name}</span>
      </span>,
      <span key="v" className="kr-out">{WORLD_ALMANAC[k].length > 26 ? "gradient" : WORLD_ALMANAC[k]}</span>,
      role.role,
      role.surface === "all" ? role.use : `${role.use} · ${role.surface === "working" ? "working surfaces only" : "figure and label only"}`,
      ratioCell(k, "--al-night"),
      ratioCell(k, "--al-deep"),
      ratioCell(k, "--al-field"),
    ];
  });
  return (
    <>
      <DataTable head={["", "Token", "Value", "Role", "Where", "On night", "On deep", "On field"]} rows={rows} />
      <h3 className="kr-sub k-caps">A hue as text</h3>
      <TextOnHue />
      <h3 className="kr-sub k-caps">The single red</h3>
      <div className="kr-one">
        <div>
          <Mark size={30} construction={false} title="Cut star, Aldebaran" />
          <StatusGlyph kind="keep" label="kept" />
          <VerdictKeys variant="card" value="keep" onVerdict={() => {}} />
          <Chip name="Aldebaran">a person decided</Chip>
        </div>
        <div>
          <StatusGlyph kind="failed" label="failed" />
          <Chip tone="ant" name="Antares">CUDA out of memory</Chip>
          <StatusPill kind="failed">working surfaces only</StatusPill>
        </div>
      </div>
      <h3 className="kr-sub k-caps">The four constellation tints</h3>
      <div className="kr-figs">
        {CONS.map((c) => {
          const b = BOX[c.id];
          const pad = 30;
          return (
            <figure key={c.id}>
              <svg viewBox={`${b[0] - pad} ${b[1] - pad} ${b[2] - b[0] + pad * 2} ${b[3] - b[1] + pad * 2}`} role="img" aria-label={`${c.name}, stylised ${c.figure}`}>
                <g fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: c.tint }}>
                  {FIGURES[c.id].strokes.map((s, i) => (
                    <path key={i} d={s.d} strokeWidth={s.cls === "fine" ? 0.8 : 1.6} strokeOpacity={s.cls === "fine" ? 0.5 : 0.9} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              </svg>
              <figcaption>
                <span className="k-caps" style={{ color: `color-mix(in srgb, ${c.tint} 70%, var(--al-white))` }}>{c.figure} · {c.name}</span>
                <Tag>stylised</Tag>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </>
  );
}

function TypeSpec() {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [px, setPx] = useState<string[]>([]);
  useEffect(() => {
    const read = () => setPx(refs.current.map((el) => (el ? getComputedStyle(el).fontSize : "")));
    read();
    void document.fonts?.ready.then(read);
  }, []);
  return (
    <>
      <Stats
        items={[
          { n: "18px", label: "body" },
          { n: "16px", label: "secondary · floor, check:type" },
          { n: "14px", label: "door floor · chart labels" },
          { n: "0", label: "italics" },
        ]}
      />
      <DataTable
        head={["Role", "Sample", "Family", "Size", "Measured", "Where"]}
        rows={TYPE_ROLES.map((t, i) => [
          t.role,
          <span key="s" ref={(el) => { refs.current[i] = el; }} className={t.className}>{t.sample}</span>,
          <code key="f">{t.family}</code>,
          t.size,
          <span key="m" className="kr-measured">{px[i] || "—"}</span>,
          t.where,
        ])}
      />
    </>
  );
}

const GLYPHS: { kind: StatusKind; word: string }[] = [
  { kind: "keep", word: "kept" },
  { kind: "reject", word: "rejected" },
  { kind: "undecided", word: "undecided" },
  { kind: "live", word: "live" },
  { kind: "committed", word: "committed" },
  { kind: "failed", word: "failed" },
  { kind: "gate", word: "awaiting verdict" },
  { kind: "ready", word: "ready" },
  { kind: "inc", word: "incomplete" },
  { kind: "queued", word: "queued" },
  { kind: "lock", word: "locked" },
];

function Motif() {
  return (
    <>
      <div className="kr-marks">
        {GLYPHS.map((g) => (
          <div key={g.kind} className="kr-mark">
            <StatusGlyph kind={g.kind} decorative />
            <span className="kr-mark__n k-caps">{g.word}</span>
            <code>{g.kind}</code>
          </div>
        ))}
        {[0.92, 0.62, 0.31, null].map((v, i) => (
          <div key={i} className="kr-mark">
            <Magnitude value={v} />
            <span className="kr-mark__n k-caps">{["held", "partial", "missed", "ungraded"][i]}</span>
            <code>{v === null ? "no score" : `${Math.round(v * 100)}%`}</code>
          </div>
        ))}
        {([1, 0.5, 0] as const).map((v) => (
          <div key={v} className="kr-mark">
            <Credit value={v}>field</Credit>
            <span className="kr-mark__n k-caps">{v === 1 ? "matched" : v === 0.5 ? "half" : "missed"}</span>
            <code>credit {v}</code>
          </div>
        ))}
        <div className="kr-mark">
          <div style={{ width: 96 }}>
            <Tile label="Focus corners" src="/presets/blueprint.jpg" focused ratio="16 / 10" />
          </div>
          <span className="kr-mark__n k-caps">focus</span>
          <code>corners close</code>
        </div>
      </div>
      <h3 className="kr-sub k-caps">Graticule and the cut</h3>
      <div className="kr-cut">
        <svg viewBox="0 0 640 90" role="img" aria-label="The cut: a dotted gold line drawn through three Aldebaran pick rings">
          <g fill="none" style={{ stroke: "var(--al-ash)" }} strokeOpacity="0.5">
            {[60, 90, 120, 150].map((r) => <circle key={r} cx="320" cy="-70" r={r * 1.6} />)}
          </g>
          <path d="M 30 62 C 150 62 190 26 320 40 S 500 70 610 30" fill="none" strokeWidth="3" strokeLinecap="round" strokeDasharray="0 9" style={{ stroke: "var(--al-gold)" }} />
          {[[30, 62], [320, 40], [610, 30]].map(([x, y]) => (
            <g key={x}>
              <circle cx={x} cy={y} r="9" fill="none" strokeWidth="2" style={{ stroke: "var(--al-ald)" }} />
              <circle cx={x} cy={y} r="3.5" style={{ fill: "var(--al-white)" }} />
            </g>
          ))}
        </svg>
      </div>
    </>
  );
}

function Motion() {
  return (
    <DataTable
      head={["Beat", "Value", "Where"]}
      rows={MOTION.map((m) => [m.beat, <span key="v" className="kr-out">{m.value}</span>, m.where])}
    />
  );
}

export function Identity() {
  return (
    <div className="kr-page">
      <section className="kr-section" aria-labelledby="kr-logo">
        <Kicker>Mark</Kicker>
        <h2 id="kr-logo">The G asterism and the wordmark</h2>
        <Logo />
      </section>
      <section className="kr-section" aria-labelledby="kr-palette">
        <Kicker>Palette</Kicker>
        <h2 id="kr-palette">Night, gold, one red</h2>
        <Palette />
      </section>
      <section className="kr-section" aria-labelledby="kr-type">
        <Kicker>Type</Kicker>
        <h2 id="kr-type">Upright display serif, humanist sans, mono</h2>
        <TypeSpec />
      </section>
      <section className="kr-section" aria-labelledby="kr-marks">
        <Kicker>Motif</Kicker>
        <h2 id="kr-marks">Marks: engraved, never filled</h2>
        <Motif />
      </section>
      <section className="kr-section" aria-labelledby="kr-motion">
        <Kicker>Motion</Kicker>
        <h2 id="kr-motion">Celestial, never snapping</h2>
        <Motion />
      </section>
    </div>
  );
}
