"use client";

// SIGN-OUT, AS A DECISION RATHER THAN A CLICK (AUP-B stage 2).
//
// IndexedDB is the only copy of an account's work — Firebase is identity only
// (lib/firebase.ts) — and a deliberate sign-out runs `evictIdentity(uid,
// "signed-out")`, which deletes every project, step, style, asset and uploaded
// picture the account holds. Until this dialog that was one click in the
// account menu with no confirm. Now the click opens this, and the dialog:
//
//   1. runs the SAME eviction as a dry run (`{dryRun: true}` — same reads, one
//      readonly transaction, nothing deleted) and draws its per-store counts;
//   2. builds the `.gravitone` archive (lib/studioArchive#exportAccount) while
//      the person reads, so the size is on the button and the save is instant.
//      The file goes to the person's own disk through an anchor download and
//      nowhere else — the archive holds unpublished research, and nothing about
//      it is uploaded;
//   3. is the ONE caller of `signOut` in the account UI. The destructive confirm
//      carries its consequence in one line (archiveSummary#consequenceLine), the
//      narration law's standing exemption for a destructive confirm.
//
// What it deliberately does NOT change: an involuntary session end (another
// tab, a revocation) still evicts through useAuth's listener exactly as before.
// Lock-instead-of-wipe was put to the operator and not approved (2026-10-06).
//
// Which action is live when is decided in components/ui/archiveSummary.ts, as
// pure functions the probe lane holds (signout-dialog.probe).

import { useId, useRef, useState } from "react";

import { useLoadFor } from "@/app/_phases/_shared/useLoadFor";
import { useAnnounce } from "@/lib/announcer";
import { evictIdentity, type EvictionReport } from "@/lib/identityEviction";
import { exportAccount } from "@/lib/studioArchive";
import { useAuth } from "@/lib/useAuth";

import Modal from "./Modal";
import { Button } from "./Primitives";
import { Ghost, Tally } from "./signal";
import {
  archiveFileName,
  errorText,
  signOutPlan,
  wantsArchive,
  wipeTallies,
  type ArchivePrep,
} from "./archiveSummary";

/** Build an account's archive as one Blob. */
export async function buildArchive(uid: string): Promise<Blob> {
  return new Response(exportAccount(uid)).blob();
}

/** Hand a built archive to the browser's own download — the person's act, the
 *  person's disk. */
export function saveArchive(file: Blob, now: Date = new Date()): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = archiveFileName(now);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next task, not synchronously: a click starts the download
  // asynchronously and a URL revoked under it can cancel it in some engines.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

type Props = {
  open: boolean;
  onClose: () => void;
  uid: string;
  email?: string | null;
};

/** Mounted fresh per opening (and per account), so every opening starts from a
 *  new count and a new archive with no state carried over from the last. */
export default function SignOutDialog(props: Props) {
  if (!props.open || !props.uid) return null;
  return <OpenSignOut key={props.uid} {...props} />;
}

type Built = { blob: Blob } | { error: string } | null;

function OpenSignOut({ open, onClose, uid, email }: Props) {
  const { signOut } = useAuth();
  const announce = useAnnounce();
  const [report, setReport] = useState<EvictionReport | null>(null);
  const [built, setBuilt] = useState<ArchivePrep | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const file = useRef<Blob | null>(null);
  const consequenceId = useId();

  // 1 · the count: the real eviction's reads, nothing deleted.
  useLoadFor(
    uid,
    (u) => evictIdentity(u, "signed-out", { dryRun: true }),
    (r) => setReport(r),
  );

  // 2 · the archive, once the count says there is work at stake. Keyed "" until
  // then, which loads nothing and hydrates nothing.
  const archiveKey = wantsArchive(report) ? uid : "";
  useLoadFor<Built>(
    archiveKey,
    (k) =>
      k
        ? buildArchive(k).then(
            (blob) => ({ blob }),
            (e: unknown) => ({ error: errorText(e) }),
          )
        : Promise.resolve(null),
    (v) => {
      if (!v) return false;
      if ("blob" in v) {
        file.current = v.blob;
        setBuilt({ state: "ready", bytes: v.blob.size });
      } else {
        setBuilt({ state: "failed", error: v.error });
        announce({ key: `signout-archive-failed:${uid}:${Date.now()}`, text: v.error });
      }
    },
  );
  const prep: ArchivePrep = built ?? (archiveKey ? { state: "preparing" } : { state: "idle" });

  const plan = signOutPlan({ report, prep, busy, saved });

  const download = () => {
    if (!file.current) return;
    saveArchive(file.current);
    setSaved(true);
  };

  const erase = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await signOut();
      onClose();
    } catch (e) {
      // signOut evicts in its `finally` whatever Firebase answered, so a
      // failure here is the remote half; its own words are the finding.
      const text = errorText(e);
      setFailure(text);
      announce({ key: `signout-failed:${uid}:${Date.now()}`, text });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Sign out"
      subtitle={email ?? undefined}
      className="max-w-md"
      footer={
        <div className="grid gap-3">
          {plan.consequence && (
            <p id={consequenceId} className="font-hanken text-content leading-snug text-rose-200">
              {plan.consequence}
            </p>
          )}
          {failure && (
            <p className="font-hanken text-content text-rose-200">
              {failure}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {plan.download.shown && (
              <Button
                variant="primary"
                className="cursor-pointer px-5 py-2 disabled:cursor-not-allowed"
                disabled={!plan.download.enabled}
                aria-busy={prep.state === "preparing"}
                onClick={download}
                data-testid="signout-download"
              >
                {plan.download.label}
                {plan.download.size && <span className="font-jetbrains ml-2 opacity-70">{plan.download.size}</span>}
              </Button>
            )}
            <Button
              variant={plan.erase.destructive ? "danger" : "ghost"}
              className="cursor-pointer px-5 py-2 disabled:cursor-not-allowed"
              disabled={!plan.erase.enabled}
              aria-describedby={plan.consequence ? consequenceId : undefined}
              onClick={() => void erase()}
              data-testid="signout-erase"
            >
              {plan.erase.label}
            </Button>
          </div>
        </div>
      }
    >
      {!report ? (
        <Ghost shape="bar" count={1} label="Counting this account's work" />
      ) : (
        <div className="flex flex-wrap gap-2" data-testid="signout-tallies">
          {wipeTallies(report).map((t) => (
            <Tally key={t.key} label={t.label} value={t.n} tone={t.n > 0 ? "amber" : "neutral"} />
          ))}
        </div>
      )}
      {prep.state === "failed" && (
        <p className="font-hanken mt-4 text-content leading-snug text-amber-200/90">
          {prep.error}
        </p>
      )}
    </Modal>
  );
}
