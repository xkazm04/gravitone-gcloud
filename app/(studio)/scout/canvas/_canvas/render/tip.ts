// THE TIP'S WORDS - what the pointer is over, in the work's own words: a label, its facts, and the key that acts on it
// (port of the winner's chrome.js WS.tip.show). Pure; ui/MapCanvas.tsx renders it.

import { FAMILIES } from "../pipelines.ts";
import { basinFacts } from "../production/model.ts";
import { blocksUnder, briefLine, scopeName } from "../scene/scopes.ts";
import type { CanvasStore } from "../store.ts";
import { BLOCK, CHAIN, STATE, isItemState } from "../tables.ts";
import { dayLabel, dayName, stageName } from "./prims.ts";
import type { MapHit } from "./state.ts";

/** `k`: the canvas keymap verb whose cap the tip shows, and the word after it. */
export type Tip = { readonly l: string; readonly m: string; readonly k: { readonly verb: string; readonly word: string } | null };

const stW = (s: string): string => (isItemState(s) ? STATE[s].word : s);

export function tipOf(st: CanvasStore, h: MapHit): Tip | null {
  const s = st.scene;
  let l = "";
  let m = "";
  let k: Tip["k"] = null;
  switch (h.type) {
    case "block": {
      const n = blocksUnder(s, h.scope)[h.kind].length;
      const B = BLOCK[h.kind];
      l = `${n} ${n === 1 ? B.one : B.name.toLowerCase()} · ${scopeName(h.scope)}`;
      m = B.tool === "gallery" ? "keep · reject · reasons" : CHAIN.map((c) => c.name.toLowerCase()).join(" → ");
      k = { verb: B.tool === "gallery" ? "triage" : "audio", word: "" };
      break;
    }
    case "item": {
      const r = h.ref;
      l = r.label;
      m = [stageName(r.si), stW(r.state), r.at, r.river.name].filter((x) => x !== "").join(" · ") + (r.block === "audio" ? " · no audio stream" : "");
      break;
    }
    case "town": {
      const r = h.ref;
      l = `${r.river.chan !== null ? r.river.chan.id : r.river.name} · ${stageName(r.si)}`;
      m = Object.entries(r.c).map(([x, n]) => `${n} ${stW(x)}`).join(" · ");
      break;
    }
    case "river": {
      const r = h.ref;
      l = r.name + (r.paused ? " · paused" : "");
      m = r.prod !== null ? basinFacts(r.prod).join(" · ") : r.synthetic ? FAMILIES.song.volume : `${r.kept}/${r.decided} decided kept · ${r.open} undecided · reach ${r.reach >= 0 ? stageName(r.reach) : "none"}`;
      break;
    }
    case "bundle":
      l = h.ref.rivers.map((x) => x.name).join(" · ");
      m = `${h.ref.prov.name} · none past ${stageName(1)}`;
      break;
    case "prov":
      l = `${h.ref.basin.name} › ${h.ref.name}`;
      m = `${h.ref.rivers.length} rivers · ${h.ref.blocks.n} waiting`;
      break;
    case "basin":
      l = h.ref.name;
      m = h.ref.fam.engine;
      break;
    case "port": {
      const c = h.ref.chan;
      if (h.ref.song || c === null) {
        l = "Publish · YouTube upload via the publish tick";
        m = FAMILIES.song.volume;
      } else {
        l = `${c.id} · ${c.name}`;
        m = `${c.group} · ${c.medium} · ${c.episodes.length} episodes · ${st.ui.slots.filter((x) => x.channel === c.id).length} slotted`;
      }
      break;
    }
    case "ship":
      l = h.ref.ep.title;
      m = `${h.ref.chan.id} · ${stW(h.ref.ep.state)} · ${h.ref.ep.logline}`;
      break;
    case "slot": {
      const r = h.ref;
      const today = st.view.today;
      l = r.title;
      m = `${r.channel} · ${r.state} · ${dayName(today, r.day)} ${dayLabel(today, r.day)} ${r.time}`;
      break;
    }
    case "station": {
      const x = h.ref.s;
      l = x.name;
      m = [x.tool, x.exists ? "" : "planned"].filter((y) => y !== "").join(" · ");
      break;
    }
    case "night":
      l = "Next night";
      m = `${st.ui.notes.length} notes · ${st.ui.mode} · until ${st.ui.until}`;
      k = { verb: "brief", word: "" };
      break;
    case "note": {
      const n = st.ui.notes.find((x) => x.id === h.ref);
      if (n === undefined) return null;
      l = n.text || n.stance;
      m = `${briefLine(n).split("]")[0] ?? ""}]`;
      break;
    }
  }
  if (k === null && (h.type === "item" || h.type === "town" || h.type === "river" || h.type === "prov" || h.type === "basin" || h.type === "port" || h.type === "bundle")) k = { verb: "note", word: "note" };
  return { l, m, k };
}
