"use client";

// The left rail — folders, derived from the assets that claim them.
//
// Every row shows a TOTAL rather than a direct count, because selecting a
// parent shows its whole subtree: the number and the click have to agree, or
// "presets · 30" that opens onto an empty room is just a lie with a tooltip.

import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";

import { pathKey, type FolderNode } from "@/lib/assets";

export default function FolderTree({
  nodes,
  selected,
  expanded,
  onSelect,
  onToggle,
  total,
}: {
  nodes: FolderNode[];
  selected: string[];
  expanded: Set<string>;
  onSelect: (path: string[]) => void;
  onToggle: (key: string) => void;
  total: number;
}) {
  return (
    <nav className="space-y-0.5" aria-label="Asset folders">
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
        />
      ))}
    </nav>
  );
}

function Branch({
  node,
  depth,
  selected,
  expanded,
  onSelect,
  onToggle,
}: {
  node: FolderNode;
  depth: number;
  selected: string[];
  expanded: Set<string>;
  onSelect: (path: string[]) => void;
  onToggle: (key: string) => void;
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
}: {
  label: string;
  count: number;
  depth: number;
  active: boolean;
  open?: boolean;
  hasChildren?: boolean;
  onToggle?: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-1 rounded-lg pr-2 transition ${
        active ? "bg-cyan-400/10 text-cyan-200" : "text-white/60 hover:bg-white/5 hover:text-white/85"
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
