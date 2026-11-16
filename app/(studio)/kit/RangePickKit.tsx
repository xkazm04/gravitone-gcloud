"use client";

// RANGEPICK (spark track-mirror-studio): a section over a song's peaks, in its states, over literal data. The
// handles move under the keyboard and the pointer; nothing leaves the specimen.
import { useState } from "react";

import { RangePick } from "@gt/ui/components/rangepick/RangePick.tsx";
import type { Span } from "@gt/ui/components/rangepick/rangepick.ts";

import { inert } from "./ContractHooks.tsx";
import { Row, Spec } from "./Spec.tsx";

const PEAKS = Array.from({ length: 240 }, (_, i) => Math.round((0.25 + 0.6 * Math.abs(Math.sin(i / 9)) * (0.5 + 0.5 * Math.abs(Math.sin(i / 41)))) * 100) / 100);

export function RangePickSpec() {
  const [span, setSpan] = useState<Span>({ startS: 48, endS: 84 });
  return (
    <Spec names={["RangePick"]} source="rangepick/RangePick.tsx · rangepick.ts" wide>
      <Row label="free">
        <RangePick label="Mad World" peaks={PEAKS} lenS={212} minS={10} maxS={60} value={span} onChange={setSpan} />
      </Row>
      <Row label="playing">
        <RangePick label="Shout" peaks={PEAKS} lenS={212} minS={10} maxS={60} value={{ startS: 30, endS: 70 }} onChange={inert} playheadS={52.4} tone="amber" />
      </Row>
      <Row label="locked">
        <RangePick label="Pale Shelter" peaks={PEAKS} lenS={212} minS={10} maxS={60} value={{ startS: 120, endS: 180 }} onChange={inert} disabled />
      </Row>
    </Spec>
  );
}
