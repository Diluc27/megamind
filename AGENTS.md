# MegaMind — AI Agent Guide

## Overview

MegaMind is a local, Markdown-based knowledge management app.
You can use it to store, search, and retrieve notes via a REST API or the CLI helper at `tools/brain.py`.

## Activate MegaMind

When the user says **“Activate MegaMind”**, the agent must immediately connect to MegaMind project memory before continuing.

**“Activate MegaMind”** = check health, load topics, search relevant memory, avoid duplicates, and log important changes.

### Activation Steps

1. **Go to the MegaMind project directory.**

   Windows:
   ```powershell
   cd C:\Users\Sm1th\megamind
   ```

   WSL:
   ```bash
   cd /mnt/c/Users/Sm1th/megamind
   ```

2. **Check that MegaMind backend is reachable:**
   ```bash
   python tools/brain.py health
   ```

3. **Load the lightweight topic registry:**
   ```bash
   python tools/brain.py topics
   ```

4. **Check today's activity:**
   ```bash
   python tools/brain.py daily-log --show
   ```

5. **Search for the current project/topic if the user mentioned one:**
   ```bash
   python tools/brain.py search "<topic>"
   ```

6. **Ask MegaMind if context is needed:**
   ```bash
   python tools/brain.py ask "<question>"
   ```

7. **Use MegaMind as the source of truth for project memory before making decisions.**

8. **Before adding new memory, check for existing topics first:**
   ```bash
   python tools/brain.py topics
   python tools/brain.py search "<topic>"
   ```

9. **Do not create duplicate parent notes.** Use one main note per project/topic, such as:
   - `MegaMind`
   - `Muzic app`
   - `YesMusic`

9. **If related information must be stored separately**, use:
   ```
   <Parent Topic> - <Subtopic>
   ```
   Examples:
   - `MegaMind - Agent Access`
   - `MegaMind - UI Redesign`
   - `Muzic app - Bugs & Fixes`

10. **After any significant project change, immediately log it into MegaMind** using `python tools/brain.py add` or `update`.

    Significant changes include:
    - feature addition
    - bug fix
    - UI redesign
    - backend change
    - architecture change
    - config change
    - important project decision
    - new setup command
    - important error and fix

11. **Never store secrets in MegaMind:**
    - API keys
    - passwords
    - tokens
    - private credentials

### If Health Fails

If `python tools/brain.py health` does not return a success response, tell the user to start the MegaMind backend:

```powershell
cd C:\Users\Sm1th\megamind
.venv\Scripts\activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## MegaMind Memory Connection

MegaMind is the source of truth for project memory. All agents must use it before and after important project work.

### Paths

- **Windows:** `C:\Users\Sm1th\megamind`
- **WSL:** `/mnt/c/Users/Sm1th/megamind`

When working from WSL, **edit files** via the WSL path, but **run CLI commands** (`python tools/brain.py`) from Windows PowerShell unless `MEGAMIND_API_BASE` is configured to a reachable Windows host IP.

### Simple Call Format

```bash
python tools/brain.py <command>
```

### Core Commands

| Command | Purpose |
|---------|---------|
| `python tools/brain.py health` | Check backend is running |
| `python tools/brain.py topics` | Show all topics grouped by parent |
| `python tools/brain.py search "<query>"` | Search notes by keyword |
| `python tools/brain.py ask "<question>"` | Ask a natural language question |
| `python tools/brain.py get <id>` | Get full content of one note |
| `python tools/brain.py add --title "..." --category "..." --tags "..." --content "..."` | Create a new note |
| `python tools/brain.py update <id> --title "..." --category "..." --tags "..." --content "..."` | Update an existing note |
| `python tools/brain.py organize-report` | Check for duplicate/similar notes |
| `python tools/brain.py index` | Print compact topic index |
| `python tools/brain.py list` | List all notes (id, title, category, tags) |
| `python tools/brain.py delete <id>` | Delete a note |
| `python tools/brain.py session-list` | List all sessions |
| `python tools/brain.py session-get <id>` | Get full content of one session |
| `python tools/brain.py session-add --title "..." --agent "..." --project "..." --tags "..." --content "..."` | Create a new session |
| `python tools/brain.py session-update <id> --title "..." --agent "..." --project "..." --tags "..." --content "..."` | Update an existing session |
| `python tools/brain.py session-delete <id>` | Delete a session |
| `python tools/brain.py session-search "<query>"` | Search sessions by keyword |

### Agent Workflow

1. **Before working on a project**, run:
   ```bash
   python tools/brain.py topics
   ```

2. **Search the related topic**:
   ```bash
   python tools/brain.py search "<project or topic>"
   ```

3. **If needed, ask MegaMind**:
   ```bash
   python tools/brain.py ask "<question>"
   ```

4. **If the topic already exists**, update that existing main note or add a subtopic — do not create duplicate parent notes.

5. **Use one main note per project/topic**:
   - `MegaMind`
   - `Muzic app`
   - `YesMusic`

   Do **not** create duplicate parent notes like:
   - `MegaMind Agent Access Enabled`
   - `Muzic app Blueprint`
   - `Muzic app Project Progress`

6. **If subtopic content is necessary**, use this naming pattern:
   ```
   <Parent Topic> - <Subtopic>
   ```
   Examples:
   - `MegaMind - Agent Access`
   - `MegaMind - UI Redesign`
   - `Muzic app - Bugs & Fixes`

7. **After making a significant change, immediately log it into MegaMind.**

   Significant changes include:
   - feature addition
   - bug fix
   - UI redesign
   - backend change
   - architecture change
   - config change
   - important project decision
   - new setup command
   - important error and fix

8. **Never store secrets in MegaMind:**
   - API keys
   - passwords
   - tokens
   - private credentials

9. **If MegaMind backend is not reachable**, start it:
   ```powershell
   cd C:\Users\Sm1th\megamind
   .venv\Scripts\activate
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

### Common Calls

```bash
# Search memory
python tools/brain.py search "flutter apk"

# Ask memory
python tools/brain.py ask "how did I fix flutter apk ui?"

# Add project change
python tools/brain.py add --title "MegaMind - UI Polish" --category "Projects" --tags "megamind,frontend,ui" --content "Updated MegaMind UI with a minimal dark theme. Build passed."

# Update existing topic (get current content first, then update)
python tools/brain.py get 11
python tools/brain.py update 11 --title "MegaMind" --category "Projects" --tags "megamind,project-memory,backend,frontend,agents" --content "FULL UPDATED CONTENT HERE"
```

## MegaMind Tagging Rule

When adding or updating MegaMind notes, the user may provide only a title and content. The agent must generate suitable tags automatically. The best approach is to **let `suggest-tags` and `suggest-category` do the work**.

### Rules

1. **Always run `suggest-tags` and `suggest-category` before guessing tags or category:**
   ```bash
   python tools/brain.py suggest-category --title "..." --content "..."
   python tools/brain.py suggest-tags --title "..." --category "..." --content "..."
   ```

   If the user did not provide a category, use `suggest-category` output as the `--category` value.

2. **The output of `suggest-tags` follows this priority order:**
   - Tier 1: Parent-project tags (when title matches a known project like Muzic, MegaMind, YesMusic)
   - Tier 2: Technical tags from content (flutter, react, fastapi, just-audio, etc.)
   - Tier 3: Purpose tags (bug-fix, playback, ui, setup, project-progress, blueprint)
   - Tier 4: Content-derived fallback tags (only when relevant)

3. **Weak/generic words are automatically filtered or mapped:**
   - `error`, `fix`, `bug`, `issue`, `403` → `bug-fix`
   - `playback`, `player`, `audio` → `playback`
   - `ui`, `interface`, `design`, `polish`, `cleaner` → `ui`
   - `setup`, `config` → `setup`
   - `project`, `portfolio`, `important`, `note`, `updated`, `changed` → suppressed

4. **Known projects are auto-detected from title content:**
   - `muzic` / `musick` → `muzic-app,music-app,flutter,android`
   - `megamind` → `megamind,project-memory,backend,frontend,agents`
   - `yesmusic` → `yesmusic,music-app,android`

5. **Keep tags lowercase.** Use hyphenated tags, not spaces. Use comma-separated format.

6. **Prefer 6–8 strong tags.** The command auto-limits output to 8.

7. **Never invent tags** that are not supported by the title/content/context.

8. **Never tag secrets**, API keys, passwords, or private tokens.

### Examples

| Input | `suggest-tags` Output |
|-------|----------------------|
| `Muzic app Playback Fix` + `Fixed Android 403 error in just_audio using Invidious proxy redirect handling.` | `muzic-app,music-app,flutter,android,just-audio,invidious,bug-fix,playback` |
| `MegaMind UI Polish` + `Updated the React frontend with a minimal dark theme and cleaner note cards.` | `megamind,project-memory,backend,frontend,agents,react,design,ui` |
| `YesMusic Setup Notes` + `Added setup notes for Android music app project.` | `yesmusic,music-app,android,setup` |

## MegaMind Privacy Layers

Current MegaMind (accessible through `tools/brain.py`) is the **Window Layer**.

### Rules

- **Agents may only access the Window Layer.**
- Agents must never search private files or the full Windows user folder for hidden/core data.
- Agents must never attempt to access the Core Layer.
- Agents must not ask for or reveal the Core storage path.
- Never store secrets in the Window Layer.

### Two-Step Core Trigger Safety Flow

When a user asks for information that is not in the Window Layer and appears to require Core/private data:

**Step 1 — First trigger:**
1. Search the Window Layer first using `search` or `ask`.
2. If exact info exists, use it directly.
3. If the requested info is not found, the agent must stop and say **exactly**:
   > "Cannot access. The data you asked for is in the Core/private layer. Try again if you want to request permission."
4. **Do NOT** create a `request-core` on the first trigger.
5. **Do NOT** ask "Do you want to release specific Core info into the Window Layer?" yet.
6. **Do NOT** search private files or ask for the Core path.
7. **Stop.** Wait for the user to retry.

**Step 2 — Retry:**
1. If the user asks again or clearly says they want to request permission, the agent may ask:
   > "Do you want to request permission to release specific Core info into the Window Layer?"
2. Only after the user explicitly approves, the agent may run:
   ```bash
   python tools/brain.py request-core --topic "..." --reason "..."
   ```

**Step 3 — After request:**
1. Report to the user:
   - The request ID
   - The topic
   - The reason
   - That it is waiting for user approval
   - That agents cannot access Core directly
2. Core information may only enter the Window Layer after explicit user approval.
3. Released info must be tagged: `core-release,approved,window-layer,<topic>`

### Commands

```bash
# Request Core info release
python tools/brain.py request-core --topic "Muzic app private roadmap" --reason "Need project context."

# List pending requests
python tools/brain.py list-core-requests
```

## Available Categories

Use `suggest-category` to auto-detect the best category from title + content:

```bash
python tools/brain.py suggest-category --title "..." --content "..."
```

Categories are scored by keyword matches with multi-word phrases weighted double. Tie-breaker priority: Errors-Fixes > Commands > Projects > Tools-Models > Prompts > Ideas > Learning-Logs. Defaults to **Projects** if no strong match.

- Projects
- Errors-Fixes
- Prompts
- Tools-Models
- Ideas
- Learning-Logs
- Commands

### Category Examples

| Input | `suggest-category` Output |
|-------|--------------------------|
| `Muzic app Playback Fix` + `Fixed Android 403 error in just_audio using Invidious proxy redirect handling.` | `Errors-Fixes` |
| `MegaMind UI Polish` + `Updated the React frontend with a minimal dark theme and cleaner note cards.` | `Projects` |
| `OpenClaude Prompt for Debugging` + `Use this prompt in OpenClaude to review backend errors.` | `Prompts` |
| `Flutter install commands` + `Run flutter doctor, npm install, and PowerShell setup commands.` | `Commands` |

## Sessions Space

Sessions is a third storage layer in MegaMind, separate from Window Space (notes) and Core Space. Sessions store agent conversation logs, session records, and project-specific agent interactions.

### Rules

- **Sessions are agent-accessible by default.** Unlike Core Space, agents may read, create, and update sessions without permission.
- Sessions are stored in `data/sessions/` as Markdown files and in a separate `sessions` SQLite table.
- Sessions are organized by **agent** and **project** rather than by category.
- Each session has: title, agent, project, tags, and content.

### Session Commands

```bash
# List all sessions
python tools/brain.py session-list

# Get a session by ID
python tools/brain.py session-get <id>

# Create a new session
python tools/brain.py session-add --title "..." --agent "..." --project "..." --tags "..." --content "..."

# Create a session from a file
python tools/brain.py session-add --title "..." --content-file "path/to/file.md"

# Update a session
python tools/brain.py session-update <id> --title "..." --agent "..." --project "..." --tags "..." --content "..."

# Delete a session
python tools/brain.py session-delete <id> [--yes]

# Search sessions
python tools/brain.py session-search "<query>"
```

### When to Use Sessions vs Window Notes

| Use Case | Store In |
|----------|----------|
| Project knowledge, permanent reference | Window Space (`brain.py add`) |
| Agent conversation, session log, temporary record | Sessions (`brain.py session-add`) |
| Private, sensitive, or user-only data | Core Space (requires approval) |

### Session Tagging

- Sessions use the same tagging conventions as Window notes.
- Include the agent name and project as tags for better searchability.
- Run `suggest-tags` for auto-generated tags if needed.

### API Endpoints (for agent use)

Sessions are served under the same API at `/api/sessions`:
- `GET /api/sessions` — list all sessions
- `GET /api/sessions/{id}` — get session by ID
- `POST /api/sessions` — create session
- `PUT /api/sessions/{id}` — update session
- `DELETE /api/sessions/{id}` — delete session
- `GET /api/sessions/search?q=...` — search sessions

# MegaMind Agent Rules

## Mandatory project paths

MegaMind backend/web root:
C:\Users\Sm1th\megamind
WSL path:
/mnt/c/Users/Sm1th/megamind

MegaMind Mobile root:
C:\Users\Sm1th\megamind_mobile
WSL path:
/mnt/c/Users/Sm1th/megamind_mobile

Do not search /home/smith for MegaMind projects.
Do not search /mnt/c broadly unless explicitly asked.
Use APDS before project tasks:
1. Run pwd.
2. Confirm project root.
3. Confirm marker files.
4. Stop and ask if root is wrong.

## Activate Megawork

When user says “Activate Megawork”:
- Run:
  C:\Users\Sm1th\megamind\activate_megawork.py
- Preferred command from Windows PowerShell:
  cd C:\Users\Sm1th\megamind
  python activate_megawork.py

- If running from WSL/OpenCode:
  do not run with Linux python3.
  Use Windows Python or PowerShell:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\Sm1th\megamind'; python activate_megawork.py"

Expected behavior:
- Fresh restart backend/frontend.
- Stop old processes on ports 8000 and 5173.
- Open/run MegaWork in a separate PowerShell window/session.
- Backend: http://127.0.0.1:8000
- Frontend: http://localhost:5173

Do not inline the full PowerShell script unless the launcher fails.
Do not run it inside the agent terminal if separate window mode is available.

## Megarun

When user says “Megarun”:
- Run:
  C:\Users\Sm1th\megamind_mobile\megarun.py
- Preferred command from Windows PowerShell:
  cd C:\Users\Sm1th\megamind_mobile
  python megarun.py

- If running from WSL/OpenCode:
  use:
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\Sm1th\megamind_mobile'; python megarun.py"

Expected behavior:
- Detect connected Flutter devices.
- Run MegaMind Mobile only on Samsung or Infinix Android devices.
- Never run on Windows desktop, emulator, or unknown devices.
- Open a separate PowerShell window titled “Megarun - MegaMind Mobile”.

## Long tasks

Long or multi-file tasks should go to OpenClaude first because it supports subagents.
Prompt should explicitly say:
“Use subagents if available. If worktree isolation fails, stop retrying and proceed without subagents or ask the user.”

## Worktree rule

If worktree/subagent verification fails:
- Do not repeatedly relaunch failing verifier agents.
- If project is not a git repo, ask user to initialize git or proceed without subagents.
- Manual verification is acceptable:
  - py_compile
  - flutter analyze
  - flutter build apk
  - npm/typecheck if frontend changed

## Duplicate protection

MegaMind duplicate rule:
- Backend is source of truth.
- Exact duplicate means normalized title + normalized content match an existing non-deleted note.
- Mobile, Web, CLI, and backend should reject or skip exact duplicate notes.
- Mobile sync should treat backend duplicate response as success by linking to existing server ID when provided.
- Locked/restricted/local_only/deleted notes must continue to skip sync.

## Privacy rules

Locked/restricted note titles can be index metadata.
Locked/restricted content, snippets, body text, and private details must not be exposed in normal UI, graph previews, web previews, or sync.
Restricted notes remain local_only and locked.
Core access requires explicit user approval.

## Stop MegaWork

When user says “Stop Megawork” or asks to terminate backend/frontend:
- Run:
  C:\Users\Sm1th\megamind\stop_megawork.py

Windows PowerShell:
cd C:\Users\Sm1th\megamind
python stop_megawork.py

WSL/OpenCode:
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\Sm1th\megamind'; python stop_megawork.py"

Expected behavior:
- Stop MegaMindBackend and MegaMindFrontend jobs.
- Kill MegaWork controller windows/scripts.
- Kill uvicorn/app.main backend workers.
- Kill orphan multiprocessing.spawn Python workers.
- Kill frontend npm/vite/node processes.
- Clear ports 8000 and 5173.
- Verify no LISTENING entries remain on ports 8000 and 5173.

Title:
MegaMind Command Routing Rules

Rule:
For all future MegaMind sessions, automatically treat these command meanings as fixed.

1. “activate megawork”
Means start MegaMind backend and frontend.
Do not broad search.
Do not ask for clarification.
Run:
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\Sm1th\megamind'; python .\activate_megawork.py"

2. “kill megawork”, “stop megawork”, “terminate megawork”, “ded megawork”
Means stop MegaMind backend and frontend.
Do NOT interpret this as disabling APDS, disabling MegaWork routing, disabling agent routing, stopping AGENTS.md compliance, or forgetting workflow rules.
Run:
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\Sm1th\megamind'; python .\stop_megawork.py"

3. “megarun”
Means run MegaMind Mobile on connected Samsung/Infinix Android device only.
Run:
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\Sm1th\megamind_mobile'; python .\megarun.py"

4. “restart”
Means restart MegaWork — stop all tabs/processes, then open fresh tabs.
Do NOT interpret this as just killing or just activating without the other.
Run:
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location 'C:\Users\Sm1th\megamind'; python .\restart_megawork.py"

5. Search discipline:
Do not search /, /home/smith, /mnt/c broadly, or the whole filesystem for known MegaMind commands.
Use fixed paths:
MegaMind backend/web:
C:\Users\Sm1th\megamind
WSL:
/mnt/c/Users/Sm1th/megamind

MegaMind Mobile:
C:\Users\Sm1th\megamind_mobile
WSL:
/mnt/c/Users/Sm1th/megamind_mobile

5. AGENTS.md:
For MegaMind project tasks, automatically read and follow:
C:\Users\Sm1th\megamind\AGENTS.md
Do not require the user to remind you each session.

6. Safety:
Before broad system/network/process resets, identify exact process/port owner first.
Do not casually run wsl --shutdown, netsh winsock reset, netsh int ip reset, HNS/WinNAT restart, or broad taskkill/pkill/Stop-Process.
Preserve LiteLLM, OpenClaude, OpenCode, WSL networking, and active project sessions.

## Session-End Logging Workflow

When a project session ends or the user indicates the session is over:

0. **Append to today's daily log first:**
   ```powershell
   cd C:\Users\Sm1th\megamind
   python tools/brain.py daily-log --append "Session summary: <brief description>"
   ```

1. **Create a log note** in MegaMind:
   ```powershell
   python tools/brain.py add --title "<Project> - Session YYYY-MM-DD" --category "Projects" --tags "<project>,session-log,change-log" --content "
   ## Session Summary
   - Date: YYYY-MM-DD
   - Work done: ...
   - Files changed: ...
   - Decisions made: ...
   - Commands used: ...
   - Next steps: ...
   "
   ```

2. **Update the current conversation session** if it exists:
   ```powershell
   python tools/brain.py session-search "<project> conversation"
   python tools/brain.py session-get <id>
   python tools/brain.py session-update <id> --title "<existing title>" --agent "OpenCode" --project "<project>" --tags "..." --content "<current content + new work details>"
   ```

3. **If new sessions were created**, update the registry:
   ```powershell
   python tools/brain.py session-list
   python tools/brain.py session-get 2
   # Add new entry, then:
   python tools/brain.py session-update 2 ...
   ```

4. **Log format for notes:**
   ```
   ## Change
   - What was done: <summary>
   - Files touched: <list>
   - Tests run: <result>
   - Decisions made: <list>
   - Next steps: <list>
   - Commands used: <list>
   ```

## Daily Log Rules

- One note per day. Never create a second daily log for the same date.
- Multiple OpenCode sessions in one day all append to the same daily log.
- Next day = new note automatically.
- Title describes the day's main work.
- Subtitle: `## MegaMind \u2014 YYYY-MM-DD`.
- Every significant action gets appended with a timestamp (`### HH:MM \u2014 summary`).

## Memory Management (Two-Layer System)

MegaMind has two memory layers:

| Layer | Tags | Auto-Expires | Deletion |
|-------|------|-------------|----------|
| **Permanent knowledge** | `memory-permanent,protected` | Never | Only via `delete-permanent` CLI command with reason + confirm |
| **Working context** | `memory-working,expires-YYYY-MM-DD,retention-Xd` | Yes (default 7 days) | Via `prune-expired` or normal delete (but daily logs created by `daily-log` get `memory-working` auto-tagged) |

### Protection Rules

- Notes with `protected` or `memory-permanent` tags **cannot** be deleted via:
  - `python tools/brain.py delete <id>` (CLI refuses)
  - `DELETE /api/notes/{id}` (backend HTTP 403)
  - Sessions panel UI (backend returns 403)
- Only the `delete-permanent` CLI command can remove them.

### Retention Settings

Default TTL for working context is 7 days. Change it:

```powershell
# Show current setting
python tools/brain.py retention-settings --show

# Set to 14 days
python tools/brain.py retention-settings --set 14

# Set to 30 days
python tools/brain.py retention-settings --set 30
```

Only 7, 14, and 30 are allowed. Existing notes keep their original expiry; only new notes use the new TTL.

### Prune Expired Working Context

Daily logs and working context notes auto-expire. Prune them:

```powershell
# Preview what would be deleted
python tools/brain.py prune-expired --dry-run

# Actually delete expired notes
python tools/brain.py prune-expired --apply
```

Only notes tagged `memory-working` with a past `expires-YYYY-MM-DD` tag are affected. Permanent notes are never touched.

### Rollup Before Expiry

Before a daily log expires, promote important parts to permanent knowledge:

```powershell
python tools/brain.py rollup-daily-log --date 2026-06-02
```

This creates a new permanent note (tagged `memory-permanent,protected,daily-log-rollup`) with the full content. The original daily log can then be pruned or kept until expiry.

### Delete Permanent (Protected) Notes

Only for permanent/protected notes — requires explicit reason and confirmation:

```powershell
python tools/brain.py delete-permanent 42 --reason "Deprecated project" --confirm
```

Without `--confirm`, it prompts interactively.

## MegaMind-OpenCode Integration

A global OpenCode skill (`megamind-memory`) and instruction file (`INSTRUCTIONS.md`) are installed:
- Skill path: `C:\Users\Sm1th\.opencode\active-skills\megamind-memory\SKILL.md`
- Instructions: `C:\Users\Sm1th\.config\opencode\INSTRUCTIONS.md`
- Config: `C:\Users\Sm1th\.config\opencode\opencode.jsonc` (instructions + skills.paths)

This makes OpenCode automatically aware of MegaMind on startup.
The new `context-pack` CLI command returns compact project context.

To complete activation, **restart OpenCode**.
