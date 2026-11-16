"use client";

// JUMP, wired to the studio: the sections from ../nav.ts, the operator's projects from the
// Projects port, the rows from ./resolve.ts, and a soft navigation on the pick (the shell never
// unmounts: no second session POST, no stream reopen - ../HeaderBar.tsx's reason for next/link).
//
// The projects are read ONCE per page life, on the first open, through the port's existing
// Server Action (`listProjects`, the read /projects itself draws; GRAVITONE_PRODUCE_SIDE decides
// fixture or real): no page pays for it until Jump is asked for, and no new route exists for it.
// A failed read is shown verbatim and tried again on the next open; the sections never wait on it.
//
// The action module is imported on the read, not at the top. Either way the browser receives
// only a server reference (measured 2026-11-09 on the dev build: the Jump chunk is 54 KB with no
// zod in it; actions.ts arrives as a `createServerReference` stub). But the client-closure walk
// (tests/next-gates/client-closure.test.ts) follows a static edge into a "use server" module as
// if its body shipped, and the screens' convention - a Server Component hands the port down as a
// prop (../../projects/_port/wire.ts) - would need the studio layout to carry it for a dialog
// most pages never open.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { JumpDialog, type JumpRow } from "@gt/ui/components/jump/Jump.tsx";

import { SECTIONS } from "../nav.ts";
import { destinations, type JumpProject } from "./resolve.ts";

type Projects = { readonly kind: "loading" } | { readonly kind: "ready"; readonly list: readonly JumpProject[] } | { readonly kind: "failed"; readonly message: string };

let read: Promise<Projects> | null = null;

function readProjects(): Promise<Projects> {
  read ??= import("../../projects/_port/actions.ts").then(({ listProjects }) => listProjects()).then(
    (r): Projects => (r.ok ? { kind: "ready", list: r.value.projects.map((p) => ({ id: p.id, title: p.title })) } : { kind: "failed", message: `projects · ${r.error.error}` }),
    (e: unknown): Projects => ({ kind: "failed", message: `projects · ${e instanceof Error ? e.message : String(e)}` }),
  );
  const mine = read;
  void mine.then((p) => {
    if (p.kind === "failed" && read === mine) read = null;
  });
  return mine;
}

export default function JumpLayer({ onClose }: { readonly onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Projects>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    void readProjects().then((p) => {
      if (live) setProjects(p);
    });
    return () => {
      live = false;
    };
  }, []);
  const rows = useMemo(() => destinations(query, SECTIONS, projects.kind === "ready" ? projects.list : []), [query, projects]);
  const go = (row: JumpRow): void => {
    onClose();
    router.push(row.href);
  };
  return (
    <JumpDialog
      query={query}
      onQuery={setQuery}
      rows={rows}
      onGo={go}
      onClose={onClose}
      placeholder="section · project · pkt:seeds:2026-10-23-2 · job:run:…"
      pending={projects.kind === "loading" ? "projects loading" : undefined}
      error={projects.kind === "failed" ? projects.message : undefined}
    />
  );
}
