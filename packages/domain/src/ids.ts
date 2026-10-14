import { z } from "zod";

/**
 * Branded ids. Convention: an id is minted ONLY at a schema door, through the
 * `.brand()` of `idSchema`. A branded id is assignable to `string` (it can be
 * logged, keyed, compared) but a plain `string` is never assignable to it, so
 * two kinds of id cannot be swapped by accident.
 */
export type Brand<T, B extends string> = T & z.$brand<B>;

/** Schema that accepts a non-empty string and mints it as the branded id `B`. */
export function idSchema<const B extends string>(brand: B) {
  void brand;
  return z.string().min(1).brand<B>();
}
