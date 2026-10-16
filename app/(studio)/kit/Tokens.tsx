// THE TOKENS, READ FROM THEIR SOURCE. kit.js read each value back from the live stylesheet
// (`getComputedStyle(...).getPropertyValue`) and hand-listed which tokens to show, so a
// token added to tokens.css appeared nowhere until someone remembered the kit. Here every
// group of packages/ui/tokens/source.json is drawn, every token in it, with its note - the
// same file the generator renders tokens.css from (design-tokens cross-language-token-parity:
// the mirror is generated from the authority, never typed beside it). A token the page did
// not draw would be a hole in that walk; the live probe counts them.
//
// Each specimen paints through `var(--name)`, so what is drawn is the custom property the
// browser resolved, not the source's string: a token that fails to load shows as missing.

import type { CSSProperties } from "react";

import type { TokenSource } from "@gt/ui/tokenSource";

import { Motion } from "./Motion.tsx";
import { Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

type Token = TokenSource["groups"][number]["tokens"][number];
type Groups = TokenSource["groups"];

const v = (name: string): string => `var(--${name})`;
const pick = (groups: Groups, ids: readonly string[]): Groups => groups.filter((g) => ids.includes(g.id));

function Caption({ t }: { readonly t: Token }) {
  return (
    <>
      <span>--{t.name}</span>
      <small>
        {t.value}
        {t.note !== undefined ? ` · ${t.note}` : ""}
      </small>
    </>
  );
}

function Swatch({ t }: { readonly t: Token }) {
  return (
    <div className={k.sw} data-token={t.name}>
      <i style={{ background: v(t.name) }} />
      <Caption t={t} />
    </div>
  );
}

function Measure({ t, as }: { readonly t: Token; readonly as: "bar" | "radius" | "row" }) {
  const shape: CSSProperties | null = as === "bar" ? { width: v(t.name) } : as === "radius" ? { borderRadius: v(t.name) } : null;
  return (
    <div className={k.measureRow} data-token={t.name}>
      <span className={k.lab}>--{t.name}</span>
      {as === "radius" ? <div className={k.radiusBox} style={shape ?? undefined} /> : as === "bar" ? <i style={shape ?? undefined} /> : null}
      <span className={k.value}>{t.value}</span>
    </div>
  );
}

function TypeRow({ t }: { readonly t: Token }) {
  const family = t.name === "sans" || t.name === "mono" || t.name === "serif";
  const style: CSSProperties = family ? { fontFamily: v(t.name) } : { fontSize: v(t.name) };
  return (
    <div className={k.typeRow} data-token={t.name}>
      <span className={k.lab}>
        --{t.name}
        <br />
        {family ? t.name : t.value}
        {t.note !== undefined ? ` · ${t.note}` : ""}
      </span>
      <span className={k.sample} style={style}>
        Glass Harbor — trailer · cut · 2026-08-26-sweep-01 · 20 plates
      </span>
    </div>
  );
}

const COLOUR = ["ground", "signal", "actors", "roles-surface", "roles-text", "roles-mark"];
const TYPE = ["type", "roles-type"];
const BARS = ["space", "roles-space", "roles-size", "roles-stroke"];
const RADII = ["radii", "roles-shape", "roles-corner"];
const ROWS = ["motion", "frame", "roles-layer", "roles-component", "board", "library"];

/** Every group id the sections below draw; the page checks the source holds no other. */
export const DRAWN_GROUPS: readonly string[] = [...COLOUR, ...TYPE, ...BARS, ...RADII, ...ROWS];

export function TokenSections({ groups }: { readonly groups: Groups }) {
  return (
    <>
      <Section id="colour">
        {pick(groups, COLOUR).map((g) => (
          <Spec key={g.id} names={[g.id]} source={`${g.tokens.length} tokens`} wide tokens>
            <div className={k.swatches}>
              {g.tokens.map((t) => (
                <Swatch key={t.name} t={t} />
              ))}
            </div>
          </Spec>
        ))}
      </Section>
      <Section id="type">
        {pick(groups, TYPE).map((g) => (
          <Spec key={g.id} names={[g.id]} source={`${g.tokens.length} tokens`} wide tokens>
            {g.tokens.map((t) => (
              <TypeRow key={t.name} t={t} />
            ))}
          </Spec>
        ))}
      </Section>
      <Section id="space">
        {pick(groups, BARS).map((g) => (
          <Spec key={g.id} names={[g.id]} source={`${g.tokens.length} tokens`} tokens>
            <div className={k.col}>
              {g.tokens.map((t) => (
                <Measure key={t.name} t={t} as="bar" />
              ))}
            </div>
          </Spec>
        ))}
        {pick(groups, RADII).map((g) => (
          <Spec key={g.id} names={[g.id]} source={`${g.tokens.length} tokens`} tokens>
            <div className={k.col}>
              {g.tokens.map((t) => (
                <Measure key={t.name} t={t} as="radius" />
              ))}
            </div>
          </Spec>
        ))}
      </Section>
      <Section id="motion">
        <Spec names={["acts"]} source="lockIn · fadeUp · moved · shake" wide tokens>
          <Motion />
        </Spec>
        {pick(groups, ["motion"]).map((g) => (
          <Spec key={g.id} names={[g.id]} source={`${g.tokens.length} tokens`} tokens>
            <div className={k.col}>
              {g.tokens.map((t) => (
                <Measure key={t.name} t={t} as="row" />
              ))}
              <div className={k.measureRow}>
                <span className={k.lab}>reduced</span>
                <span className={k.value}>prefers-reduced-motion → none</span>
              </div>
            </div>
          </Spec>
        ))}
      </Section>
      <Section id="frame">
        {pick(groups, ["frame", "roles-layer", "roles-component", "board", "library"]).map((g) => (
          <Spec key={g.id} names={[g.id]} source={`${g.tokens.length} tokens`} tokens>
            <div className={k.col}>
              {g.tokens.map((t) => (
                <Measure key={t.name} t={t} as="row" />
              ))}
            </div>
          </Spec>
        ))}
      </Section>
    </>
  );
}
