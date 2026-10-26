// THE SIGNAL VOCABULARY, each part in each of its states (kit.js "Signal"). Server-rendered:
// nothing here takes a callback, so nothing here ships a client component except the Hint,
// whose tip is a layer. Fixture strings are the prototype's own (docs/next/prototype/app/
// fixtures.js), verbatim, so a specimen shows the length and shape of real work.

import { ChannelBadge } from "@gt/ui/components/channel/ChannelBadge.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { usd } from "@gt/ui/components/eventrow/usd.ts";
import { TONES } from "@gt/ui/components/chip/tone.ts";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts } from "@gt/ui/components/facts/Facts.tsx";
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";
import { Glyph } from "@gt/ui/components/glyph/Glyph.tsx";
import { Hint } from "@gt/ui/components/hint/Hint.tsx";
import { Keycap, Keycaps } from "@gt/ui/components/keycaps/Keycaps.tsx";
import { LedgerLink } from "@gt/ui/components/ledgerlink/LedgerLink.tsx";
import { PipRow } from "@gt/ui/components/piprow/PipRow.tsx";
import { Provenance } from "@gt/ui/components/provenance/Provenance.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { SrOnly } from "@gt/ui/components/a11y/SrOnly.tsx";
import { StackBar } from "@gt/ui/components/stackbar/StackBar.tsx";
import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { UpstreamBreak } from "@gt/ui/components/upstream/UpstreamBreak.tsx";
import { Wave } from "@gt/ui/components/wave/Wave.tsx";
import { BINDINGS, KEYMAP } from "@gt/ui/keymap/bindings";
import { conflicts, problems } from "@gt/ui/keymap/keymap";

import { Row, Section, Spec } from "./Spec.tsx";
import k from "./kit.module.css";

const MODES: readonly string[] = [...new Set(BINDINGS.map((b) => b.mode))];
// One legend per mode, and one per field a mode's rows fire inside: keyTable draws a field's
// rows only when asked for that field, so a legend per mode alone hid every in-field key.
type Legend = { readonly mode: string; readonly field: string | undefined };
const LEGENDS: readonly Legend[] = [...new Map(BINDINGS.map((b) => [`${b.mode} ${b.field ?? ""}`, { mode: b.mode, field: b.field }])).values()];
// Every row of a legend, its conditional rows included: a legend drawn with no facts hides the
// rows that only exist with a selection (Runs' pause is all of `projects.runs`).
const factsOf = ({ mode, field }: Legend): ReadonlySet<string> =>
  new Set(BINDINGS.filter((b) => b.mode === mode && b.field === field && b.when !== undefined && !b.when.startsWith("!")).map((b) => b.when ?? ""));
const nameOf = ({ mode, field }: Legend): string => (field === undefined ? mode : `${mode} · ${field}`);
// A take's peaks, shaped like a track's: quiet intro, a build, the drop, a tail.
const PEAKS: readonly number[] = Array.from({ length: 64 }, (_, i) => Math.min(1, 0.18 + 0.7 * Math.abs(Math.sin(i / 5)) * (i < 16 ? i / 16 : i > 52 ? (64 - i) / 12 : 1)));

export function SignalSections() {
  const clashes = conflicts(KEYMAP).length;
  const broken = problems(KEYMAP).length;
  return (
    <>
      <Section id="signal">
        <Spec names={["Chip"]} source="chip/Chip.tsx" wide>
          <Row>
            {TONES.map((t) => (
              <Chip key={t} label={t} tone={t} />
            ))}
            <Chip label="fixture" ghost />
            <Chip label="weir clear" tone="emerald" dot />
            <Chip label="lower case" casing="lower" />
            <Chip label="spend 24h" value={usd(0)} />
            <Chip label="ledger" value="+3" href="#signal" name="ledger, 3 new acts" />
          </Row>
        </Spec>
        <Spec names={["Tally"]} source="tally/Tally.tsx">
          <Row>
            <Tally value={20} />
            <Tally value={14} label="waiting" />
            <Tally value={3} of={4} label="agreement" />
            <Tally value="48.2k" label="views" />
          </Row>
        </Spec>
        <Spec names={["SourceTag"]} source="source/SourceTag.tsx">
          <Row>
            {(["real", "fixture", "illustrative", "session", "model", "derived"] as const).map((s) => (
              <SourceTag key={s} kind={s} />
            ))}
          </Row>
        </Spec>
        <Spec names={["LedgerLink"]} source="ledgerlink/LedgerLink.tsx">
          <Row>
            <LedgerLink href="#signal" subject="pkt_audio" />
            <LedgerLink href="#signal" subject="painted-3d" label="painted-3d" />
          </Row>
        </Spec>
        <Spec names={["ChannelBadge"]} source="channel/ChannelBadge.tsx">
          <Row>
            <ChannelBadge channel="youtube" />
            <ChannelBadge channel="tiktok" />
            <ChannelBadge channel="instagram" />
            <ChannelBadge channel="blog" />
          </Row>
        </Spec>
      </Section>

      <Section id="keys">
        {LEGENDS.map((l) => (
          <Spec key={nameOf(l)} names={["Keycaps"]} source={l.field === undefined ? `mode ${l.mode}` : `mode ${l.mode} · field ${l.field}`}>
            <Keycaps mode={l.mode} label={`${nameOf(l)} keys`} facts={factsOf(l)} {...(l.field !== undefined ? { field: l.field } : {})} />
          </Spec>
        ))}
        <Spec names={["Keycap"]} source="keycaps/Keycaps.tsx">
          <Row label="keep">
            <Keycap mode="board.cull" verb="keep" />
          </Row>
          <Row label="undo">
            <Keycap mode="board.cull" verb="undo" />
          </Row>
          <Row label="tab · sm">
            <Keycap mode="projects" verb="plan" size="sm" />
          </Row>
        </Spec>
        <Spec names={["KEYMAP"]} source="keymap/bindings.ts">
          <Row label="bindings">
            <Tally value={BINDINGS.length} />
          </Row>
          <Row label="modes">
            <Tally value={MODES.length} />
          </Row>
          <Row label="conflicts">
            <Tally value={clashes} />
          </Row>
          <Row label="problems">
            <Tally value={broken} />
          </Row>
        </Spec>
        <Spec names={["Hint"]} source="hint/Hint.tsx">
          <Row>
            <Chip label="spend 24h" value={usd(0)} />
            <Hint text="local GPU runs $0 · article range is the pipeline hint" name="spend" />
          </Row>
        </Spec>
        <Spec names={["Ghost"]} source="ghost/Ghost.tsx">
          <Ghost count={2} label="runs: none yet" />
        </Spec>
      </Section>

      <Section id="evidence">
        <Spec names={["PipRow"]} source="piprow/PipRow.tsx">
          <div className={k.col}>
            <Row label="shipped">
              <PipRow looks={["done", "done", "done", "done", "done", "done"]} label="6 of 6 shipped" />
            </Row>
            <Row label="at weir">
              <PipRow looks={["done", "done", "awaiting", "idle", "idle", "idle"]} label="2 done, 1 at weir, 3 waiting" />
            </Row>
            <Row label="running">
              <PipRow looks={["done", "running", "idle", "idle", "idle", "idle"]} label="1 done, 1 running, 4 waiting" />
            </Row>
            <Row label="blocked">
              <PipRow looks={["done", "done", "failed", "idle", "idle", "idle"]} label="2 done, 1 blocked, 3 waiting" />
            </Row>
            <Row label="capacity">
              <PipRow looks={["running", "running"]} max={5} label="2 of 5 slots in use" />
            </Row>
          </div>
        </Spec>
        <Spec names={["StackBar"]} source="stackbar/StackBar.tsx">
          <div className={k.col}>
            <Row label="undecided">
              <div className={k.grow}>
                <StackBar kept={0} rejected={0} undecided={20} label="sweep-01" />
              </div>
            </Row>
            <Row label="mid-cull">
              <div className={k.grow}>
                <StackBar kept={6} rejected={5} undecided={9} label="sweep-01" />
              </div>
            </Row>
            <Row label="committed">
              <div className={k.grow}>
                <StackBar kept={8} rejected={12} undecided={0} label="sweep-01" />
              </div>
            </Row>
          </div>
        </Spec>
        <Spec names={["Provenance"]} source="provenance/Provenance.tsx">
          <Provenance model="flux2-dev-fp8" run="2026-08-26-sweep-01" step="frames" vendor="GPU box" cost="$0" />
        </Spec>
        <Spec names={["UpstreamBreak"]} source="upstream/UpstreamBreak.tsx" wide>
          <UpstreamBreak
            steps={["scheduled", "auth", "upload", "live"]}
            brokeAt={1}
            detail="Instagram Graph API OAuthException 190: Error validating access token: Session has expired"
          />
        </Spec>
        <Spec names={["ErrorLine"]} source="errorline/ErrorLine.tsx" wide>
          <ErrorLine message="videos.insert (init) 403: The request cannot be completed because you have exceeded your quota. (quotaExceeded)" />
          <ErrorLine message="TikTok content posting: access_token_invalid — the access token is invalid or has expired" live />
        </Spec>
        <Spec names={["Facts"]} source="facts/Facts.tsx">
          <Facts
            facts={[
              { term: "model", value: "flux2-dev-fp8" },
              { term: "plates", value: 20 },
              { term: "minutes", value: 32 },
              { term: "spend", value: "$0" },
            ]}
          />
        </Spec>
        <Spec names={["Wave"]} source="wave/Wave.tsx">
          <Row>
            <Wave peaks={PEAKS} width={220} height={34} tone="violet" />
            <Wave peaks={PEAKS} width={220} height={34} tone="cyan" played={0.4} />
            <Wave peaks={[]} width={220} height={34} tone="amber" />
          </Row>
        </Spec>
        <Spec names={["Glyph"]} source="glyph/Glyph.tsx">
          <Row>
            {(["ledger", "search", "warn", "down"] as const).map((g) => (
              <span key={g} className={k.row}>
                <Glyph name={g} className={k.glyph} />
                <span className={k.mono}>{g}</span>
              </span>
            ))}
          </Row>
        </Spec>
        <Spec names={["SrOnly"]} source="a11y/SrOnly.tsx">
          <Row label="spoken only">
            <SrOnly text="a label only a screen reader hears" />
            <span className={k.mono}>0 px drawn</span>
          </Row>
        </Spec>
      </Section>
    </>
  );
}
