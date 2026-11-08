"use client";

// THE COVER DESK, LOADED WHEN ITS TAB IS OPEN. The desk carries Framer Motion (about 47 KB gzipped on /audio's first
// load, measured 2026-11-08), and six of the desk's seven neighbours never animate: this keeps that weight on the tab
// that uses it.
import dynamic from "next/dynamic";

export const CoverDesk = dynamic(() => import("./Cover.tsx").then((m) => m.CoverDesk));
