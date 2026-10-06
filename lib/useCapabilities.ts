"use client";

// THE CAPABILITY MATRIX IN THE BROWSER — the server's answer, not a guess.
//
// lib/capabilities.ts needs two facts the bundle cannot see (the music key, the
// spawn posture). This hook asks GET /api/capabilities once per page load and
// shares the answer with every surface that mounts after it.
//
// UNTIL THE ANSWER LANDS, A FACT-BACKED CAPABILITY IS OFF (`PENDING_FACTS`).
// The alternative — on until told otherwise — is the button lib/capabilities.ts
// exists to prevent, for as long as the request takes. So a render control is
// shut for that moment, and `known` lets a surface tell "not yet" from "no"
// (only "no" carries a reason).
//
// IF THE QUESTION FAILS (a 401 before sign-in settles, a dropped connection),
// the facts are taken as present: the flags still decide, and a route that
// cannot serve answers in its own words. A failure is not cached, so the next
// surface to mount asks again.

import { useEffect, useState } from "react";

import { capabilities, PENDING_FACTS, type Capabilities, type CapabilitiesAnswer, type DeploymentFacts } from "./capabilities";
import { accessHeader } from "./imagingClient";

export interface CapabilitiesView {
  caps: Capabilities;
  facts: DeploymentFacts;
  /** The server has answered (or failed to, and the flags alone decided). */
  known: boolean;
}

const UNANSWERED: DeploymentFacts = { musicKey: true, localBinaries: true };

let answered: CapabilitiesView | null = null;
let asking: Promise<CapabilitiesView> | null = null;

function ask(): Promise<CapabilitiesView> {
  asking ??= fetch("/api/capabilities", { headers: accessHeader(), cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()) as CapabilitiesAnswer) : null))
    .catch(() => null)
    .then((a): CapabilitiesView => {
      if (a) return (answered = { caps: a.capabilities, facts: a.facts, known: true });
      asking = null;
      return { caps: capabilities(UNANSWERED), facts: UNANSWERED, known: true };
    });
  return asking;
}

const pending = (): CapabilitiesView => ({ caps: capabilities(PENDING_FACTS), facts: PENDING_FACTS, known: false });

export function useCapabilities(): CapabilitiesView {
  const [view, setView] = useState<CapabilitiesView>(() => answered ?? pending());
  useEffect(() => {
    if (view.known) return;
    let live = true;
    void ask().then((v) => live && setView(v));
    return () => {
      live = false;
    };
  }, [view.known]);
  return view;
}
