"use client";

/** A failure surface. Severity is the difference between "this broke" (rose)
 *  and "this is a limit you should know about" (amber) — never the same colour,
 *  because a warning that looks like an error teaches people to ignore both. */
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
    <div className={`rounded-xl border px-4 py-3 ${tone}`} role={severity === "error" ? "alert" : undefined}>
      <p className="font-jetbrains text-[11px] tracking-[0.14em] uppercase">{title}</p>
      {children && <div className="mt-1.5 text-sm leading-relaxed opacity-90">{children}</div>}
    </div>
  );
}
