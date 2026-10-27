import { errorMessage } from "@gt/domain/errors";

// A Server Action answers with an envelope (`ok` / `error`) for everything the server decided;
// what REJECTS is the transport - the network gone, the server down before it could answer. Left
// as a bare `.then` chain, that rejection reached nobody: the press read as nothing happened and
// the console held an unhandled rejection. `settled` is the one place the rejection is caught, so
// every call site says it in the same words and clears whatever it armed.

/** Run `call`; hand its answer to `onAnswer`, or a rejection's message to `onReject`; then `end`. */
export async function settled<R>(call: () => Promise<R>, onAnswer: (answer: R) => void, onReject: (message: string) => void, end?: () => void): Promise<void> {
  try {
    onAnswer(await call());
  } catch (e) {
    onReject(errorMessage(e));
  } finally {
    end?.();
  }
}
