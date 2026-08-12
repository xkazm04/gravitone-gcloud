"use client";

// THE STUDIO — one production walked through six steps. This was the home page
// until projects existed; it now opens from a row on /projects and is addressed
// by the project it is working on (`/studio/<projectId>`).
//
// Three changes came with the move:
//  · the headline is the PROJECT'S NAME — the user names it on creation, and
//    this is where that name is for
//  · the descriptive paragraph under it is gone. It described the fixture, not
//    the project, and it cost the fold
//  · the step rail is one row of numbers and titles (see Stepper.tsx)
//
// Still mocked below the rail: every step surface renders app/_studio's Glass
// Harbor fixture whatever project is open. The pill in the header says so.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import StudioFrame from "@/components/ui/StudioFrame";
import { Eyebrow } from "@/components/ui/Primitives";
import { useAuth } from "@/lib/useAuth";
import { PHASES, getProject, templateOf, type PhaseKey, type Project } from "@/lib/projects";

import LibraryShelves from "../../_library/LibraryShelves";
import { STEPS } from "./phases";
import Stepper from "./Stepper";

export default function StudioView({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const id = projectId;
  // `?step=` is a deep link from the shelf's matrix — open AT that column. It is
  // a hint, not identity: an unknown value falls back to the project's own
  // parked step rather than erroring, so an old link keeps working.
  const wanted = useSearchParams().get("step");

  const [project, setProject] = useState<Project | null>(null);
  const [view, setView] = useState<"project" | "library">("project");
  const [phaseKey, setPhaseKey] = useState<PhaseKey>("script");

  useEffect(() => {
    // No project in the URL is not an error state, it is a wrong door: the
    // studio has nothing to be the studio OF. Same for an id that belongs to
    // another account — IndexedDB is shared per browser, so the ownership check
    // is what keeps two people on one machine out of each other's work.
    if (!id || !user) {
      if (!id) router.replace("/projects");
      return;
    }
    let alive = true;
    void getProject(id)
      .then((p) => {
        if (!alive) return;
        if (!p || p.uid !== user.uid) {
          router.replace("/projects");
          return;
        }
        setProject(p);
        // Open on the step the work is parked at. Navigating the rail does NOT
        // write this back — browsing is not progress, and a ledger sorted by
        // "last touched" would start lying if it were.
        setPhaseKey(
          wanted && (PHASES as readonly string[]).includes(wanted)
            ? (wanted as PhaseKey)
            : p.phase,
        );
      })
      .catch(() => router.replace("/projects"));
    return () => {
      alive = false;
    };
  }, [id, user, router]);

  const step = STEPS.find((s) => s.key === phaseKey) ?? STEPS[0];

  return (
    <StudioFrame>
      <main className="pb-16">
        <header className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Eyebrow>studio</Eyebrow>
              {project && (
                <span className="font-jetbrains rounded-full border border-white/12 px-3 py-1 text-[11px] tracking-[0.14em] text-white/55 uppercase">
                  {templateOf(project.template).label} · {project.targetS}s
                </span>
              )}
              <span className="font-jetbrains rounded-full border border-amber-400/25 bg-amber-400/5 px-3 py-1 text-[11px] tracking-[0.18em] text-amber-300/90 uppercase">
                prototype · mocked data
              </span>
            </div>

            {/* view toggle: the production vs the shelves it fills */}
            <div className="font-jetbrains flex gap-2 text-[12px]">
              {(
                [
                  { key: "project", label: "Project" },
                  { key: "library", label: "Library" },
                ] as const
              ).map((v) => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  className={`cursor-pointer rounded-full border px-4 py-1.5 transition ${
                    view === v.key
                      ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                      : "border-white/10 text-white/50 hover:text-white/80"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <h1 className="font-instrument mt-4 text-4xl text-white">
            {project ? project.title : <span className="text-white/30">opening…</span>}
          </h1>
        </header>

        {view === "library" ? (
          <LibraryShelves />
        ) : (
          <>
            {project && (
              <div className="mt-6">
                <Stepper active={phaseKey} progress={project.progress} onPick={setPhaseKey} />
              </div>
            )}
            <section className="mt-8">{project ? step.render(project.id) : null}</section>
          </>
        )}
      </main>
    </StudioFrame>
  );
}
