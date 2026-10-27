// The route that serves a take's bytes - one spelling for the server readers and the client.
// Pure on purpose: lib/sound/client.ts is bound to the browser (withAccess), so a server reader
// cannot call it; both build on this.

/** The path of a take's file route, id-encoded. */
export const takeFileHref = (id: string): string => `/api/sound/takes/${encodeURIComponent(id)}/file`;
