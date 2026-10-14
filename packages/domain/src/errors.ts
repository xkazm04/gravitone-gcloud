/**
 * The closed error taxonomy. Callers never need another error class; a new
 * failure is classified into one of these codes.
 */
export type AppErrorCode =
  /** input failed a schema door; forms and CLIs show field-level detail. */
  | "invalid"
  /** the addressed record does not exist; routes answer 404 and pages render notFound. */
  | "not-found"
  /** the write lost a race or violates uniqueness; clients refetch and retry. */
  | "conflict"
  /** the operation is not permitted in the current state (transitions, auth); UI disables the action. */
  | "refused"
  /** a dependency (provider, disk, network) is down; retry-with-backoff loops branch on it. */
  | "unavailable"
  /** a spend or quota limit stops the run; the budget gate and cost UI branch on it. */
  | "budget"
  /** a bug or unclassified failure; the only code that is logged as a defect. */
  | "internal";

export type ErrorOptions2 = { detail?: string; cause?: unknown };

export class AppError extends Error {
  readonly code: AppErrorCode;
  declare readonly detail?: string;

  constructor(code: AppErrorCode, message: string, options?: ErrorOptions2) {
    super(message, options !== undefined && "cause" in options ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    if (options?.detail !== undefined) this.detail = options.detail;
  }
}

export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: AppError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(code: AppErrorCode, message: string, options?: ErrorOptions2): Result<T> {
  return { ok: false, error: new AppError(code, message, options) };
}

export function isOk<T>(r: Result<T>): r is { readonly ok: true; readonly value: T } {
  return r.ok;
}

export type ErrorEnvelope = { error: string; code: AppErrorCode; detail?: string };

export function toEnvelope(e: AppError): ErrorEnvelope {
  const env: ErrorEnvelope = { error: e.message, code: e.code };
  if (e.detail !== undefined) env.detail = e.detail;
  return env;
}

const STATUS: Readonly<Record<AppErrorCode, number>> = {
  invalid: 400,
  "not-found": 404,
  conflict: 409,
  refused: 403,
  unavailable: 503,
  budget: 402,
  internal: 500,
};

export function httpStatus(code: AppErrorCode): number {
  return STATUS[code];
}
