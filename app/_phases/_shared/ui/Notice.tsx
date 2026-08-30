"use client";

/** A failure surface. Severity is the difference between "this broke" (rose)
 *  and "this is a limit you should know about" (amber) — never the same colour,
 *  because a warning that looks like an error teaches people to ignore both.
 *
 *  AND NEVER THE SAME SILENCE. Only `error` used to carry a role, so `warning`
 *  and `info` were announced to nobody — and those are precisely the two that
 *  appear IN RESPONSE TO AN ACTION rather than on load: "no tension found" when
 *  a run lands, "N turns cannot be argued" when a card is descoped, "N cards out
 *  of scope". A sighted reader watches amber appear; a screen-reader user got
 *  nothing at all. The argument this file already makes about colour is an
 *  argument about the accessibility tree too.
 *
 *  `alert` for an error (assertive — it interrupts), `status` for the other two
 *  (polite — it waits for a pause). Not `alert` for all three: a polite region
 *  is what a consequence report wants, and three assertive interrupts on one
 *  board is the same "teaches people to ignore both" failure in another channel. */
export default function Notice({
  severity = "error",
  title,
  children,
}: {
  severity?: "error" | "warning" | "info";
  title: string;
  children?: React.ReactNode;
}) {
  const tone =
    severity === "error"
      ? "border-rose-400/30 bg-rose-400/[0.06] text-rose-200"
      : severity === "warning"
        ? "border-amber-400/25 bg-amber-400/[0.05] text-amber-200"
        : "border-cyan-400/25 bg-cyan-400/[0.05] text-cyan-200";
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`} role={severity === "error" ? "alert" : "status"}>
      <p className="font-jetbrains text-content tracking-[0.14em] uppercase">{title}</p>
      {children && <div className="mt-1.5 text-content leading-relaxed opacity-90">{children}</div>}
    </div>
  );
}
