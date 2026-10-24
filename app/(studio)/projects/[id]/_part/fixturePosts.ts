import "server-only";

import { createHash } from "node:crypto";

import { explainerSectionsOf, titleOf } from "@/lib/articles/sections";
import type { AdoptSource, AdoptableView } from "@gt/domain/partView";

import type { AdoptPost, ArticleInputs } from "./fixtureExplainer.ts";

// THE FIXTURE SIDE'S ADOPTABLE POSTS - two stand-ins for what lib/articles/adoptable.ts reads on the
// real side (a final article run, a registry publication). Cut by the SAME cutter the real side cuts
// with (lib/articles/sections.ts), so the fixture's sections are what an adopt of that markdown would
// land: an Opening, the `## ` headings outside a fence, no Sources. They are written for the fixture,
// never a real post borrowed.

const RUN_MD = `# Routing a request between providers

A request that one provider refuses can often be served by another, at another price.

## What a route is

A route names the provider, the model and the price a request is sent at.

## When a provider refuses

A refusal is a status and a sentence; the router reads both before it tries the next provider.

\`\`\`md
## not a heading - a snippet inside a fence
\`\`\`

## What it costs

Every hop is priced before it runs, and the receipt names the provider that served it.

## Sources

1. A stand-in source.
`;

const PUBLICATION_MD = `# A meter calibrated in one language

The same sentence costs a different number of tokens in each language a tokenizer reads.

## One sentence, six bills

Each translation of the sentence is counted on the same tokenizer, and the counts differ.

## Where the difference is paid

The difference is paid at the invoice, at the context window and at the cache.

## Sources

1. A stand-in source.
`;

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const words = (s: string): number => s.split(/\s+/).filter((x) => x !== "").length;

function standIn(source: AdoptSource, id: string, markdown: string, status: string): { readonly view: AdoptableView; readonly post: AdoptPost } {
  const sections = explainerSectionsOf(markdown);
  const title = titleOf(markdown) ?? id;
  return {
    view: { source, id, title, status, sections: sections.length, words: sections.reduce((n, s) => n + words(s.body), 0) },
    post: { source, id, title, sha: sha256(markdown), sections },
  };
}

const POSTS = [standIn("run", "2026-10-01-provider-routing", RUN_MD, "landed"), standIn("publication", "a-meter-calibrated-in-one-language", PUBLICATION_MD, "approved")];

export const FIXTURE_ARTICLE: ArticleInputs = {
  adoptable: POSTS.map((p) => p.view),
  post: (source, id) => POSTS.find((p) => p.post.source === source && p.post.id === id)?.post,
};
