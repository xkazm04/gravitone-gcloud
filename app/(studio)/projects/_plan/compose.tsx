"use client";

// COMPOSE, HOSTED - the dialog (@gt/ui ComposeDialog) over Plan and over Runs, opened by N or the
// list's "+ Compose". Picking a recipe composes a DRAFT through the port and opens its Plan; a
// film's title is the placeholder "Untitled film", which the Plan's title field takes from there
// (projects.js `composeRecipe` focused it; the Plan does on arrival with `?composed=1`).
//
// The submit is guarded synchronously (a ref): a held digit or a double click composes once.

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { ComposeDialog, type ComposeSources } from "@gt/ui/components/produce/ComposeDialog.tsx";

import type { ComposeChoices, ProducePort } from "../_port/contract.ts";

export type ComposeHost = { readonly open: () => void; readonly dialog: ReactNode };

export function useCompose(port: ProducePort, choices: ComposeChoices | null): ComposeHost {
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const inflight = useRef(false);
  const [value, setValue] = useState<ComposeSources>(() => ({
    styleId: choices?.styles[0]?.value ?? "",
    takeId: choices?.freshTake ?? choices?.takes[0]?.value ?? "",
    topic: choices?.topics[0]?.value ?? "",
  }));

  const pick = (recipe: string): void => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError(undefined);
    void port
      .compose({ recipe, ...(value.styleId === "" ? {} : { styleId: value.styleId }), ...(value.takeId === "" ? {} : { takeId: value.takeId }), ...(value.topic === "" ? {} : { topic: value.topic }) })
      .then((r) => {
        if (r.ok) {
          setOpen(false);
          router.push(`/projects/${encodeURIComponent(r.value.id)}?composed=1`);
        } else setError(r.error.error);
      })
      .finally(() => {
        inflight.current = false;
        setBusy(false);
      });
  };

  const dialog =
    choices === null ? null : (
      <ComposeDialog
        open={isOpen}
        onClose={() => setOpen(false)}
        recipes={choices.recipes}
        styles={choices.styles}
        takes={choices.takes}
        topics={choices.topics}
        value={value}
        onValue={setValue}
        onRecipe={pick}
        busy={busy}
        {...(error === undefined ? {} : { error })}
      />
    );
  return { open: () => setOpen(true), dialog };
}
