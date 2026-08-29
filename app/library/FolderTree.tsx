"use client";

// The left rail — folders, derived from the assets that claim them.
//
// Every row shows a TOTAL rather than a direct count, because selecting a
// parent shows its whole subtree: the number and the click have to agree, or
// "presets · 30" that opens onto an empty room is just a lie with a tooltip.
//
// The rows are also where a dragged plate lands. That is a pointer shortcut on
// top of the move dialog, never the only way in — see MoveDialog.tsx.

import { useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";

import { pathKey, type FolderNode } from "@/lib/assets";

export default function FolderTree({
  nodes,
  selected,
  expanded,
  onSelect,
  onToggle,
  total,
  dragActive = false,
  over = null,
  onOver,
  onDropAsset,
  onRenameFolder,
}: {
  nodes: FolderNode[];
  selected: string[];
  expanded: Set<string>;
  onSelect: (path: string[]) => void;
  onToggle: (key: string) => void;
  total: number;
  /** A plate from this shelf is in flight. Gates the drop affordance, so a file
   *  dragged in off the desktop does not light up folders that will not take
   *  it. */
  dragActive?: boolean;
  /** The row under the pointer. Owned by the shelf rather than held here: a
   *  drag abandoned outside the rail ends with `dragend` on the TILE, which the
   *  rail never sees, so a local highlight would survive its own drag and light
   *  a stale row the moment the next one started. One owner, one lifetime. */
  over?: string | null;
  onOver?: (key: string | null) => void;
  onDropAsset?: (path: string[]) => void;
  onRenameFolder?: (path: string[], name: string) => void;
}) {
  const drop =
    dragActive && onDropAsset && onOver
      ? { over, setOver: onOver, onDrop: onDropAsset }
      : null;

  // Which row is being renamed, by path key. Held here rather than lifted: an
  // edit begins and ends inside one row, and unlike the drag session there is
  // no gesture that can end somewhere this component never sees.
  const [editing, setEditing] = useState<string | null>(null);
  const edit = onRenameFolder
    ? {
        editing,
        begin: setEditing,
        cancel: () => setEditing(null),
        commit: (path: string[], name: string) => {
          setEditing(null);
          onRenameFolder(path, name);
        },
      }
    : null;

  return (
    <nav className="space-y-0.5" aria-label="Asset folders" onDragLeave={() => onOver?.(null)}>
      {/* "All assets" is a VIEW, not a folder — dropping here would mean an
          empty path, and an asset claiming no folder disappears from the tree
          while still counting in the total above it. It stays a filter. */}
      <Row
        label="All assets"
        count={total}
        depth={0}
        active={selected.length === 0}
        onClick={() => onSelect([])}
      />
      {nodes.map((n) => (
        <Branch
          key={pathKey(n.path)}
          node={n}
          depth={0}
          selected={selected}
          expanded={expanded}
          onSelect={onSelect}
          onToggle={onToggle}
          drop={drop}
          edit={edit}
          siblings={nodes.map((s) => s.name)}
        />
      ))}
    </nav>
  );
}

/** What a row needs to be renamed in place. Null when the caller offers no
 *  rename, which keeps the affordance off rows that cannot use it. */
interface Edit {
  editing: string | null;
  begin: (key: string) => void;
  cancel: () => void;
  commit: (path: string[], name: string) => void;
}

/** What a row needs to be a landing site. Null when nothing is being dragged,
 *  which is also what keeps the handlers off the DOM entirely at rest. */
interface Drop {
  over: string | null;
  setOver: (key: string | null) => void;
  onDrop: (path: string[]) => void;
}

function Branch({
  node,
  depth,
  selected,
  expanded,
  onSelect,
  onToggle,
  drop,
  edit,
  siblings,
}: {
  node: FolderNode;
  depth: number;
  selected: string[];
  expanded: Set<string>;
  onSelect: (path: string[]) => void;
  onToggle: (key: string) => void;
  drop: Drop | null;
  edit: Edit | null;
  /** The names beside this one, so a rename can warn before it merges. */
  siblings: string[];
}) {
  const key = pathKey(node.path);
  const open = expanded.has(key);
  const active = pathKey(selected) === key;

  return (
    <>
      <Row
        label={node.name}
        count={node.total}
        depth={depth}
        active={active}
        open={open}
        hasChildren={node.children.length > 0}
        onToggle={() => onToggle(key)}
        onClick={() => onSelect(node.path)}
        drop={drop}
        path={node.path}
        edit={edit}
        siblings={siblings}
      />
      {open &&
        node.children.map((c) => (
          <Branch
            key={pathKey(c.path)}
            node={c}
            depth={depth + 1}
            selected={selected}
            expanded={expanded}
            onSelect={onSelect}
            onToggle={onToggle}
            drop={drop}
            edit={edit}
            siblings={node.children.map((s) => s.name)}
          />
        ))}
    </>
  );
}

function Row({
  label,
  count,
  depth,
  active,
  open,
  hasChildren,
  onToggle,
  onClick,
  drop,
  path,
  edit,
  siblings = [],
}: {
  label: string;
  count: number;
  depth: number;
  active: boolean;
  open?: boolean;
  hasChildren?: boolean;
  onToggle?: () => void;
  onClick: () => void;
  drop?: Drop | null;
  path?: string[];
  edit?: Edit | null;
  siblings?: string[];
}) {
  const key = path ? pathKey(path) : null;
  const landing = Boolean(drop && key && drop.over === key);
  const renaming = Boolean(edit && key && edit.editing === key);
  // The handlers exist only while something is actually being dragged, which is
  // what keeps a plain click on a folder from paying for a gesture nobody is
  // making.
  const dnd =
    drop && key && path
      ? {
          onDragOver: (e: React.DragEvent) => {
            // Without preventDefault the browser treats this as "not a drop
            // target" and never fires onDrop — the single most common way a
            // drop silently does nothing.
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (drop.over !== key) drop.setOver(key);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            drop.onDrop(path);
          },
        }
      : {};

  return (
    <div
      {...dnd}
      className={`flex items-center gap-1 rounded-lg pr-2 transition ${
        landing
          ? "bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/50"
          : active
            ? "bg-cyan-400/10 text-cyan-200"
            : "text-white/60 hover:bg-white/5 hover:text-white/85"
      }`}
      style={{ paddingLeft: depth * 12 }}
    >
      {hasChildren ? (
        <button
          onClick={onToggle}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          className="shrink-0 rounded p-1 text-white/40 transition hover:text-white/80"
        >
          {open ? <ChevronDown className="h-3 w-3" aria-hidden /> : <ChevronRight className="h-3 w-3" aria-hidden />}
        </button>
      ) : (
        <span className="w-5 shrink-0" aria-hidden />
      )}

      {renaming && path ? (
        <FolderNameEditor
          initial={label}
          siblings={siblings}
          onCancel={() => edit?.cancel()}
          onCommit={(name) => edit?.commit(path, name)}
        />
      ) : (
        <button
          onClick={onClick}
          // F2 is the rename key everywhere a tree has one, and the double
          // click is the mouse half of the same act. Both, because either
          // alone leaves one kind of user unable to rename anything.
          onDoubleClick={() => key && edit?.begin(key)}
          onKeyDown={(e) => {
            if (e.key === "F2" && key && edit) {
              e.preventDefault();
              edit.begin(key);
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        >
          {open ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          )}
          <span className="font-hanken truncate text-[13px]">{label}</span>
          <span className="font-jetbrains ml-auto shrink-0 text-[10px] text-white/30">{count}</span>
        </button>
      )}
    </div>
  );
}

/**
 * The inline rename field.
 *
 * Enter commits, Escape abandons, and blur commits — the last because a click
 * elsewhere in a tree reads as "I am done here", not as "discard what I typed".
 * An empty name is refused by the hook rather than here, so this stays a field
 * and the rule lives in one place.
 *
 * The merge warning is the honest part. Folders exist only because assets claim
 * them, so renaming onto a sibling's name does not collide — it MERGES, and the
 * plates end up in one folder. That is coherent and it is also not what most
 * people mean, so it is said before Enter rather than discovered after.
 */
function FolderNameEditor({
  initial,
  siblings,
  onCancel,
  onCommit,
}: {
  initial: string;
  siblings: string[];
  onCancel: () => void;
  onCommit: (name: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  const merges = trimmed !== initial && siblings.includes(trimmed);

  return (
    <span className="flex min-w-0 flex-1 flex-col py-1">
      <input
        autoFocus
        value={value}
        aria-label={`Rename folder ${initial}`}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => {
          // Stopped from propagating: the tree above listens for keys of its
          // own, and a folder called "x2" should not be selecting tiles as it
          // is typed.
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="font-hanken w-full rounded border border-cyan-400/40 bg-slate-950/80 px-2 py-0.5 text-[13px] text-white outline-none"
      />
      {merges && (
        <span className="font-jetbrains mt-1 text-[10px] leading-snug text-amber-200/80">
          a folder here is already called {trimmed} — renaming merges them
        </span>
      )}
    </span>
  );
}
