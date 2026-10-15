// Money as the studio writes it (studio.js `fmtUsd`): two decimals under $10 so a cent is
// visible, whole dollars above, `$0` for a priced act that cost nothing. A refund is a
// negative figure (event.ts: the sign is free) and keeps its sign in front of the `$`.
export function usd(n: number): string {
  if (n === 0) return "$0";
  const a = Math.abs(n);
  const body = a < 1 ? a.toFixed(2) : (Math.round(a * 100) / 100).toFixed(a < 10 ? 2 : 0);
  return `${n < 0 ? "-" : ""}$${body}`;
}
