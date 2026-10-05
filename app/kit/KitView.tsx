"use client";

// /kit — the Almanac world's design guidelines and the specimen the next builders
// read to learn what exists. Four modules on one rail: Identity (mark, palette,
// type, marks, motion), Law (the rules and where each is held), Parts (every export
// of components/kit in each state), Migration (what each module of the app will need
// and what the kit lacks). Data lives in catalog.ts and migration.ts; this file
// only lays them out.

import { useEffect, useState } from "react";

import { PageHead, TabRail, Tag } from "@/components/kit";
import { Mark } from "@/components/kit/brand";
import StudioFrame from "@/components/ui/StudioFrame";

import { GAPS } from "./migrationMap";
import { PART_COUNT, RULES } from "./catalog";
import { Identity } from "./Identity";
import { Law } from "./Law";
import { Migration } from "./Migration";
import { Parts } from "./Parts";
import "./kit-route.css";

type Module = "identity" | "law" | "parts" | "migration";
const MODULES: Module[] = ["identity", "law", "parts", "migration"];

export default function KitView() {
  const [tab, setTab] = useState<Module>("identity");

  // A module is addressable: /kit#parts opens the specimen sheet.
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace("#", "") as Module;
      if (MODULES.includes(h)) setTab(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const select = (id: Module) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <StudioFrame world="almanac" crumbs={[{ label: "Projects", href: "/projects" }, { label: "Kit" }]}>
      <PageHead
        eyebrow="Design guidelines · Almanac"
        title="Kit"
        figure={<Mark size={72} title="Gravitone" />}
        caption={<Tag>specimen</Tag>}
      />
      <TabRail
        label="kit modules"
        active={tab}
        onSelect={select}
        tabs={[
          { id: "identity", label: "Identity" },
          { id: "law", label: "Law", tally: { value: RULES.length } },
          { id: "parts", label: "Parts", tally: { value: PART_COUNT } },
          { id: "migration", label: "Migration", tally: { value: GAPS.length, tone: GAPS.length ? "amber" : "neutral" } },
        ]}
      />
      {tab === "identity" && <Identity />}
      {tab === "law" && <Law />}
      {tab === "parts" && <Parts />}
      {tab === "migration" && <Migration />}
    </StudioFrame>
  );
}
