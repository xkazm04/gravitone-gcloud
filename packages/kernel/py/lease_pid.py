"""Is a pid alive on this host? lease.py's probe, apart because it is the one platform-specific part.

Only ever asked about a holder on THIS host (lease-core.ts `gone`): a pid from another
host says nothing about this host's process table.
"""

import os


def pid_alive(pid):
    """Is `pid` a live process on this host? Not os.kill(pid, 0): on Windows that
    calls TerminateProcess (v1 pipeline/gpu/lease.py learned this)."""
    if not isinstance(pid, int) or pid <= 0:
        return False
    if os.name == "nt":
        import ctypes
        k32 = ctypes.WinDLL("kernel32", use_last_error=True)
        k32.OpenProcess.restype = ctypes.c_void_p
        handle = k32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return ctypes.get_last_error() == 5  # access denied: it exists
        try:
            code = ctypes.c_ulong()
            if not k32.GetExitCodeProcess(ctypes.c_void_p(handle), ctypes.byref(code)):
                return True
            return code.value == 259  # STILL_ACTIVE
        finally:
            k32.CloseHandle(ctypes.c_void_p(handle))
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True
