"use client";

// /projects with no composition yet: the list's frame with nothing in it, and the two acts that
// fill it - compose a recipe, or import this browser's v1 projects (they are rows in IndexedDB the
// server cannot see until the import page sends them).
import { Empty } from "@gt/ui/components/empty/Empty.tsx";
import { useKeys } from "@gt/ui/keymap/dispatch";
import { useRouter } from "next/navigation";

import type { ProjectList } from "@gt/domain/produce";

import type { ComposeChoices, ProducePort } from "../_port/contract.ts";
import { CompositionList } from "./CompositionList.tsx";
import { useCompose } from "./compose.tsx";
import s from "./Plan.module.css";

export type NoPlanProps = {
  readonly list: ProjectList;
  readonly choices: ComposeChoices | null;
  readonly port: ProducePort;
  readonly nowMs: number;
  readonly floorRuns: number;
  readonly composing: boolean;
};

export function NoPlan({ list, choices, port, nowMs, floorRuns, composing }: NoPlanProps) {
  const router = useRouter();
  const compose = useCompose(port, choices, composing);
  useKeys("projects", { compose: () => compose.open(), runs: () => router.push("/projects/runs"), plan: () => false });
  return (
    <div className={s.proj}>
      <CompositionList list={list} current={null} nowMs={nowMs} onCompose={compose.open} floorRuns={floorRuns} />
      <section className={s.pmain} aria-label="Plan">
        <Empty label="no compositions" action={{ label: "import v1 projects", size: "sm", glyphAfter: "chevR", href: "/projects/import" }} />
      </section>
      {compose.dialog}
    </div>
  );
}
