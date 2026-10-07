"use client";

// THE PAPER COSMOS — the public landing (contest landing-universe, chosen
// 2026-10-07). A backlit cut-paper shadow-box: a dusk sky, a swirling galaxy of
// stacked sheets, the project types as hand-cut medallions and the library as
// paper reams on the horizon. A type opens its own world and its templates; a
// family opens its sheet of categories. The one verb is EnterButton (./../parts).
//
// This component renders the static skeleton and mounts the engine into it; the
// engine (./engine, its own chunk) owns everything that moves. The galaxy is the
// registries' (./data), or the one a test injects as window.__PC_GALAXY__ before
// the page loads (the projected 20-type scale). `?tier=full|lite|still` forces a
// quality tier for the performance instrument.

import { useEffect, useRef } from "react";

import { EnterButton } from "../parts";
import { registryGalaxy } from "./data";
import type { CosmosHandle, CosmosTier } from "./engine";
import { dmSans, fraunces } from "./fonts";
import type { Galaxy } from "./types";
import "./cosmos.css";

declare global {
  interface Window {
    __PC_GALAXY__?: Galaxy;
  }
}

const TIERS: readonly CosmosTier[] = ["full", "lite", "still"];
const SEARCH_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.2" />
    <path d="m15.2 15.2 5 5" />
  </svg>
);

export default function Cosmos() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let handle: CosmosHandle | null = null;
    let gone = false;
    const asked = new URLSearchParams(window.location.search).get("tier");
    const tier = TIERS.find((t) => t === asked);
    const galaxy = window.__PC_GALAXY__ ?? registryGalaxy();
    void import("./engine").then(({ mountCosmos }) => {
      if (gone || !ref.current) return;
      handle = mountCosmos(ref.current, galaxy, tier ? { tier } : {});
    });
    return () => {
      gone = true;
      handle?.destroy();
    };
  }, []);

  return (
    <div ref={ref} className={`pc ${fraunces.variable} ${dmSans.variable}`} data-world="paper-cosmos" data-lv="root">
      <div className="stagev" id="scene" />
      <div id="veil" />
      <div id="world" />
      <div id="grainov" />
      <div id="banner" aria-hidden="true">
        <div className="bn-wrap">
          <i className="bn-back" />
          <div className="bn-front">
            <span className="bn-name" />
            <span className="bn-meta" />
          </div>
        </div>
      </div>
      <section className="view" id="typeView" />
      <section className="view" id="stageView" />
      <section className="view" id="libView" />
      <header id="hud">
        <div id="wm">
          <i />
          Gravitone
        </div>
        <div className="navrow">
          <button id="back" type="button" aria-label="Back" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14.5 5.5 8 12l6.5 6.5" />
            </svg>
          </button>
          <nav id="crumbs" aria-label="Path" />
        </div>
      </header>
      <div id="tr">
        <button className="icobtn" id="searchBtn" type="button" aria-label="Search">
          {SEARCH_ICON}
        </button>
        <EnterButton appearance="paper" />
      </div>
      <nav id="depth" aria-label="Depth" />
      <div id="search" role="dialog" aria-label="Search">
        <div className="slip">
          <div className="inp">
            {SEARCH_ICON}
            <input id="q" type="text" autoComplete="off" spellCheck={false} aria-label="Search" />
          </div>
          <ul className="res" id="res" />
        </div>
      </div>
      <div id="hero" aria-hidden="true">
        Gravitone
      </div>
      <div id="flare" aria-hidden="true">
        <i className="fl" />
        <i className="sh" />
        <i className="sh" />
        <i className="sh" />
      </div>
    </div>
  );
}
