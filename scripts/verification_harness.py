#!/usr/bin/env python3
"""Repository wrapper for the canonical verification harness."""

from __future__ import annotations

import os
from pathlib import Path
import sys


CANONICAL_HARNESS = (
    Path.home()
    / ".codex"
    / "skills"
    / "moenarch-verification-harness"
    / "scripts"
    / "verification_harness.py"
)


if not CANONICAL_HARNESS.is_file():
    raise SystemExit(f"Canonical verification harness is unavailable: {CANONICAL_HARNESS}")

os.execv(sys.executable, [sys.executable, str(CANONICAL_HARNESS), *sys.argv[1:]])
