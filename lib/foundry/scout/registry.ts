// THE REGISTRY DIGEST - server only. What the ai-registry says about tonight's work, written
// into each new night as registry.md beside taste.md (spark registry-feedback-loop, 2026-10-22):
// the media-generation techniques whose use_when matches the night's directions, and the
// registry's gaps, one of which steers one search line a night.
//
// STUB (WP-R0): the signature is the contract; WP-R2 fills the body.

export type RegistryDigestOptions = {
  /** The registry checkout; default `AI_REGISTRY_DIR`, else `.ai/manifest.yaml` `registry.local`. */
  readonly registryDir?: string;
  /** The repo whose knowledge/ and .ai/ are read and logged to; default `process.cwd()`. */
  readonly repoDir?: string;
  /** The night's search directions, verbatim; absent, the lines of `knowledge/scout/watchlist.md` under repoDir. */
  readonly directions?: readonly string[];
};

export type RegistryDigest = {
  /** The markdown the night reads: `registry: none` when no registry resolves - never a failure. */
  readonly text: string;
  /** Where the registry resolved, when it did. */
  readonly registryDir?: string;
  /** What was read, for the consults line: bare slugs. */
  readonly subjects: readonly string[];
  readonly techniques: readonly string[];
};

export async function registryDigest(o: RegistryDigestOptions = {}): Promise<RegistryDigest> {
  void o;
  return { text: "# Registry\n\nregistry: none\n", subjects: [], techniques: [] };
}
