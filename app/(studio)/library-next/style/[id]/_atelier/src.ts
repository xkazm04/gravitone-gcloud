import type { BlobRef } from "@gt/domain/blob";

/** A blob by its address (app/api/blob/[sha]); the ref carries the type the route serves it as. */
export const srcOf = (ref: BlobRef): string => `/api/blob/${ref.sha256}?type=${encodeURIComponent(ref.mime)}`;
