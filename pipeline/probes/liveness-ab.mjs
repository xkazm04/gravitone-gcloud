// Probe for the liveness-and-heartbeats application (registry, 2026-09-02): the
// falsifier for lib/claudeCli.ts runClaude's single-ceiling supervision. Run:
//   CEILING=3000 POLICIES=A node pipeline/probes/liveness-ab.mjs   (tight ceiling)
//   CEILING=6000 POLICIES=A node pipeline/probes/liveness-ab.mjs   (generous)
//   CEILING=6000 POLICIES=B node pipeline/probes/liveness-ab.mjs   (armed clocks)
// Return condition fires when B's policy is under runClaude and this probe reads
// the same three verdicts from the product function instead of the imitation.
// A/B harness for the liveness-arming amendment. No product code is touched.
// Policy A (the seam as it is: gravity lib/claudeCli.ts:194-208): ONE ceiling
// timer started at spawn; nothing else kills or watches.
// Policy B (the amendment): a startup deadline to first contact, then an
// activity clock armed by the first byte and reset by every byte; the ceiling
// still stands as the sole hard limit.
// Children are node processes with three real shapes seen in the fleet's own
// spawns: hang-before-first-byte, slow-cold-start-then-work, work-then-hang.
import { spawn } from "node:child_process";

const CEILING = Number(process.env.CEILING || 3000);
const STARTUP_DEADLINE = 2500; // B: time to first contact
const ACTIVITY = 1000;         // B: silence allowed after first contact

const CHILDREN = {
  "hang-before-first-byte": `setTimeout(()=>{}, 60000)`,
  "slow-cold-start-then-work": `setTimeout(()=>{let n=0;const t=setInterval(()=>{process.stdout.write("tick\\n");if(++n>=12){clearInterval(t);process.exit(0)}},200)},2200)`,
  "work-then-hang": `let n=0;const t=setInterval(()=>{process.stdout.write("tick\\n");if(++n>=4){clearInterval(t);setTimeout(()=>{},60000)}},200)`,
};

function run(policy, name) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, ["-e", CHILDREN[name]], { stdio: ["ignore", "pipe", "ignore"] });
    let firstByte = null, bytes = 0, verdict = null;
    const end = (v) => { if (verdict) return; verdict = v; try { child.kill(); } catch {} resolve({ policy, name, verdict: v, ms: Date.now() - t0, bytes }); };
    const ceiling = setTimeout(() => end("killed-by-ceiling"), CEILING);
    let startup = null, activity = null;
    if (policy === "B") {
      startup = setTimeout(() => end("killed-startup-deadline"), STARTUP_DEADLINE);
    }
    child.stdout.on("data", (c) => {
      bytes += c.length;
      if (firstByte === null) { firstByte = Date.now() - t0; if (startup) clearTimeout(startup); }
      if (policy === "B") { if (activity) clearTimeout(activity); activity = setTimeout(() => end("killed-stalled"), ACTIVITY); }
    });
    child.on("close", (code) => { clearTimeout(ceiling); if (startup) clearTimeout(startup); if (activity) clearTimeout(activity); end(code === 0 ? "completed" : "exited-" + code); });
  });
}

const rows = [];
for (const name of Object.keys(CHILDREN)) for (const policy of (process.env.POLICIES||"A,B").split(",")) rows.push(await run(policy, name));
console.log("case".padEnd(28), "policy", "verdict".padEnd(24), "ms", "bytes");
for (const r of rows) console.log(r.name.padEnd(28), r.policy.padEnd(6), r.verdict.padEnd(24), String(r.ms).padStart(5), r.bytes);
const falseKills = rows.filter(r => r.name === "slow-cold-start-then-work" && r.verdict !== "completed");
console.log("\nfalse kills of a working child: A=" + falseKills.filter(r=>r.policy==="A").length + " B=" + falseKills.filter(r=>r.policy==="B").length);
