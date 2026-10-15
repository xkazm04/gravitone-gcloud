// The style contract's measuring hooks (Contract.tsx): the wrapper the checker reads, the
// frame that holds a column-bound part at its page's width, and the header nav drawn once per
// page. Kept apart from the specimens so each file stays a size a reader can hold.

import type { ReactNode } from "react";

import { cx } from "@gt/ui/components/cx.ts";
import { vars } from "@gt/ui/components/vars.ts";

import shell from "../_shell/Shell.module.css";
import k from "./kit.module.css";

// Each column's width in px, measured on the prototype page at the 1440x900 capture: the
// element the role's winner selector names (roles.<page>.json), or the column holding it.
export const FRAME = {
  pileBar: 126, // Floor: [data-component=Pile] .stackbar
  calendarError: 157, // Floor: the calendar rail's .err (a slot row's width)
  floorColumn: 457, // Floor: .colhead.c-foundry (--cols minmax(0,1.32fr))
  reviewSide: 139, // Board review: the cut desk's .side-h
  planList: 274, // Plan: .panel.plist (projects.css clamp(250px,19vw,300px))
  planSummary: 302, // Plan: the .psum column's content box (.side-h, .btn.cyan)
  planMain: 803, // Plan: .h4 in the plan's main column
  libraryNav: 245, // Library: .panel.lnav (--nav-w)
  libraryRow: 222, // Library: .frow
  librarySearch: 392, // Library: .lsearch in the results toolbar
  ledgerFacets: 228, // Ledger: .panel.lg-facets (--fac-w)
  ledgerRow: 211, // Ledger: .fr
  ledgerSearch: 302, // Ledger: .lg-top .search (clamp(220px,21vw,400px))
  ledgerDetail: 312, // Ledger: the event detail's .h4
  ledgerTime: 203, // Ledger: .ts-side .side-h
} as const;

export const inert = (): void => undefined;

/** A measured instance: the checker reads `[data-role=...] > *`. `type="ui"` sets the row
    type the page drew it in (14px), for parts that inherit a line height they cannot show. */
export function Hook({ role, type, children }: { readonly role: string; readonly type?: "ui"; readonly children: ReactNode }) {
  return (
    <span data-role={role} className={cx(k.hook, type === "ui" && k.ui)}>
      {children}
    </span>
  );
}

/** A measured instance at its page's column width. */
export function Frame({ role, width, children }: { readonly role: string; readonly width: number; readonly children: ReactNode }) {
  return (
    <div data-role={role} className={k.frame} style={vars({ "--frame": `${width}px` })}>
      {children}
    </div>
  );
}

// shell.js NAV, in order. A row per page, each with that page's section current - the
// header is the same on every page, so each page measures its own current item.
const NAV = [
  { id: "floor", label: "Floor" },
  { id: "board", label: "Board", count: 14 },
  { id: "sep-1" },
  { id: "projects", label: "Projects" },
  { id: "runs", label: "Runs" },
  { id: "sep-2" },
  { id: "library", label: "Library" },
  { id: "calendar", label: "Calendar" },
  { id: "ledger", label: "Ledger" },
] as const;
// The rest-state item each page measures (Library everywhere but the Library page).
const REST: Readonly<Record<string, string>> = { floor: "library", library: "ledger" };

export function NavRow({ current }: { readonly current: string }) {
  return (
    <div className={shell.nav}>
      {NAV.map((n) => {
        if (!("label" in n)) return <span key={n.id} className={shell.sep} />;
        const here = n.id === current;
        const rest = REST[current] === n.id;
        return (
          <a key={n.id} aria-current={here ? "page" : undefined} data-role={here ? `nav-current@${current}` : rest ? `nav-rest@${n.id}` : undefined}>
            {n.label}
            {"count" in n && <span className={shell.n}>{n.count}</span>}
          </a>
        );
      })}
    </div>
  );
}
