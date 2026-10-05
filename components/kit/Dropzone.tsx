"use client";

// A DROP TARGET. A dashed frame with a drawn plate in it and the constraints in a
// line (types, count, size); no sentence tells you to drop. The frame is a
// button (focusable, Enter/Space open the picker) and carries its accessible
// name for anyone who cannot see the dashes. It owns the hidden file input —
// `hidden` is fine because the picker is opened by `.click()` from the frame,
// never by focusing the input; the caller owns the files.

import { useRef, useState } from "react";

export function Dropzone({
  accept,
  constraints,
  label,
  onFiles,
  testId,
}: {
  /** The input's `accept`. */
  accept: string;
  /** "PNG · JPEG · WebP · up to 60 · shrunk to 1280px before upload" */
  constraints: string;
  label: string;
  onFiles: (files: FileList | File[]) => void;
  testId?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        onFiles(e.dataTransfer.files);
      }}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      role="button"
      tabIndex={0}
      data-testid={testId}
      aria-label={label}
      className={`k-drop${dragging ? " k-drop--on" : ""}`}
    >
      <input ref={input} type="file" accept={accept} multiple hidden onChange={(e) => e.target.files && onFiles(e.target.files)} />
      <svg viewBox="-30 -30 60 60" aria-hidden="true">
        <g fill="none" style={{ stroke: "var(--al-gold)" }} strokeWidth="1" strokeLinecap="round">
          <path d="M-22 -22 h8 M-22 -22 v8 M22 -22 h-8 M22 -22 v8 M-22 22 h8 M-22 22 v-8 M22 22 h-8 M22 22 v-8" />
          <circle r="9" strokeDasharray="1.5 2.5" />
          <path d="M0 -4 V4 M-4 0 H4" />
        </g>
      </svg>
      <p>{constraints}</p>
    </div>
  );
}
