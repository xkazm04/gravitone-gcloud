// Runs' live feed is the studio's shared one (../../../_shell/liveFeed.ts, lifted there when the
// Floor became its second reader). This re-export exists only because Runs.tsx is outside the
// Floor lot's write set; Runs.tsx importing the shell's module directly retires it.
export { BACKSTOP_MS, COALESCE_MS, openFeed, type Feed } from "../../../_shell/liveFeed.ts";
