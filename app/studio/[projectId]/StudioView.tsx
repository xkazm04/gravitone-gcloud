"use client";

// THE STUDIO — one production walked through five steps. This was the home page
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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import StudioFrame from "@/components/ui/StudioFrame";
import { Eyebrow } from "@/components/ui/Primitives";
import { useAuth } from "@/lib/useAuth";
import { PHASES, getProject, parkAt, templateOf, type PhaseKey, type Project } from "@/lib/projects";

import LibraryShelves from "../../_library/LibraryShelves";
import { STEPS } from "./phases";
import Stepper from "./Stepper";

/**
 * WHAT HAPPENED AT THE DOOR. Three different facts used to be one
 * `.catch(() => router.replace("/projects"))`, which threw away the message
 * lib/studioDb.ts had carefully built (quota, blocked tab, unavailable) and
 * bounced the user with no explanation — while the identical failure one route
 * over, on /projects, gets a banner.
 *
 * `absent` COVERS TWO CASES ON PURPOSE: no such project, and a project owned by
 * another account on this browser. They are presented identically, and the
 * choice is deliberate rather than lazy:
 *
 *  · There is no secret to keep from a determined reader. lib/projects.ts says
 *    it out loud — the uid scoping is a data-shape decision, not a security
 *    boundary, and any code on this page can read the whole store.
 *  · But the case that scoping exists for is TWO PEOPLE ON ONE MACHINE, and
 *    "this project belongs to someone else" is the one sentence that turns a
 *    shared laptop into a disclosure. It confirms a stranger's work exists to
 *    somebody with no claim on it.
 *  · And it buys the user nothing. Either way there is nothing here for THEM to
 *    open and the next move is the same. So the copy names both possibilities
 *    and refuses to say which — true, and it leaks nothing.
 *
 * `storage` is not merged into that, because it is the one of the three that is
 * NOT the user's fault, the work is on disk and merely out of reach, and the
 * thing to do about it is different.
 */
type Door =
  | { kind: "opening" }
  | { kind: "open" }
  | { kind: "absent" }
  | { kind: "storage"; message: string };

export default function StudioView({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const id = projectId;
  // `?step=` is a deep link from the shelf's matrix — open AT that column. It is
  // a hint, not identity: an unknown value falls back to the project's own
  // parked step rather than erroring, so an old link keeps working.
  const wanted = useSearchParams().get("step");

  const [project, setProject] = useState<Project | null>(null);
  const [door, setDoor] = useState<Door>({ kind: "opening" });
  const [view, setView] = useState<"project" | "library">("project");
  const [phaseKey, setPhaseKey] = useState<PhaseKey>("script");

  useEffect(() => {
    // No project in the URL is not an error state, it is a wrong door: the
    // studio has nothing to be the studio OF, and there is no page to draw the
    // explanation on. That one still redirects.
    if (!id || !user) {
      if (!id) router.replace("/projects");
      return;
    }
    let alive = true;
    void getProject(id)
      .then((p) => {
        if (!alive) return;
        if (!p || p.uid !== user.uid) {
          setDoor({ kind: "absent" });
          return;
        }
        setProject(p);
        setDoor({ kind: "open" });
        // Open on the step the work is parked at — see `pick` below for what
        // moves that bookmark, and for the reasoning this replaces.
        setPhaseKey(
          wanted && (PHASES as readonly string[]).includes(wanted)
            ? (wanted as PhaseKey)
            : p.phase,
        );
      })
      .catch((e: unknown) => {
        if (!alive) return;
        // studioDb rejects with a SENTENCE — "storage is open in another tab",
        // "IndexedDB unavailable", the browser's own quota error. It is the
        // only thing that knows which of those happened, so it is carried
        // through rather than replaced with a generic apology.
        setDoor({
          kind: "storage",
          message: e instanceof Error ? e.message : "could not read this project",
        });
      });
    return () => {
      alive = false;
    };
  }, [id, user, router]);

  /**
   * Moving along the rail.
   *
   * The comment this replaces refused to write anything here, on the grounds
   * that *browsing is not progress* and a shelf sorted by "last touched" would
   * start lying. That reasoning is right and is kept — it is an argument about
   * `progress` and `updatedAt`, both of which this still leaves alone. What it
   * was never an argument for is forgetting: `project.phase` stayed frozen at
   * `"research"` for the life of every project, so a creator who finished
   * Research and moved to Script re-walked the rail by hand on every re-entry.
   *
   * So "arrived at this step" is defined as narrowly as it can be and still be
   * useful: THE USER MOVED THE RAIL THEMSELVES. Not a `?step=` deep link —
   * that is somebody else's navigation arriving in your tab, and it should not
   * repark the project on a step you did not choose. Not the initial open,
   * which is where the bookmark already pointed. `parkAt` writes `phase` and
   * nothing else, so the matrix draws the same row in the same place with the
   * same "Updated" column as before the click.
   *
   * Re-reading the record afterwards is the other half: a step reports its own
   * state while you stand on it (see lib/projects#reportPhase), so leaving one
   * is exactly the moment the rail's badges can go stale. Cheap — one keyed
   * read — and it means the number you just changed is tinted correctly by the
   * time you look back at it.
   */
  const pick = (key: PhaseKey) => {
    setPhaseKey(key);
    if (!id || !user) return;
    void (async () => {
      try {
        await parkAt(id, key);
        const fresh = await getProject(id);
        if (fresh && fresh.uid === user.uid) setProject(fresh);
      } catch {
        // The bookmark did not land, or the re-read did not answer. Neither is
        // worth interrupting the user mid-navigation over: the step they asked
        // for is already on screen, and the rail keeps showing the states it
        // last read rather than inventing fresher ones.
      }
    })();
  };

  const step = STEPS.find((s) => s.key === phaseKey) ?? STEPS[0];
  // The headline is the project's name when there is one. When there is not, it
  // says which of the three doors this is rather than sitting on "opening…"
  // forever, which is what a caught failure used to look like for the instant
  // before the redirect took the page away.
  const headline =
    door.kind === "open" && project
      ? project.title
      : door.kind === "absent"
        ? "Nothing to open here"
        : door.kind === "storage"
          ? "This project could not be read"
          : "opening…";

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

          <h1
            className={`font-instrument mt-4 text-4xl ${door.kind === "opening" ? "text-white/30" : "text-white"}`}
          >
            {headline}
          </h1>
        </header>

        {view === "library" ? (
          <LibraryShelves />
        ) : door.kind === "absent" ? (
          <div
            data-testid="door-absent"
            className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4"
          >
            <p className="font-hanken text-sm leading-snug text-slate-300">
              This address does not name a project on your account. Either it was deleted, or it
              belongs to a different account signed in on this browser — the studio will not say
              which, and cannot open it either way.
            </p>
            <Link
              href="/projects"
              className="font-jetbrains mt-3 inline-block rounded-lg border border-white/15 px-3 py-1.5 text-[12px] text-white/70 transition hover:bg-white/5"
            >
              back to your projects →
            </Link>
          </div>
        ) : door.kind === "storage" ? (
          <div
            data-testid="door-storage"
            className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-400/5 px-5 py-4"
          >
            {/* Same voice as /projects' banner, because it is the same failure —
                and it says the same thing about whose fault it is. The work is
                not gone; this browser would not hand it over. */}
            <p className="font-hanken text-sm leading-snug text-rose-200">
              {door.message} — this project lives in this browser&rsquo;s storage, and it did not
              answer. Nothing has been lost; nothing can be read or saved until it does.
            </p>
            <Link
              href="/projects"
              className="font-jetbrains mt-3 inline-block rounded-lg border border-rose-400/30 px-3 py-1.5 text-[12px] text-rose-200 transition hover:bg-rose-400/10"
            >
              back to your projects →
            </Link>
          </div>
        ) : (
          <>
            {project && (
              <div className="mt-6">
                <Stepper active={phaseKey} progress={project.progress} onPick={pick} />
              </div>
            )}
            <section className="mt-8">{project ? step.render(project.id) : null}</section>
          </>
        )}
      </main>
    </StudioFrame>
  );
}
