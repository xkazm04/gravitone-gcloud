"use client";

// The state half of lib/pollFreshness.ts: a view calls `ok()` / `fail()` from the
// success and rejection branches of its poll, and renders `freshness`. The clock
// ticks only while the edge is unhealthy, so a healthy view re-renders nothing.

import { useCallback, useEffect, useRef, useState } from "react";

import { pollFreshness, type Freshness } from "@/lib/pollFreshness";

export function usePollFreshness(): { freshness: Freshness; ok: () => void; fail: () => void } {
  const [stamps, setStamps] = useState<{ okAt: number | null; failAt: number | null }>({ okAt: null, failAt: null });
  const [now, setNow] = useState(() => Date.now());
  const okAtRef = useRef<number | null>(null);

  const ok = useCallback(() => {
    const t = Date.now();
    okAtRef.current = t;
    setStamps((s) => (s.okAt === t && s.failAt === null ? s : { okAt: t, failAt: s.failAt }));
  }, []);
  const fail = useCallback(() => {
    const t = Date.now();
    setNow(t); // the clock starts at the failure, so a long-healthy mount cannot inflate the first age
    setStamps((s) => ({ okAt: s.okAt ?? okAtRef.current, failAt: t }));
  }, []);

  const unhealthy = stamps.okAt !== null && stamps.failAt !== null && stamps.failAt > stamps.okAt;
  useEffect(() => {
    if (!unhealthy) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [unhealthy]);

  return { freshness: pollFreshness(stamps.okAt, stamps.failAt, now), ok, fail };
}
