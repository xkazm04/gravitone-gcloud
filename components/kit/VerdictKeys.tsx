"use client";

// THE VERDICT CONTROLS. K keeps (Aldebaran), X rejects (ash), U clears. One part
// at three sizes:
//
//   tile   two square keys on a candidate, shown on hover / focus / when decided
//   row    "row K" / "row X" beside a matrix row: one decision for a whole style
//   card   K, X and (once decided) U on a work entry
//
// The keys are IDEMPOTENT unless `toggle` is set: Keep on a kept thing keeps it.
// `toggle` is for a surface whose old control cleared on a second press.
// `keepWord` is what K does on this surface ("Keep", "Approve"): it is the
// accessible name, so a screen reader hears the verb and not a letter.

import type { MouseEvent } from "react";

export type VerdictValue = "keep" | "reject";

export function VerdictKeys({
  value,
  onVerdict,
  variant = "card",
  keepWord = "Keep",
  subject,
  clear = false,
  toggle = false,
}: {
  value: VerdictValue | null | undefined;
  /** `null` clears. */
  onVerdict: (v: VerdictValue | null) => void;
  variant?: "tile" | "row" | "card";
  keepWord?: string;
  /** What the verdict is about, for the accessible name: "the whole Blueprint row". */
  subject?: string;
  /** Offer U once something is decided. */
  clear?: boolean;
  toggle?: boolean;
}) {
  const tag = variant === "row" ? "row " : "";
  const of = subject ? ` ${subject}` : "";
  const press = (v: VerdictValue) => (e: MouseEvent) => {
    e.stopPropagation();
    onVerdict(toggle && value === v ? null : v);
  };
  return (
    <span className={variant === "row" ? "k-rowk" : "k-vks"}>
      <button
        type="button"
        className={`k-vk k-vk--k k-vk--${variant}`}
        aria-pressed={value === "keep"}
        aria-label={`${keepWord}${of}${variant === "row" ? "" : " (K)"}`}
        onClick={press("keep")}
      >
        {tag}K
      </button>
      <button
        type="button"
        className={`k-vk k-vk--x k-vk--${variant}`}
        aria-pressed={value === "reject"}
        aria-label={`Reject${of}${variant === "row" ? "" : " (X)"}`}
        onClick={press("reject")}
      >
        {tag}X
      </button>
      {clear && value && (
        <button
          type="button"
          className={`k-vk k-vk--u k-vk--${variant}`}
          aria-label={`Clear${of} (U)`}
          onClick={(e) => {
            e.stopPropagation();
            onVerdict(null);
          }}
        >
          U
        </button>
      )}
    </span>
  );
}
