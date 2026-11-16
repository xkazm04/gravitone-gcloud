// The three reads of a take compared (spark suno-api, packages/ui/src/components/suno/reads.ts): where
// what was measured, what Suno read and what Gemini heard disagree on tempo, key and section starts,
// at the tolerance of the pair that read them - plus the take surface drawn with Suno's column, and the
// library picker's not-connected door.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { StudioListen, StudioTakeFacts, SunoRead } from "@gt/domain/audio.suno";

import { answerProse, keysDiffer, offWords, readsDisagree, tempoDiffers } from "../../src/components/suno/reads.ts";
import { SunoPicker } from "../../src/components/suno/SunoPicker.tsx";
import { TakeFacts } from "../../src/components/suno/TakeFacts.tsx";
import { VerdictBar } from "../../src/components/suno/VerdictBar.tsx";

const suno: SunoRead = {
  at: "2026-11-10T09:00:00Z", status: "complete", bpm: 99.9, key: "B minor", timeSignature: 4,
  sections: [{ label: "A", startS: 0, endS: 20 }, { label: "B", startS: 20, endS: 60 }, { label: "C", startS: 60, endS: 120 }],
  terms: ["song", "piano"], labels: [{ label: "genre:house", p: 0.4 }, { label: "genre:electronic", p: 0.93 }], answer: "Progressive house.\n```json\n{\"bpm\": 99.9}\n```", words: 0,
};
const gemini: StudioListen = {
  model: "gemini-3.8-flash", at: "2026-11-10T09:01:00Z", genre: ["house"], mood: ["driving"], bpm: 101, key: "D major", vocals: { heard: false }, instruments: [],
  sections: [{ name: "intro", startS: 0, endS: 21, says: "piano" }, { name: "drop", startS: 21.5, endS: 70, says: "kick in" }, { name: "break", startS: 70, endS: 120, says: "pads" }],
};
const none = async (): Promise<string | null> => null;

describe("three reads compared", () => {
  test("two measured tempos agree within 2 %, a heard one within 4 %", () => {
    expect(tempoDiffers({ source: "measured", bpm: 100 }, { source: "suno", bpm: 101.9 })).toBe(false);
    expect(tempoDiffers({ source: "measured", bpm: 100 }, { source: "suno", bpm: 102.5 })).toBe(true);
    expect(tempoDiffers({ source: "suno", bpm: 100 }, { source: "gemini", bpm: 103.5 })).toBe(false);
    expect(tempoDiffers({ source: "measured", bpm: 100 }, { source: "gemini", bpm: 105 })).toBe(true);
  });

  test("each read's row names the others it disagrees with; a read the take lacks disagrees with nothing", () => {
    const d = readsDisagree({ measured: { bpm: 124, key: "B minor" }, suno, gemini });
    expect(d.bpm.measured).toEqual([{ source: "suno", value: "100" }, { source: "gemini", value: "101" }]);
    expect(d.bpm.suno).toEqual([{ source: "measured", value: "124" }]);
    expect(d.key.gemini).toEqual([{ source: "measured", value: "B minor" }, { source: "suno", value: "B minor" }]);
    expect(d.key.suno).toEqual([{ source: "gemini", value: "D major" }]);
    expect(offWords(d.bpm.measured)).toBe("suno 100 · gemini 101");
    expect(offWords(undefined)).toBeNull();
    const alone = readsDisagree({ measured: { bpm: 124, key: "B minor" } });
    expect(alone).toEqual({ bpm: {}, key: {}, sections: { suno: new Map(), gemini: new Map() } });
  });

  test("a section start with no boundary of the other read within 3 s is marked with the nearest one", () => {
    const d = readsDisagree({ measured: {}, suno, gemini });
    // Gemini's drop at 21.5 s sits 1.5 s from Suno's B at 20 s; its break at 70 s is 10 s from Suno's C at 60 s.
    expect([...d.sections.gemini]).toEqual([[2, 60]]);
    expect([...d.sections.suno]).toEqual([[2, 70]]);
    expect(readsDisagree({ measured: {}, suno }).sections.suno.size).toBe(0);
  });

  test("keys compare by pitch class and mode; a name that does not read as a key compares as words", () => {
    expect(keysDiffer("B minor", "Bm")).toBe(false);
    expect(keysDiffer("A minor", "A major")).toBe(true);
    expect(keysDiffer("modal", "Modal")).toBe(false);
  });

  test("Suno's answer reads as its prose; the json block is its rows", () => {
    expect(answerProse(suno.answer ?? "")).toBe("Progressive house.");
  });
});

const take: StudioTakeFacts = { takeId: "st-1", name: "Neon Overpass.mp3", durationS: 120, href: "/x", measured: { bpm: 124, key: "B minor" }, listenUsd: 0.006 };

describe("drawn", () => {
  test("a take uploaded by hand has no suno column; a pulled one does, with its free read and the disagreements", () => {
    const plain = renderToStaticMarkup(h(TakeFacts, { facts: take, onListen: none, onRead: none }));
    expect(plain).not.toContain(">suno<");
    expect(plain).toContain("gemini");
    const pulled = renderToStaticMarkup(h(TakeFacts, { facts: { ...take, sunoClipId: "fb3b98c4-x", suno, listened: gemini }, onListen: none, onRead: none }));
    expect(pulled).toContain("suno");
    expect(pulled).toContain("free");
    expect(pulled).toContain("99.9");
    expect(pulled).toContain("measured 124");
    // The measured column stands against Suno's measurement only; Gemini's guess is marked on its own side.
    expect(pulled).toMatch(/124<span[^>]*>suno 100<\/span>/);
    expect(pulled).toContain("measured B minor · suno B minor");
    expect(pulled).toContain("genre:electronic");
    expect(pulled.indexOf("genre:electronic")).toBeLessThan(pulled.indexOf("genre:house"));
    expect(pulled).toContain("words aligned");
    expect(pulled).toContain("Progressive house.");
    expect(pulled).not.toContain("```");
    expect(pulled).toContain("suno 1:00");
    const processing = renderToStaticMarkup(h(TakeFacts, { facts: { ...take, sunoClipId: "x", suno: { ...suno, status: "processing" } }, onListen: none, onRead: none }));
    expect(processing).toContain("processing");
    const refused = renderToStaticMarkup(h(TakeFacts, { facts: { ...take, sunoClipId: "x" }, onListen: none, onRead: none, readSeed: { kind: "refused", reason: "Too many concurrent listen requests" } }));
    expect(refused).toContain("Too many concurrent listen requests");
  });

  test("not connected, the picker is one link to Suno's sign-in; connected, the verdict row offers the library beside the file", () => {
    const off = renderToStaticMarkup(h(SunoPicker, { connection: { connected: false, reason: "not connected to suno" }, connectHref: "/api/suno/connect", library: async () => ({ songs: [] }), onPull: none }));
    expect(off).toContain('href="/api/suno/connect"');
    expect(off).toContain('aria-label="connect to suno: not connected to suno"');
    const open = renderToStaticMarkup(h(SunoPicker, { connection: { connected: true }, connectHref: "/c", library: async () => ({ songs: [] }), onPull: none, seed: { songs: [{ id: "s1", title: "One", status: "complete", durationS: 61 }, { id: "s2", title: "Two", status: "streaming" }] } }));
    expect(open).toContain('aria-label="pull One"');
    expect(open).toContain("1:01");
    expect(open).toMatch(/aria-label="pull Two"[^>]*disabled|disabled[^>]*aria-label="pull Two"/);
    const bar = renderToStaticMarkup(h(VerdictBar, { promptId: "p1", text: "", onSend: none, suno: { connection: { connected: true }, connectHref: "/c", library: async () => ({ songs: [] }), pull: async () => "x" } }));
    expect(bar).toContain("attach take");
    expect(bar).toContain("from suno");
  });
});
