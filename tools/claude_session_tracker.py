"""
Claude Session Tracker — MegaWork Module
==========================================
Option 3: Monitors Claude Desktop window activity and estimates session usage.
Option 4: Scheduled reminder via rolling time-based notifications.

How it works:
- Watches Claude Desktop window title / process for activity
- Tracks Claude Desktop activity via window polling
- Scheduled reminder: every N minutes, reminds you to pause if session is active

Run from MegaWork or standalone:
    .venv/Scripts/python.exe tools/claude_session_tracker.py

Dependencies (all free):
    pip install pywin32 plyer schedule

Config via megamind/.env:
    CLAUDE_TRACKER_CHECKPOINT_MINUTES=30   # reminder interval
    CLAUDE_TRACKER_ENABLED=1              # set to 0 to disable
"""

import os
import sys
import time
import json
import threading
import datetime
import schedule

# Windows-specific imports
try:
    import win32gui
    import win32process
    import win32con
    import win32api
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False
    print("[tracker] pywin32 not installed — window detection disabled.")

try:
    from plyer import notification
    PLYER_AVAILABLE = True
except ImportError:
    PLYER_AVAILABLE = False
    print("[tracker] plyer not installed — using print notifications.")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ENV_FILE = r"C:\Users\Sm1th\megamind\.env"
def load_env_file(path: str) -> dict:
    env = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env

_env = load_env_file(ENV_FILE)
ACTIVE_ACCOUNT = os.environ.get("CLAUDE_ACTIVE_ACCOUNT") or _env.get("CLAUDE_ACTIVE_ACCOUNT", "default")
WARN_MESSAGES = int(_env.get("CLAUDE_TRACKER_WARN_MESSAGES", "25"))
CHECKPOINT_MINUTES = int(_env.get("CLAUDE_TRACKER_CHECKPOINT_MINUTES", "30"))
ENABLED       = _env.get("CLAUDE_TRACKER_ENABLED", "1") == "1"


STATE_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "tracker_state.json")


def save_state_to_disk(state):
    """Persist session state to disk so tracker can resume after restart."""
    try:
        data = {
            "active": state.active,
            "start_time": state.start_time.isoformat() if state.start_time else None,
            "last_window_title": state.last_window_title,
            "warned": state.warned,
            "last_checkpoint": state.last_checkpoint.isoformat() if state.last_checkpoint else None,
        }
        with open(STATE_FILE, "w") as f:
            json.dump(data, f)
    except Exception as e:
        print(f"[tracker] State save error: {e}")


def load_state_from_disk():
    """Load persisted state if recent enough (within 2 hours)."""
    try:
        if not os.path.exists(STATE_FILE):
            return None
        with open(STATE_FILE, "r") as f:
            data = json.load(f)
        if not data.get("start_time"):
            return None
        start_time = datetime.datetime.fromisoformat(data["start_time"])
        age_minutes = (datetime.datetime.now() - start_time).total_seconds() / 60
        if age_minutes > 120:
            os.remove(STATE_FILE)
            return None
        return data
    except Exception as e:
        print(f"[tracker] State load error: {e}")
        return None

# ---------------------------------------------------------------------------
# Session State
# ---------------------------------------------------------------------------

class SessionState:
    def __init__(self):
        self.active = False
        self.start_time: datetime.datetime | None = None
        self.last_window_title = ""
        self.warned = False
        self.last_checkpoint: datetime.datetime | None = None
        self.lock = threading.Lock()

    def reset(self):
        with self.lock:
            self.active = False
            self.start_time = None
            self.warned = False
            self.last_window_title = ""
            self.last_checkpoint = None
        try:
            if os.path.exists(STATE_FILE):
                os.remove(STATE_FILE)
        except Exception:
            pass

    def activate(self):
        should_save = False
        with self.lock:
            if not self.active:
                self.active = True
                self.start_time = datetime.datetime.now()
                self.warned = False
                print(f"[tracker] Claude session started at {self.start_time.strftime('%H:%M:%S')}")
                should_save = True
        if should_save:
            save_state_to_disk(self)

    def restore(self, data: dict):
        """Restore state from persisted data."""
        with self.lock:
            self.active = data.get("active", False)
            self.start_time = datetime.datetime.fromisoformat(data["start_time"]) if data.get("start_time") else None
            self.last_window_title = data.get("last_window_title", "")
            self.warned = data.get("warned", False)
            self.last_checkpoint = datetime.datetime.fromisoformat(data["last_checkpoint"]) if data.get("last_checkpoint") else None

    def duration_minutes(self) -> int:
        if not self.start_time:
            return 0
        return int((datetime.datetime.now() - self.start_time).total_seconds() / 60)

state = SessionState()

# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

def notify(title: str, message: str, urgent: bool = False):
    """Send a desktop notification."""
    print(f"\n{'🚨' if urgent else '⚠️'} [{title}] {message}\n")
    if PLYER_AVAILABLE:
        try:
            notification.notify(
                title=title,
                message=message,
                app_name="MegaWork",
                timeout=10 if not urgent else 30,
            )
        except Exception as e:
            print(f"[tracker] Notification error: {e}")

# ---------------------------------------------------------------------------
# Window Detection (Option 3)
# ---------------------------------------------------------------------------

CLAUDE_WINDOW_KEYWORDS = ["claude", "Claude"]

def find_claude_window() -> str | None:
    """Return the title of the Claude Desktop window if it exists and is focused."""
    if not WIN32_AVAILABLE:
        return None
    try:
        hwnd = win32gui.GetForegroundWindow()
        title = win32gui.GetWindowText(hwnd)
        if any(k.lower() in title.lower() for k in CLAUDE_WINDOW_KEYWORDS):
            return title
    except Exception:
        pass
    return None

def is_claude_running() -> bool:
    """Check if Claude Desktop process is running."""
    if not WIN32_AVAILABLE:
        return False
    try:
        def enum_callback(hwnd, results):
            if win32gui.IsWindowVisible(hwnd):
                title = win32gui.GetWindowText(hwnd)
                if any(k.lower() in title.lower() for k in CLAUDE_WINDOW_KEYWORDS):
                    results.append(title)
        results = []
        win32gui.EnumWindows(enum_callback, results)
        return len(results) > 0
    except Exception:
        return False

def _is_account_switch(old_title: str, new_title: str) -> bool:
    """Detect if window title change indicates an account switch.
    Claude Desktop titles typically contain the conversation name or account info.
    A switch is flagged if both titles are non-empty and clearly differ at the
    start (first 12 chars), suggesting a different conversation/account loaded.
    """
    # Normalize
    old = old_title.strip().lower()
    new = new_title.strip().lower()
    # Same title = no switch
    if old == new:
        return False
    # If either is just "claude" (default/loading state), not a switch
    if old in ("claude", "") or new in ("claude", ""):
        return False
    # Titles differ meaningfully = likely account/conversation switch
    return old[:12] != new[:12]


def poll_claude_window():
    """Poll Claude Desktop window. Called every 5 seconds."""
    if not is_claude_running():
        if state.active:
            print("[tracker] Claude Desktop closed. Session ended.")
            state.reset()
        return

    # Claude is running — activate if not already
    state.activate()
    focused_title = find_claude_window()

    if focused_title and focused_title != state.last_window_title:
        old_title = state.last_window_title

        # Account switch detection — reset if title suggests different account
        if old_title and old_title != "" and _is_account_switch(old_title, focused_title):
            print(f"[tracker] Account switch detected: '{old_title}' → '{focused_title}'")
            print(f"[tracker] Resetting session for new account.")
            state.reset()
            state.activate()

        state.last_window_title = focused_title
        save_state_to_disk(state)

        # Only log on minute boundaries to reduce noise
        current_minute = state.duration_minutes()
        if current_minute != getattr(state, "_last_logged_minute", -1):
            print(f"[tracker] Claude window activity | {current_minute}min")
            state._last_logged_minute = current_minute

# ---------------------------------------------------------------------------
# Scheduled Checkpoint (Option 4)
# ---------------------------------------------------------------------------

def scheduled_checkpoint():
    """Runs every CHECKPOINT_MINUTES. Reminds user to pause if session is active."""
    if not state.active:
        return

    now = datetime.datetime.now()

    # Don't double-notify if we just notified
    if state.last_checkpoint:
        mins_since = (now - state.last_checkpoint).total_seconds() / 60
        if mins_since < CHECKPOINT_MINUTES - 1:
            return

    state.last_checkpoint = now
    save_state_to_disk(state)
    duration = state.duration_minutes()

    notify(
        "MegaWork - Session Reminder",
        f"Claude session active for {duration} min. Say 'pause' to save progress to MegaMind.",
    )

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def run_tracker():
    if not ENABLED:
        print("[tracker] Disabled via CLAUDE_TRACKER_ENABLED=0")
        return

    print(f"[tracker] Starting Claude Session Tracker")
    print(f"  Account        : {ACTIVE_ACCOUNT}")
    print(f"  Warn threshold : {WARN_MESSAGES} messages")
    print(f"  Reminder       : every {CHECKPOINT_MINUTES} minutes")
    print()

    # Restore state if recent session exists
    saved = load_state_from_disk()
    if saved and saved.get("active"):
        state.restore(saved)
        print(f"[tracker] Restored session from disk — started at {state.start_time.strftime('%H:%M:%S')}, {state.duration_minutes()} min elapsed")
    else:
        print(f"[tracker] No recent session found, starting fresh")

    # Schedule reminder
    schedule.every(CHECKPOINT_MINUTES).minutes.do(scheduled_checkpoint)

    # Poll window every 5 seconds
    def poll_loop():
        while True:
            try:
                poll_claude_window()
            except Exception as e:
                print(f"[tracker] Poll error: {e}")
            time.sleep(5)

    # Run poll in background thread
    poll_thread = threading.Thread(target=poll_loop, daemon=True)
    poll_thread.start()

    # Run scheduler in main thread
    while True:
        try:
            schedule.run_pending()
        except Exception as e:
            print(f"[tracker] Scheduler error: {e}")
        time.sleep(1)

if __name__ == "__main__":
    run_tracker()
