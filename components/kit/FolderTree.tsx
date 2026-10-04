"use client";

// A FOLDER TREE: named places, each with the total of what is under it.
//
// Every row shows a TOTAL, not a direct count, because selecting a parent shows
// its whole subtree: the number and the click have to agree.
//
// It is a real tree (role="tree" / "treeitem", aria-level, aria-expanded) with the
// keyboard a tree owes: ONE tab stop, ArrowDown / ArrowUp move between visible
// rows, ArrowRight opens (then steps in), ArrowLeft closes (then steps out),
// Home / End, Enter or Space selects, F2 renames, Shift+F10 or the Menu key asks
// for the row's menu. The "all" row is a view, not a folder: it takes selection but
// never a drop and never a rename.
//
// The nodes are structural: any `{name, path, total, children}` fits, which is what
// lib/assets `FolderNode` already is. The tree owns nothing but which row holds the
// tab stop and which row is being renamed; selection, expansion, the row under a
// drag and every write belong to the caller.
//
// A rename onto a sibling's name MERGES, because folders exist only as the paths
// their contents claim. That consequence is drawn before Enter: a merge mark and
// "merges with <name>" on the editor. The drop is a pointer shortcut only, never
// the only way to move something.

import { useEffect, useMemo, useRef, useState } from "react";

import { Ico } from "./Ico";

export interface FolderNode {
  name: string;
  path: string[];
  /** Everything under it, itself included. */
  total: number;
  children: FolderNode[];
}

const keyOf = (path: string[]) => path.join("/");
const ALL = "\u0000all";

interface Row {
  key: string;
  path: string[];
  name: string;
  total: number;
  depth: number;
  hasChildren: boolean;
  open: boolean;
  siblings: string[];
}

export function FolderTree({
  label,
  nodes,
  selected,
  expanded,
  onSelect,
  onToggle,
  total,
  allLabel = "All",
  dragActive = false,
  over = null,
  onOver,
  onDropOn,
  onRename,
  onMenu,
}: {
  /** The tree's accessible name: "Asset folders". */
  label: string;
  nodes: FolderNode[];
  /** The selected path; `[]` is the "all" row. */
  selected: string[];
  /** Keys (`path.join("/")`) of the open folders. */
  expanded: ReadonlySet<string>;
  onSelect: (path: string[]) => void;
  onToggle: (key: string) => void;
  /** The "all" row's total. Omit to draw no "all" row. */
  total?: number;
  allLabel?: string;
  /** Something from this shelf is in flight; gates the drop mark. */
  dragActive?: boolean;
  /** The row key under the pointer, owned by the caller so a drag abandoned
   *  elsewhere cannot leave a stale row lit. */
  over?: string | null;
  onOver?: (key: string | null) => void;
  onDropOn?: (path: string[]) => void;
  onRename?: (path: string[], name: string) => void;
  /** Asked for a row's menu, at the pointer (or under the row from the keyboard). */
  onMenu?: (path: string[], at: { x: number; y: number }) => void;
}) {
  const rows = useMemo(() => {
    const out: Row[] = [];
    if (total !== undefined) {
      out.push({ key: ALL, path: [], name: allLabel, total, depth: 0, hasChildren: false, open: false, siblings: [] });
    }
    const walk = (ns: FolderNode[], depth: number) => {
      for (const n of ns) {
        const k = keyOf(n.path);
        const open = expanded.has(k);
        out.push({
          key: k,
          path: n.path,
          name: n.name,
          total: n.total,
          depth,
          hasChildren: n.children.length > 0,
          open,
          siblings: ns.map((s) => s.name),
        });
        if (open) walk(n.children, depth + 1);
      }
    };
    walk(nodes, 0);
    return out;
  }, [nodes, expanded, total, allLabel]);

  const selKey = selected.length === 0 ? (total !== undefined ? ALL : "") : keyOf(selected);
  const [tab, setTab] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  /** After a rename the row is re-keyed (its key IS its path), so focus goes to the
   *  row under its new name, or back to the old one if the caller refused. */
  const refocus = useRef<[string, string] | null>(null);
  useEffect(() => {
    const r = refocus.current;
    if (!r) return;
    refocus.current = null;
    const el = els.current.get(r[1]) ?? els.current.get(r[0]);
    el?.focus();
  });

  // The single tab stop follows selection until the user moves it; it never points
  // at a row that has been collapsed away.
  const stop = rows.some((r) => r.key === tab) ? tab! : rows.some((r) => r.key === selKey) ? selKey : rows[0]?.key;

  const focusRow = (key: string | undefined) => {
    if (!key) return;
    setTab(key);
    els.current.get(key)?.focus();
  };

  const drop = dragActive && onDropOn && onOver;

  return (
    <div
      role="tree"
      aria-label={label}
      className="k-tree"
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onOver?.(null);
      }}
    >
      {rows.map((r, i) => {
        const isAll = r.key === ALL;
        const active = r.key === selKey;
        const landing = Boolean(drop && !isAll && over === r.key);
        const renaming = editing === r.key;
        return (
          <div
            key={r.key}
            ref={(el) => {
              if (el) els.current.set(r.key, el);
              else els.current.delete(r.key);
            }}
            role="treeitem"
            aria-level={r.depth + 1}
            aria-selected={active}
            aria-expanded={r.hasChildren ? r.open : undefined}
            aria-label={`${r.name}, ${r.total}`}
            tabIndex={r.key === stop && !renaming ? 0 : -1}
            className={`k-tree__row${active ? " is-on" : ""}${landing ? " is-drop" : ""}`}
            style={{ paddingLeft: 8 + r.depth * 18 }}
            onFocus={(e) => {
              if (e.target === e.currentTarget) setTab(r.key);
            }}
            onClick={() => onSelect(r.path)}
            onDoubleClick={() => onRename && !isAll && setEditing(r.key)}
            onContextMenu={(e) => {
              if (!onMenu || isAll) return;
              e.preventDefault();
              onMenu(r.path, { x: e.clientX, y: e.clientY });
            }}
            onDragOver={
              drop && !isAll
                ? (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (over !== r.key) onOver(r.key);
                  }
                : undefined
            }
            onDrop={
              drop && !isAll
                ? (e) => {
                    e.preventDefault();
                    onDropOn(r.path);
                  }
                : undefined
            }
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              const to = (j: number) => {
                e.preventDefault();
                focusRow(rows[Math.min(rows.length - 1, Math.max(0, j))]?.key);
              };
              if (e.key === "ArrowDown") to(i + 1);
              else if (e.key === "ArrowUp") to(i - 1);
              else if (e.key === "Home") to(0);
              else if (e.key === "End") to(rows.length - 1);
              else if (e.key === "ArrowRight") {
                e.preventDefault();
                if (r.hasChildren && !r.open) onToggle(r.key);
                else if (r.hasChildren) to(i + 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                if (r.hasChildren && r.open) onToggle(r.key);
                else {
                  for (let j = i - 1; j >= 0; j--) {
                    if (rows[j].depth < r.depth) return to(j);
                  }
                }
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(r.path);
              } else if (e.key === "F2" && onRename && !isAll) {
                e.preventDefault();
                setEditing(r.key);
              } else if ((e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) && onMenu && !isAll) {
                e.preventDefault();
                const b = e.currentTarget.getBoundingClientRect();
                onMenu(r.path, { x: b.left + 24, y: b.bottom });
              }
            }}
          >
            {r.hasChildren ? (
              <span
                aria-hidden
                className={`k-tree__chev${r.open ? " is-open" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(r.key);
                }}
              >
                <Ico name="chev" size={14} />
              </span>
            ) : (
              <span aria-hidden className="k-tree__chev k-tree__chev--none" />
            )}
            {!isAll && (
              <span aria-hidden className="k-tree__ico">
                <Ico name={r.open ? "folder-open" : "folder"} />
              </span>
            )}
            {renaming ? (
              <NameEditor
                initial={r.name}
                siblings={r.siblings}
                onCancel={() => {
                  refocus.current = [r.key, r.key];
                  setEditing(null);
                }}
                onCommit={(name) => {
                  refocus.current = [r.key, keyOf([...r.path.slice(0, -1), name.trim()])];
                  setEditing(null);
                  onRename?.(r.path, name);
                }}
              />
            ) : (
              <>
                <span className="k-tree__nm">{r.name}</span>
                <span className="k-tree__n k-num">{r.total}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Enter commits, Escape abandons, and blur commits: a click elsewhere in a tree
 *  reads as "I am done here", not "discard what I typed". An empty name is the
 *  caller's to refuse. */
function NameEditor({
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
  const done = useRef(false);
  const trimmed = value.trim();
  const merges = trimmed !== initial && siblings.includes(trimmed);
  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };
  return (
    <span className="k-tree__edit" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={value}
        aria-label={`Rename folder ${initial}`}
        aria-describedby={merges ? "k-tree-merge" : undefined}
        className={`k-tree__input${merges ? " is-warn" : ""}`}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(() => onCommit(value))}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            finish(() => onCommit(value));
          } else if (e.key === "Escape") {
            e.preventDefault();
            finish(onCancel);
          }
        }}
      />
      {merges && (
        <span id="k-tree-merge" className="k-tree__merge">
          <Ico name="merge" size={14} />
          merges with {trimmed}
        </span>
      )}
    </span>
  );
}
