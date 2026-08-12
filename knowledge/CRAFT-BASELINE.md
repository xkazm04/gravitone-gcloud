# Craft baseline — how narrative content actually holds attention

Cross-template, cross-step. This is the theory layer every `PATTERNS.md` builds on, so the per-step
docs can talk about *this* format instead of re-deriving storytelling from scratch.

None of this is our invention. It is the established craft consensus, and the reason it is written
down here is that **a generator with facts and no narrative engine produces something unwatchable.**
That failure has a name in this repo: the *wiki timeline* — correct information, correctly ordered,
that nobody can sit through. Everything below exists to prevent it.

---

## 1. The one law: BUT / THEREFORE, never AND THEN

The single most useful test in narrative construction, from Trey Parker and Matt Stone's 2011 NYU
lecture. Lay out your beats. Between any two adjacent beats, you must be able to say **"but"** or
**"therefore"**. If the only honest connector is **"and then"**, the beats have no causal
relationship, and what you have is a list.

```
BAD   Bitcoin was created in 2008.  AND THEN  it uses a blockchain.
      AND THEN  miners validate transactions.  AND THEN  the supply is capped at 21 million.

GOOD  Digital money had one unsolvable problem: you could copy it.
      THEREFORE  every attempt needed a bank to keep the ledger.
      BUT  a bank is exactly what you're trying to avoid.
      THEREFORE  Bitcoin's real invention isn't the currency — it's a way to agree on a
                 ledger with no one in charge.
```

Both versions contain the same facts. Only the second has a reason to keep watching. **This is the
test a generated script must pass before anything else is judged.**

Two clarifications that matter in practice:

- *Therefore* = consequence. *But* = complication or reversal. A chain of pure "therefore" is a
  lecture that never surprises; a chain of pure "but" is exhausting. Real scripts alternate.
- The connector does not have to appear in the prose. It has to be **true** of the beat relationship.
  Economics Explained opens only 5% of sentences with "But" — yet every act boundary is a reversal.

---

## 2. Curiosity is a gap, and gaps must be opened deliberately

George Loewenstein's information-gap theory (1994): curiosity is not a general appetite for facts, it
is the specific discomfort of an *identified hole* in what you know. You do not become curious about
a subject; you become curious about a **question you now realise you cannot answer**.

Consequences for a script:

- **A fact does not create curiosity. A question does.** Opening with "Bitcoin is a decentralised
  digital currency" opens no gap — it closes one. Opening with "why would anyone trust money that
  nobody is in charge of?" opens one.
- Gaps work best when they are **specific, and feel answerable**. "What is the meaning of money?" is
  too big to feel reachable. "Why is the supply capped at exactly 21 million?" is a gap a viewer will
  stay for.
- A gap you open is a **debt**. Every one must be paid, explicitly, or the viewer feels cheated even
  if they can't say why.

## 3. Nested loops — the viewer must always know where they are

The retention architecture that follows from §2: **one large loop opened by the hook** (the video's
promise), **one medium loop per act**, **micro-loops inside scenes**. Loops close in reverse order of
opening, and the big one closes last.

Kurzgesagt describe the same thing as a design goal from the other direction: *viewers always know
where they are in the explanation.* Disorientation is the quiet killer — not boredom, confusion.
Explicit navigation ("that is the theory — but in practice…", "which brings us to our third
question") costs two seconds and buys the entire next act.

## 4. Anecdote and reflection alternate

Ira Glass's two building blocks:

- **The anecdote** — a sequence of actions, each raising a question that pulls to the next. It has
  momentum but no meaning.
- **The moment of reflection** — "here is why I'm telling you this." It has meaning but no momentum.

Neither works alone. A script that is all anecdote is a story with no point; all reflection is an
essay nobody finishes. **Good work flips between them continuously** — a stretch of movement, then a
line that says what it meant, then movement again.

In explainer work the anecdote is often *the mechanism doing something* and the reflection is *what
that implies*. Watch for a script that explains for three minutes without once saying why it matters.

## 5. SCQA — the shape of the opening

Barbara Minto's Pyramid Principle gives the most reliable opening structure for explanatory work:

| | Purpose |
|---|---|
| **Situation** | Something the audience already accepts. Common ground, stated fast. |
| **Complication** | What breaks, changes, or fails to add up. This is where tension enters. |
| **Question** | The gap the complication creates, made explicit. |
| **Answer** | Your thesis — stated up front, then earned for the rest of the runtime. |

The important move: **the answer comes early, not at the end.** Explanatory content is not a mystery
novel. Telling the viewer your conclusion in the first minute does not spoil anything, because the
tension is not *what* but *why* and *how*.

## 6. Concrete beats abstract

From the Heath brothers' *Made to Stick* and every writing tradition before it: the mind holds
images, not categories. "Pallets of cash shipped across the Pacific" is remembered; "international
settlement mechanisms" is not. When a script must name an abstraction, it should immediately give it
a physical body.

Corollary — **the curse of knowledge**: once you understand something, you can no longer feel what it
is like not to. This is the single most common defect in expert-written explainers, and it is exactly
the failure mode of a model that "knows" the topic. The defence is mechanical: for each beat, name
what the viewer must already believe for it to land. If that thing hasn't been established, the beat
is out of order.

## 7. Numbers mean nothing until they are converted

A large number is an abstraction. It becomes information only when scaled against something the
viewer can feel: *"an economy smaller than Vermont's"*, *"less than what Woolworths turns over in the
same period"*, *"barely 3% of what the average South Korean earns"*.

Rule of thumb: **a number that is not compared is a number that is forgotten.** If a script cites a
figure and moves on, the figure did no work.

## 8. The ending re-describes; it does not summarise

A recap tells the viewer what they just heard, which they know. A **reframe** hands them a new
sentence for something they now understand — ideally one they could repeat to somebody else. That
repeatable sentence is the actual product; it is what gets the video shared and what makes the
explanation stick after the tab is closed.

---

## Sources

Framework references (2026-08-11):

- [Parker & Stone's but/therefore rule](https://thescriptlab.com/features/screenwriting-101/13636-how-south-park-creators-plot-better-scripts/) · [David Perell's write-up](https://perell.com/note/but-therefore-rule/)
- [Loewenstein's information-gap theory of curiosity](https://psychologyfanatic.com/information-gap-theory/) · [CMU paper](https://www.cmu.edu/dietrich/sds/docs/golman/Information-Gap%20Theory%202016.pdf)
- [Ira Glass on the anecdote and the moment of reflection](https://www.storycenter.org/storycenter-blog/blog/2013/7/1/ira-glass-on-storytelling)
- [Minto Pyramid & SCQA](https://modelthinkers.com/mental-model/minto-pyramid-scqa)
- [Nested open loops and retention architecture](https://www.overseeros.com/blog/youtube-retention-loops) · [hook frameworks](https://www.overseeros.com/blog/youtube-hook-framework-7-openings-that-keep-viewers-watching)
- [Kurzgesagt on their scripting process](https://10.studio/the-incredible-amount-of-work-behind-kurzgesagts-beautiful-animated-videos/) — a dozen drafts per script; "viewers always know where they are"

Retention percentages quoted by content-marketing sources are **vendor claims, not peer-reviewed
findings** — treated here as directional, never cited as measurement.
