import "server-only";

// The app's kernel door for pages, Server Actions and route handlers: the process handle
// (lib/kernelProcess.ts, where the binding and its reasons live) behind the server-only mark.
export { blobRootOf, closeKernel, kernel, storeLocation } from "./kernelProcess.ts";
