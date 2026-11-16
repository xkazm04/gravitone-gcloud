// /audio?s=songlab - the song lab's section (spark yue2-song-lab S2, the contest winner "Knockout"). The
// server reads the port - the ledger, or under `source=fixture` the scripted fixture - and hands the
// client island the read and the presses of its side: the live desk's are S1's vote, WP-B's relay
// acts and the draw's booking (./acts.ts, ./book.ts); the fixture's change its script (./fixtureActs.ts).
import { dropLabProposal, keepLabProposal, labSay, voteAb } from "./acts.ts";
import { bookDraw, drawMain } from "./book.ts";
import { fixtureDropAct, fixtureKeepAct, fixtureSayAct, fixtureVoteAct } from "./fixtureActs.ts";
import type { SongLabUrl } from "./_port/port.ts";
import { readSongLab } from "./read.ts";
import { LazySongLab } from "../_audio/Lazy.tsx";

export async function SongLabSection({ url }: { readonly url: SongLabUrl }) {
  const read = await readSongLab(url);
  return (
    <LazySongLab
      read={read}
      url={url}
      acts={
        url.source === "fixture"
          ? { kind: "fixture", vote: fixtureVoteAct, say: fixtureSayAct, keep: fixtureKeepAct, drop: fixtureDropAct }
          : { kind: "live", vote: voteAb, say: labSay, keep: keepLabProposal, drop: dropLabProposal, draw: drawMain, book: bookDraw }
      }
    />
  );
}
