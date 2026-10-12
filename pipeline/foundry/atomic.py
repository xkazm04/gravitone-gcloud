"""Replace a polled file atomically, surviving a reader that has it open.

The one definition of how this pipeline replaces a file the /foundry page
polls (styles.json, run.json). Callers write the temp file beside the
destination, then call replace_with_retry(tmp, dest). No local imports on
purpose, so any script here can import it without dragging in a probe.

THE REPLACE IS RETRIED, because on Windows it is not unconditional: os.replace
raises PermissionError while ANY other handle to the destination is open, and
a polled file has one open a great deal of the time. Measured on the real
30 KB catalogue with a reader in a tight loop: the bare replace lost 32 of 40
writes; with this retry, 0 of 40. The window is microseconds wide, so a few
short retries close it; what must never happen is swallowing the failure, so
the last attempt raises and the caller hears about it.
"""

import os
import time

ATTEMPTS = 20
DELAY_S = 0.01


def replace_with_retry(tmp, dest):
    for attempt in range(ATTEMPTS):
        try:
            os.replace(tmp, dest)
            return
        except PermissionError:
            if attempt == ATTEMPTS - 1:
                raise
            time.sleep(DELAY_S)
