"use client";

// A REJECTION AND ITS REASON. The reason is required — a rejected take with no
// reason teaches the vocabulary nothing — so an empty commit shakes the box and
// says so rather than going through (app.js#doReject). The reasons already in
// use are one press each.

import { useState } from "react";

export default function RejectBox({
  label,
  reasons,
  showCounts = false,
  cancellable = false,
  onCommit,
  onCancel,
}: {
  /** The input's accessible name. */
  label: string;
  reasons: [string, number][];
  showCounts?: boolean;
  /** Draw the Esc button (the ledger's inline row; the inspector's box closes by Esc alone). */
  cancellable?: boolean;
  onCommit: (reason: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const [missing, setMissing] = useState(0);
  const commit = (reason: string) => {
    if (!reason.trim()) {
      setMissing((n) => n + 1);
      return;
    }
    onCommit(reason.trim());
  };
  return (
    // `key` on the shaking box restarts the animation on every empty commit.
    <div className={`rejbox${missing ? " shake" : ""}`} key={missing}>
      <input
        type="text"
        // The box opens because somebody asked to reject: the reason is the
        // next thing they type, as in the entry (rejInput.focus()).
        autoFocus
        placeholder="Why rejected?"
        aria-label={label}
        aria-required="true"
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <button type="button" className="btn btn--rej" onClick={() => commit(value)}>
        Reject <kbd>↵</kbd>
      </button>
      {cancellable && (
        <button type="button" className="btn" onClick={onCancel}>
          Esc
        </button>
      )}
      {missing > 0 && (
        <span className="req" role="alert">
          reason required
        </span>
      )}
      <span className="break" />
      {reasons.map(([r, n]) => (
        <button key={r} type="button" className="chip" onClick={() => onCommit(r)}>
          {r} {showCounts && <span className="dim">{n}</span>}
        </button>
      ))}
    </div>
  );
}
