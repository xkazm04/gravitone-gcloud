// Money as the studio writes it (studio.js `fmtUsd`): two decimals under $10 so a cent is
// visible, whole dollars above, `$0` for a priced act that cost nothing. A refund is a
// negative figure (event.ts: the sign is free) and keeps its sign in front of the `$`.
// The figure is rounded to the cent FIRST and its spelling chosen from that, so one amount
// has one spelling: $9.999 is `$10` like $10 (not `$10.00`), and a sub-cent figure is `$0`
// (not `$0.00`, nor `-$0.00` for a sub-cent refund) - the Ledger's toolbar rounds its total
// to the cent before calling this, and its spoken name does not.
export function usd(n: number): string {
  const c = Math.round(Math.abs(n) * 100) / 100;
  if (c === 0) return "$0";
  return `${n < 0 ? "-" : ""}$${c.toFixed(c < 10 ? 2 : 0)}`;
}
