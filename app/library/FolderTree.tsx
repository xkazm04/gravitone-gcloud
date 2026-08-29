"use client";

// The left rail — folders, derived from the assets that claim them.
//
// Every row shows a TOTAL rather than a direct count, because selecting a
// parent shows its whole subtree: the number and the click have to agree, or
// "presets · 30" that opens onto an empty room is just a lie with a tooltip.
//
// The rows are also where a dragged plate lands. That is a pointer shortcut on
// top of the move dialog, never the only way in — see MoveDialog.tsx.

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
}) {
  const drop =
    dragActive && onDropAsset && onOver
      ? { over, setOver: onOver, onDrop: onDropAsset }
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
        />
      ))}
    </nav>
  );
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
}: {
  node: FolderNode;
  depth: number;
  selected: string[];
  expanded: Set<string>;
  onSelect: (path: string[]) => void;
  onToggle: (key: string) => void;
  drop: Drop | null;
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
}) {
  const key = path ? pathKey(path) : null;
  const landing = Boolean(drop && key && drop.over === key);
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

      <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
        {open ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        ) : (
          <Folder className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        )}
        <span className="font-hanken truncate text-[13px]">{label}</span>
        <span className="font-jetbrains ml-auto shrink-0 text-[10px] text-white/30">{count}</span>
      </button>
    </div>
  );
}
