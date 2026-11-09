"use client";

// THE HEADER'S SLOT FOR WORK THAT NEEDS THE OPERATOR - failed and interrupted jobs, counted
// where every screen can see them. Since the bell retired (app/layout.tsx) a failed job was
// visible on Runs only; this is the slot its count is drawn in, beside the spend.
//
// It draws nothing until its read is wired: an absent chip is the honest state of "not known
// here yet", and at zero the chip stays absent (nothing failed is not a fact worth a chip).

export function FailedSlot() {
  return null;
}
