"use client";

// WHERE A PLATE GOES — the keyboard route to refiling one.
//
// Dragging is the fast way and this is the reachable one, and it exists first
// for the reason the shelf already made a rule of when Delete was added beside
// the right-click: an action available only by mouse is one a keyboard user
// cannot perform at all. The pointer gesture is a shortcut layered on top of a
// route that already works, never the route itself.
//
// Destinations are the folders the shelf ALREADY HAS, plus one you name. That
// is not a limitation dressed up — folders are derived from the paths assets
// claim (lib/assets.ts), so an empty folder cannot exist to be listed here, and
// naming one is exactly the act of moving the first plate into it.

import { useState } from "react";

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import { pathKey, type FolderNode } from "@/lib/assets";

/** The same rule folder names are minted under when a style produces one
 *  (lib/assets.ts#styleFolder), applied to what the user types — so a hand-made
 *  folder cannot sit beside a generated one looking like a different species. */
export const folderSlug = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

interface Row {
  path: string[];
  name: string;
  depth: number;
  total: number;
}

function flatten(nodes: FolderNode[], depth = 0, into: Row[] = []): Row[] {
  for (const n of nodes) {
    into.push({ path: n.path, name: n.name, depth, total: n.total });
    flatten(n.children, depth + 1, into);
  }
  return into;
}

export default function MoveDialog({
  count,
  subject,
  from,
  tree,
  onClose,
  onMove,
}: {
  /** How many plates are being refiled — one today, a selection later. */
  count: number;
  /** What to call them in the heading. */
  subject: string;
  /** Where they sit now, so the dialog can refuse to "move" them there. Empty
   *  when a batch spans folders — there is then no single origin to refuse. */
  from: string[];
  tree: FolderNode[];
  onClose: () => void;
  onMove: (path: string[]) => void;
}) {
  const rows = flatten(tree);
  const [pick, setPick] = useState<string[]>(from);
  const [newName, setNewName] = useState("");

  const slug = folderSlug(newName);
  const dest = slug ? [...pick, slug] : pick;
  // Nothing to do when the destination is where they already are, and nothing
  // to do at the root either: an asset with an empty path claims no folder and
  // would vanish from the tree while still counting in "all assets".
  const same = pathKey(dest) === pathKey(from);
  const rootless = dest.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={count === 1 ? `Move ${subject}` : `Move ${count} plates`}
      eyebrow={
        <p className="font-jetbrains text-[11px] tracking-[0.14em] text-white/40 uppercase">refile</p>
      }
      subtitle={
        <span className="font-hanken">
          Currently in{" "}
          <span className="text-white/80">
            {from.join(" › ") || (count > 1 ? "several folders" : "no folder")}
          </span>
          .
        </span>
      }
      className="max-w-lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="font-jetbrains text-[11px] text-white/45">
            {rootless
              ? "pick a folder, or name a new one"
              : same
                ? "already here"
                : `to ${dest.join(" › ")}`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} className="px-5 py-2">
              Cancel
            </Button>
            <Button onClick={() => onMove(dest)} disabled={same || rootless} className="px-5 py-2">
              Move
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="font-jetbrains mb-2 text-[11px] tracking-[0.14em] text-white/40 uppercase">
            folders on the shelf
          </p>
          <div className="scroll-y max-h-64 space-y-0.5 rounded-xl border border-white/8 p-1">
            {rows.length === 0 ? (
              <p className="font-hanken px-3 py-4 text-sm text-slate-400">
                No folders yet — name one below and this plate makes it.
              </p>
            ) : (
              rows.map((r) => {
                const key = pathKey(r.path);
                const active = pathKey(pick) === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setPick(r.path)}
                    style={{ paddingLeft: 12 + r.depth * 12 }}
                    className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-3 text-left transition ${
                      active
                        ? "bg-cyan-400/10 text-cyan-200"
                        : "text-white/60 hover:bg-white/5 hover:text-white/85"
                    }`}
                  >
                    <span className="font-hanken min-w-0 flex-1 truncate text-[13px]">{r.name}</span>
                    <span className="font-jetbrains shrink-0 text-[10px] text-white/30">{r.total}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor="move-new-folder"
            className="font-jetbrains mb-2 block text-[11px] tracking-[0.14em] text-white/40 uppercase"
          >
            or a new folder inside it
          </label>
          <input
            id="move-new-folder"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="keepers"
            className="font-hanken w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/90 outline-none transition placeholder:text-white/25 focus:border-cyan-400/40"
          />
          {/* The typed name and the minted name are shown to differ BEFORE the
              move, not discovered afterwards in the tree. */}
          {slug && slug !== newName.trim() && (
            <p className="font-jetbrains mt-1.5 text-[11px] text-white/35">filed as {slug}</p>
          )}
          {newName.trim() && !slug && (
            <p className="font-jetbrains mt-1.5 text-[11px] text-amber-200/80">
              nothing in that name survives as a folder — letters or numbers, please
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
