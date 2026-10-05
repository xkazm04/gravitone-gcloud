"use client";

// THE PRICE, BEFORE THE CLICK — for any lab button that bills the provider
// (a batch in triage, a render in hunt). The figure comes from the one
// declaration the server bills against (lib/musicClient.ts#perSecondPrice ->
// /api/music/pricing) and is worded by lib/musicClient.ts#costLabel, which
// keeps "unpriced" and "price unknown" apart and never prints $0.00. Carried
// over from the round-3 lab (its useLab.ts#cost and parts.tsx#SpendButton, both
// retired in round 4).

import { useCallback, useEffect, useState } from "react";

import { Coins } from "lucide-react";

import { costLabel, perSecondPrice } from "@/lib/musicClient";
import type { MusicQuote } from "@/lib/music/pricing";

import { BTN_CYAN } from "./ui";

/** `cost(seconds)` → `{ text, title }` per lib/musicClient.ts#costLabel. */
export function useMusicPrice() {
  const [price, setPrice] = useState<MusicQuote | "unknown" | null>(null);
  useEffect(() => {
    perSecondPrice().then(
      (q) => setPrice(q),
      () => setPrice("unknown"),
    );
  }, []);
  return useCallback((seconds: number) => costLabel(price, Math.round(seconds)), [price]);
}

/** A button that spends, with the coin on it and the price under the label. */
export function SpendButton({
  cost,
  children,
  onClick,
  busy,
  disabled,
  wide,
}: {
  cost: { text: string; title: string };
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <span className={`inline-flex flex-col gap-1 ${wide ? "w-full" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        className={`${BTN_CYAN} ${wide ? "w-full py-2" : ""} ${busy ? "animate-pulse" : ""}`}
      >
        <Coins className="h-4 w-4 opacity-80" aria-label="spends credits" />
        {children}
      </button>
      <span className="pl-1 font-jetbrains text-label text-white/35">{cost.text}</span>
    </span>
  );
}
