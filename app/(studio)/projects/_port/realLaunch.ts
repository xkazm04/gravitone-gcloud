import "server-only";

// The Floor run's lane doors moved to lib/produce/laneDoors.ts (spark athena-control-mcp) so the Board's
// spend packet (lib/decision/v1/sources/spendLive.ts) launches through the same door the Floor does.
export { LANE_DOORS, mintSuffix, type LaneDoor, type LaunchContext } from "../../../../lib/produce/laneDoors.ts";
