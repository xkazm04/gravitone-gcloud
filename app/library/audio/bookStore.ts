"use client";

// THE TEAM'S HAND AND THE DRAFTS SENT OUT — the two parts of the recipe book
// that belong to no single take, so they cannot ride on an Asset's meta the
// way a verdict does (lib/assets#updateAssetMeta).
//
//   hands   per term: prefer / avoid, and the phrasing the term becomes in a
//           prompt. The term's EVIDENCE is never stored (./book.ts#vocabulary).
//   drafts  every prompt copied for Suno or ElevenLabs, newest first, so a
//           returned file can be attached to the draft that asked for it.
//
// One localStorage key per account, `gravitone.audio-book.${uid}`. It is on
// lib/identityEviction.ts#userScopedLocalKeys, and the identity probe holds
// this file to that list: one account's vocabulary is its own work and does
// not survive into the next account on a shared machine.

import { useMemo, useSyncExternalStore } from "react";

import type { Draft, Hand } from "./book";

export interface Book {
  hands: Record<string, Hand>;
  drafts: Draft[];
}

const bookKey = (uid: string) => `gravitone.audio-book.${uid}`;

export const emptyBook = (): Book => ({ hands: {}, drafts: [] });

export function loadBook(uid: string): Book {
  try {
    const raw = localStorage.getItem(bookKey(uid));
    if (!raw) return emptyBook();
    const v = JSON.parse(raw) as Partial<Book>;
    return {
      hands: v.hands && typeof v.hands === "object" ? v.hands : {},
      drafts: Array.isArray(v.drafts) ? v.drafts : [],
    };
  } catch {
    return emptyBook();
  }
}

/** Write the book. Returns null on success, or the sentence the page shows
 *  when the browser refused — the write is then held in memory only. */
export function saveBook(uid: string, book: Book): string | null {
  try {
    localStorage.setItem(bookKey(uid), JSON.stringify(book));
    return null;
  } catch {
    return "This browser's storage is full; the last term or draft is held in memory only and a reload would lose it.";
  }
}

/** One account's book as an external store: the page reads it through
 *  useSyncExternalStore, and every write is saved before subscribers hear of
 *  it, so what is drawn is what is on disk (or the sentence saying it is not). */
export class BookStore {
  private state: { book: Book; error: string | null };
  private subs = new Set<() => void>();
  private readonly uid: string;

  constructor(uid: string) {
    this.uid = uid;
    this.state = { book: loadBook(uid), error: null };
  }

  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  };

  getSnapshot = () => this.state;

  update(fn: (b: Book) => Book) {
    const book = fn(this.state.book);
    this.state = { book, error: saveBook(this.uid, book) };
    this.subs.forEach((s) => s());
  }
}

const NO_BOOK = { book: emptyBook(), error: null };
const noop = () => () => {};

export function useBook(uid: string | undefined) {
  const store = useMemo(() => (uid ? new BookStore(uid) : null), [uid]);
  const snap = useSyncExternalStore(
    store ? store.subscribe : noop,
    () => (store ? store.getSnapshot() : NO_BOOK),
    () => NO_BOOK,
  );
  return {
    book: snap.book,
    error: snap.error,
    update: (fn: (b: Book) => Book) => store?.update(fn),
  };
}
