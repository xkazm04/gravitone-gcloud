import { describe, expect, it } from "vitest";
import { AppError, err, httpStatus, isOk, ok, toEnvelope, type AppErrorCode } from "../src/errors.ts";

const codes: AppErrorCode[] = ["invalid", "not-found", "conflict", "unauthenticated", "refused", "unavailable", "budget", "internal"];

describe("errors", () => {
  it("ok and err discriminate", () => {
    expect(isOk(ok(1))).toBe(true);
    const r = err("conflict", "taken");
    expect(isOk(r)).toBe(false);
    if (!r.ok) expect(r.error).toBeInstanceOf(AppError);
  });
  it("envelope omits an absent detail (negative control: no detail key)", () => {
    const env = toEnvelope(new AppError("not-found", "no such shot"));
    expect(env).toEqual({ error: "no such shot", code: "not-found" });
    expect("detail" in env).toBe(false);
  });
  it("envelope carries detail when present", () => {
    expect(toEnvelope(new AppError("invalid", "bad", { detail: "door" })).detail).toBe("door");
  });
  it("an error without detail has no detail key", () => {
    expect("detail" in new AppError("internal", "x")).toBe(false);
  });
  it("keeps the cause", () => {
    const cause = new Error("disk");
    expect(new AppError("unavailable", "x", { cause }).cause).toBe(cause);
    expect("cause" in new AppError("unavailable", "x")).toBe(false);
  });
  it("maps every code to a distinct 4xx/5xx status", () => {
    const statuses = codes.map(httpStatus);
    expect(new Set(statuses).size).toBe(codes.length);
    for (const s of statuses) expect(s).toBeGreaterThanOrEqual(400);
  });
  it("no credential is 401 and a credential without permission is 403 - a client signs in again only for the first", () => {
    expect(httpStatus("unauthenticated")).toBe(401);
    expect(httpStatus("refused")).toBe(403);
  });
});
