# Agent Usage Examples

## OpenClaude (WSL)

```bash
# Search notes
cd /mnt/c/Users/Sm1th/megamind
python tools/brain.py search "android studio"

# Ask the brain
python tools/brain.py ask "how did I fix flutter apk ui?"

# Add a note after fixing an issue
python tools/brain.py add \
  --title "OpenClaude path issue" \
  --category "Errors-Fixes" \
  --tags "openclaude,wsl,path" \
  --content "OpenClaude must use /mnt/c/Users/Sm1th/megamind when accessing the Windows project from WSL."

# Check health
python tools/brain.py health
```

## OpenCode (Windows PowerShell)

```powershell
# Search notes
python C:\Users\Sm1th\megamind\tools\brain.py search "android studio"

# Ask the brain
python C:\Users\Sm1th\megamind\tools\brain.py ask "how did I fix flutter apk ui?"

# Add a note
python C:\Users\Sm1th\megamind\tools\brain.py add --title "Flutter APK fix" --category "Errors-Fixes" --tags "flutter,android,apk" --content "Issue was caused by outdated Gradle plugin. Updated to 8.2 and APK built correctly."

# List all notes
python C:\Users\Sm1th\megamind\tools\brain.py list
```

## Gemini CLI

```bash
# Navigate to project
cd /mnt/c/Users/Sm1th/megamind

# Search before solving
python tools/brain.py search "deployment nginx"

# Log a project decision
python tools/brain.py add --title "Use PostgreSQL for analytics" --category "Projects" --tags "database,postgresql,decisions" --content "Decided to use PostgreSQL for the analytics reporting feature because of its JSONB support."
```

## Common Commands Agents Should Run

| Situation | Command |
|-----------|---------|
| Before debugging a recurring issue | `python tools/brain.py search "<issue keywords>"` |
| After fixing something | `python tools/brain.py add --title "<title>" --category "Errors-Fixes" --tags "<tags>" --content "<details>"` |
| Before making a project decision | `python tools/brain.py search "<topic>"` |
| After making a decision | `python tools/brain.py add --title "<title>" --category "Projects" --tags "<tags>" --content "<details>"` |
| Check if backend is running | `python tools/brain.py health` |
| Retrieve full context | `python tools/brain.py get <id>` |

## Efficient Agent Lookup

Do not read every note. Use this lightweight lookup chain instead:

1. **`python tools/brain.py index`** — Print compact topic index (id, title, category, tags). No content. Fast overview of what exists.
2. **`python tools/brain.py search "<topic>"`** — Search by keyword. Returns score, title, category, preview snippet. No full content.
3. **`python tools/brain.py get <id>`** — Only when you need the full note body.

When adding notes, check the index first to see if the parent topic exists, then use the `Parent — Subtopic` naming convention instead of creating disconnected duplicates.

## Tag Suggestions

Get suggested tags before adding a note:

```bash
python tools/brain.py suggest-tags --title "Muzic app Playback Fix" --category "Projects" --content "Fixed Android 403 error in just_audio using Invidious proxy redirect handling."

python tools/brain.py suggest-tags --title "MegaMind UI Polish" --category "Projects" --content "Updated the React frontend with a minimal dark theme and cleaner note cards."
```

Then use the output in add:

```bash
python tools/brain.py add --title "Muzic app - Playback Fix" --category "Projects" --tags "muzic-app,music-app,flutter,android,just-audio,invidious,bug-fix,playback" --content "..."
```

## Category Suggestions

Get the best category before adding a note when the user didn't specify one:

```bash
# Auto-detect category
python tools/brain.py suggest-category --title "Muzic app Playback Fix" --content "Fixed Android 403 error in just_audio using Invidious proxy redirect handling."
# → Errors-Fixes

python tools/brain.py suggest-category --title "MegaMind UI Polish" --content "Updated the React frontend with a minimal dark theme and cleaner note cards."
# → Projects

python tools/brain.py suggest-category --title "OpenClaude Prompt for Debugging" --content "Use this prompt in OpenClaude to review backend errors."
# → Prompts

python tools/brain.py suggest-category --title "Flutter install commands" --content "Run flutter doctor, npm install, and PowerShell setup commands."
# → Commands
```

Then combine with suggest-tags for a full add:

```bash
CAT=$(python tools/brain.py suggest-category --title "Muzic app Playback Fix" --content "Fixed Android 403 error in just_audio using Invidious proxy redirect handling.")
TAGS=$(python tools/brain.py suggest-tags --title "Muzic app Playback Fix" --category "$CAT" --content "Fixed Android 403 error in just_audio using Invidious proxy redirect handling.")
python tools/brain.py add --title "Muzic app - Playback Fix" --category "$CAT" --tags "$TAGS" --content "..."
```

## New Organization Commands

```bash
# View notes grouped by parent topic
python tools/brain.py topics

# Detect duplicates and get rename suggestions
python tools/brain.py organize-report

# Update a note (rename into proper subtopic format)
python tools/brain.py update 6 --title "MegaMind - Agent Access" --category "Projects" --tags "megamind,agent-access,agents,openclaude,opencode,gemini-cli" --content "..."
```

### Before Adding a Note — Organization Check

1. `python tools/brain.py topics` — See what parent topics exist
2. `python tools/brain.py search "<topic>"` — Search existing notes
3. If the parent topic exists, use `Parent - Subtopic` naming
4. If a subtopic exists and needs renaming, use `python tools/brain.py update`

## Core Release Requests

MegaMind has a two-layer privacy architecture. The current system is the **Window Layer**. A private **Core Layer** exists but agents cannot access it directly.

### Workflow — Two-Step Safety Flow

**Step 1 — First trigger (must NOT create a request):**

Search the Window Layer. If the requested info is not found, say **exactly**:
> "Cannot access. The data you asked for is in the Core/private layer. Try again if you want to request permission."

Then **stop**. Do not create a `request-core`. Do not ask permission yet. Wait for the user to retry.

**Step 2 — Retry:**

If the user asks again or says they want to request permission, ask:
> "Do you want to request permission to release specific Core info into the Window Layer?"

If the user approves, create a release request:
```bash
python tools/brain.py request-core --topic "Topic here" --reason "Reason here"
```

Output:
```
Core release request created: req_YYYYMMDD_HHMMSS
Waiting for user approval.
Agents cannot access Core directly.
```

**Step 3 — After request:**

Report the request ID, topic, reason, and that it is waiting for user approval.

Check pending requests:
```bash
python tools/brain.py list-core-requests
```

### Important

- `request-core` creates a JSON request file in `data/release_requests/pending/`.
- Only the user can approve a request.
- Approved info must be tagged `core-release,approved,window-layer,<topic>` when added to Window Layer.
- Never store secrets in the Window Layer.

### Example: Two-Step Core Request

**User says (first trigger):**
> "Activate MegaMind. Give me Muzic app private roadmap."

**Agent does (Step 1):**
1. `python tools/brain.py health` — check backend
2. `python tools/brain.py topics` — load topic registry
3. `python tools/brain.py search "Muzic app private roadmap"` — search Window Layer
4. Finds the general "Muzic app" note but **no private roadmap details**.
5. **Says exactly (then stops):**
   > "Cannot access. The data you asked for is in the Core/private layer. Try again if you want to request permission."

**User retries:**
> "Try again and request permission."

**Agent does (Step 2):**
1. Asks: "Do you want to request permission to release specific Core info into the Window Layer?"
2. User confirms.
3. Runs:
   ```bash
   python tools/brain.py request-core --topic "Muzic app private roadmap" --reason "User retried and requested permission for approved Core info release."
   ```

**Agent does (Step 3):**
Reports the request ID, topic, reason, and that it is waiting for user approval.

## Environment Variable

Override the API base URL:

```bash
export MEGAMIND_API_BASE=http://192.168.1.5:8000/api
python tools/brain.py list
```
