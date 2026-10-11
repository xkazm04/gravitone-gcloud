"use client";

// THE FOUR THINGS THAT FLOAT ABOVE THE BOARD — the verb menu, the move map, the
// prompt a move is waiting on, and the refusal.
//
// They are grouped because they share one rule: WHERE FOCUS GOES WHEN THEY
// CLOSE. Each of them took the keyboard from the viewport, and the viewport is
// the focusable element that carries `aria-activedescendant` — so every exit
// path here hands focus back to it explicitly. The browser's own default is the
// document body, which loses the cursor the operator was on.
//
// THE REFUSAL IS A TOAST AND NOT A DIALOG on purpose: it carries the authority's
// own words plus the retry, and it must not take the keyboard away from a board
// the operator is still working. Escape dismisses it (./keymap.ts), R retries it.
//
// A FIFTH, ON DEMAND: the input a source verb asks for (./modals/VerbAsk.tsx),
// loaded with next/dynamic like the shell's dialogs - nothing on a board that
// nobody has right-clicked needs a form in its first chunk. It is `aria-modal`,
// so the canvas's keys stand down while it is up, and closing it hands focus
// back to the viewport like everything else here.

import dynamic from "next/dynamic";

import { X } from "lucide-react";

import ContextMenu from "./ContextMenu";
import type { Layout } from "./geometry";
import MoveMap from "./MoveMap";
import MovePrompt from "./MovePrompt";
import type { BoardMoves } from "./useBoardMoves";
import { isCellMenu, type BoardVerbs } from "./useBoardVerbs";

const VerbAsk = dynamic(() => import("./modals/VerbAsk").then((m) => m.VerbAsk));

export function BoardOverlays({
  layout,
  names,
  viewportRef,
  verbs,
  moves,
}: {
  layout: Layout;
  names: Partial<Record<string, string>>;
  viewportRef: React.RefObject<HTMLDivElement | null>;
  verbs: BoardVerbs;
  moves: BoardMoves;
}) {
  const { menu, map, ask } = verbs;
  const { prompt, notice } = moves;
  const refocus = () => viewportRef.current?.focus({ preventScroll: true });

  return (
    <>
      {menu &&
        (isCellMenu(menu) ? (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            label={`Actions for ${menu.where}`}
            items={verbs.cellItems(menu)}
            onPick={(verb) => verbs.runCellVerb(menu, verb)}
            onClose={() => verbs.setMenu(null)}
            restoreTo={() => viewportRef.current}
          />
        ) : (
          <ContextMenu
            x={menu.x}
            y={menu.y}
            label={`Actions for ${layout.entryOf.get(menu.id)?.item.title ?? "card"}`}
            items={verbs.verbItems(menu.id)}
            onPick={(verb) => verbs.runVerb(menu.id, verb)}
            onClose={() => verbs.setMenu(null)}
            restoreTo={() => viewportRef.current}
          />
        ))}
      {ask && (
        <VerbAsk
          verb={ask.verb}
          where={ask.where}
          run={(input) => verbs.perform(ask.target, ask.verb.id, input)}
          onClose={() => {
            verbs.setAsk(null);
            requestAnimationFrame(refocus);
          }}
        />
      )}
      {map && (
        <MoveMap
          layout={layout}
          id={map.id}
          verdicts={map.verdicts}
          names={names}
          x={map.x}
          y={map.y}
          onPick={(lane, col) => {
            verbs.setMap(null);
            refocus();
            void moves.decide(verbs.targetsFor(map.id), lane, col, { drag: false, verdicts: map.verdicts });
          }}
          onClose={() => {
            verbs.setMap(null);
            refocus();
          }}
        />
      )}
      {prompt && (
        <MovePrompt
          title={prompt.title}
          verb={prompt.verb}
          need={prompt.need}
          prompt={prompt.prompt}
          cost={prompt.cost}
          onSubmit={(a) => moves.answerPrompt(prompt, a)}
          onCancel={() => moves.cancelPrompt(prompt)}
        />
      )}
      {notice && (
        <div
          data-notice
          className="font-hanken absolute bottom-4 left-1/2 z-30 flex max-w-[min(36rem,90%)] -translate-x-1/2 items-start gap-3 rounded-xl border border-rose-300/50 bg-[var(--gt-ink)]/95 py-2.5 pr-2 pl-4 text-content text-rose-100 shadow-xl shadow-black/50 backdrop-blur-md"
        >
          <span className="min-w-0 flex-1 py-0.5">{notice.text}</span>
          {notice.retry && (
            <button
              type="button"
              onClick={notice.retry}
              className="font-jetbrains cursor-pointer rounded-full border border-rose-300/50 px-3 py-1 text-label text-rose-100 transition hover:bg-rose-300/15 focus-visible:outline-2"
            >
              Retry
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => moves.setNotice(null)}
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-rose-100/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-2"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
