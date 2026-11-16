"use client";

// The body of the studio's not-found (../../not-found.tsx): the Empty shape naming what the address
// asked for (./missing.ts), with the one door back. A Client Component only because the id lives
// in the address, and a not-found file is given no params (Next's not-found.js takes no props).
import { usePathname } from "next/navigation";

import { Empty } from "@gt/ui/components/empty/Empty.tsx";

import p from "./frames.module.css";
import { missing } from "./missing.ts";

export function NotFound() {
  const m = missing(usePathname());
  return (
    <div className={p.whole} data-state="not-found">
      {/* An auto-height box: Empty is 100% tall, and over the whole studio frame its label and
          its door would sit half a screen apart. */}
      <div>
        <Empty label={m.label} action={{ label: m.door.label, glyphAfter: "chevR", href: m.door.href }} />
      </div>
    </div>
  );
}
