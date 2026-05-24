# MegaMind: Digital Brain Backend

Local, Markdown-based note-taking and knowledge management application.

## Prerequisites
- Python 3.8+

## Setup
1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. (Optional) Set Core Space password hash:
   ```bash
   python -c "import hashlib; print(hashlib.sha256('YOUR_PASSWORD_HERE'.encode()).hexdigest())"
   ```
   Then set the environment variable:
   ```powershell
   $env:MEGAMIND_CORE_PASSWORD_HASH="<hash_from_command>"
   ```
   If not set, the Core unlock endpoint returns HTTP 503.

3. Start the server:
   ```bash
   uvicorn app.main:app --reload
   ```

## Testing Commands (PowerShell)

### 1. Create Note
```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/notes" -ContentType "application/json" -Body '{"title": "Flutter: APK UI changed?", "category": "Errors-Fixes", "tags": "flutter, android, ui", "content": "# Flutter Issue\nAPK UI changed after build."}'
```
*Verify: Generates `data/notes/Errors-Fixes/flutter-apk-ui-changed-1.md`*

### 2. Get All Notes
```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/api/notes"
```

### 3. Get One Note
```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/api/notes/1"
```

### 4. Update Note
```powershell
Invoke-RestMethod -Method Put -Uri "http://127.0.0.1:8000/api/notes/1" -ContentType "application/json" -Body '{"title": "Flutter: APK UI fixed", "category": "Errors-Fixes", "tags": "flutter, fixed", "content": "# Flutter Fixed\nIssue resolved."}'
```

### 5. Search Note
```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/api/search?q=Flutter"
```

### 6. Ask Brain
```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8000/api/ask" -ContentType "application/json" -Body '{"question": "How to fix Flutter APK UI?"}'
```

### 7. Export Backup
```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/export" -OutFile "backup.zip"
```

### 8. Delete Note
```powershell
Invoke-RestMethod -Method Delete -Uri "http://127.0.0.1:8000/api/notes/1"
```

## Agent Access

AI coding agents (OpenClaude, OpenCode, Gemini CLI) can interact with MegaMind via the CLI helper or REST API.

```bash
# Start the backend first
uvicorn app.main:app --reload

# Use the CLI helper
python tools/brain.py search "query"
python tools/brain.py ask "natural language question"
python tools/brain.py add --title "Note title" --category "Errors-Fixes" --tags "tag1,tag2" --content "Note body"
python tools/brain.py list
```

See [AGENTS.md](AGENTS.md) for the full agent guide, [docs/agent-usage.md](docs/agent-usage.md) for agent-specific examples, and `tools/brain.py --help` for all CLI commands.

## Privacy Layers

MegaMind uses a two-layer privacy architecture:

- **Window Layer** — The current MegaMind system accessible through `tools/brain.py`. Agents can read, search, add, and update notes here.
- **Core Layer** — A private storage layer (to be added later). Agents cannot access Core directly.

Agents may request Core info release using `python tools/brain.py request-core`, but release only happens after explicit user approval. See [AGENTS.md](AGENTS.md) for the full privacy rules.

## Disclaimer
- This app is meant for Markdown notes.
- Files larger than 10MB are skipped during export.
