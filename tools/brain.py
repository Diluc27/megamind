import urllib.request
import urllib.parse
import json
import argparse
import os
import sys
import datetime
from pathlib import Path


API_BASE = os.environ.get("MEGAMIND_API_BASE", "http://127.0.0.1:8000/api")


def _req(method, path, data=None):
    url = f"{API_BASE}{path}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps(data).encode() if data else None
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Error {e.code}: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Connection refused — is the backend running at {API_BASE}?", file=sys.stderr)
        sys.exit(1)


def cmd_health():
    url = API_BASE.replace("/api", "")
    try:
        with urllib.request.urlopen(f"{url}/", timeout=5) as resp:
            print(resp.read().decode())
    except urllib.error.URLError:
        print("Backend is not reachable.", file=sys.stderr)
        sys.exit(1)


def cmd_list():
    notes = _req("GET", "/notes")
    if not notes:
        print("No notes found.")
        return
    for n in notes:
        tags = n.get("tags") or ""
        print(f"{n['id']:>3}  {n['title']:<50}  {n.get('category',''):<20}  {tags}")


def cmd_index():
    notes = _req("GET", "/notes")
    if not notes:
        print("No notes found.")
        return
    print(f"MegaMind Topic Index ({len(notes)} notes)")
    print()
    for n in notes:
        tags = n.get("tags") or ""
        print(f"[{n['id']}] {n['title']}  ({n.get('category','')})  {tags}")


def cmd_get(args):
    note = _req("GET", f"/notes/{args.id}")
    print(f"Title:    {note['title']}")
    print(f"Category: {note.get('category', '')}")
    print(f"Tags:     {note.get('tags', '')}")
    print(f"Created:  {note.get('created_at', '')}")
    print(f"Updated:  {note.get('updated_at', '')}")
    print()
    print(note.get("content", ""))


def cmd_search(args):
    q = urllib.parse.urlencode({"q": args.query})
    results = _req("GET", f"/search?{q}")
    if not results:
        print("No matching notes found.")
        return
    for r in results:
        note_id = r.get("id", "?")
        score = r.get("score", 0)
        preview = (r.get("preview") or "")[:100]
        print(f"ID: {note_id} | Score: {score} | {r['title']} ({r.get('category','')})")
        if preview:
            print(f"   {preview}")
        print()


DETAIL_KEYWORDS = [
    "sdk", "dependency", "dependencies", "architecture",
    "implementation", "roadmap", "blueprint", "private",
    "full", "details", "setup", "workflow", "cause", "fix",
    "resolution", "commands",
]

CORE_BACKED_PHRASES = [
    "Full private details have been moved to Core",
    "Ask user for approved release",
]


def _is_core_backed(preview):
    for phrase in CORE_BACKED_PHRASES:
        if phrase in preview:
            return True
    return False


def _is_detail_seeking(question):
    punct = """?!.,:;'"()[]{}"""
    q = question.lower()
    for ch in punct:
        q = q.replace(ch, " ")
    words = set(q.split())
    for kw in DETAIL_KEYWORDS:
        if kw in words:
            return True
    return False


def cmd_ask(args):
    data = _req("POST", "/ask", {"question": args.question})
    notes = data.get("matched_notes") or []

    if notes and _is_detail_seeking(args.question):
        for n in notes:
            if _is_core_backed(n.get("preview") or ""):
                print("Cannot access. The data you asked for is in the Core/private layer. Try again if you want to request permission.")
                return

    print(data.get("answer", ""))
    print()
    if notes:
        print("Matched notes:")
        for n in notes:
            score = n.get("score", 0)
            print(f"  [{score:>2}] {n['title']}  ({n.get('category','')})")
            preview = (n.get("preview") or "")[:80]
            if preview:
                print(f"        {preview}")


def _read_add_content(args):
    content_sources = sum(
        1
        for value in (args.content, args.content_file, args.stdin_content)
        if value
    )
    if content_sources != 1:
        print(
            "Error: Provide exactly one of --content, --content-file, or --stdin-content.",
            file=sys.stderr,
        )
        sys.exit(1)

    if args.content_file:
        content_path = Path(args.content_file)
        if not content_path.exists():
            print(f"Error: content file not found: {args.content_file}", file=sys.stderr)
            sys.exit(1)
        content = content_path.read_text(encoding="utf-8-sig")
    elif args.stdin_content:
        content = sys.stdin.read()
    else:
        content = args.content

    if not content.strip():
        print("Error: note content cannot be empty.", file=sys.stderr)
        sys.exit(1)
    return content


def cmd_add(args):
    content = _read_add_content(args)

    body = {
        "title": args.title,
        "category": args.category,
        "tags": args.tags or "",
        "content": content,
    }

    note = _req("POST", "/notes", body)
    if note.get("status") == "duplicate":
        existing = note.get("note") or {}
        existing_id = note.get("existing_id") or existing.get("id")
        title = existing.get("title") or args.title
        print(f"Duplicate note already exists: ID {existing_id} - {title}")
        return

    print(f"Created note {note['id']}: {note['title']}")


def cmd_update(args):
    body = {
        "title": args.title,
        "category": args.category,
        "tags": args.tags or "",
        "content": args.content,
    }
    note = _req("PUT", f"/notes/{args.id}", body)
    print(f"Updated note {note['id']}: {note['title']}")


def cmd_topics():
    notes = _req("GET", "/notes")
    if not notes:
        print("No notes found.")
        return

    groups = {}
    order = []
    for n in notes:
        title = n.get("title", "")
        if " \u2014 " in title:
            parent = title.split(" \u2014 ", 1)[0].strip()
        elif " - " in title:
            parent = title.split(" - ", 1)[0].strip()
        else:
            parent = title
        if parent not in groups:
            groups[parent] = []
            order.append(parent)
        groups[parent].append(n)

    for parent in order:
        children = groups[parent]
        print(f"{parent} ({len(children)} notes)")
        for n in children:
            tags = n.get("tags") or ""
            print(f"  [{n['id']}] {n['title']}  ({n.get('category','')})  {tags}")
        print()


def _extract_parent(title):
    for sep in [" \u2014 ", " — ", " - "]:
        if sep in title:
            return title.split(sep, 1)[0].strip()
    return None


def cmd_organize_report():
    notes = _req("GET", "/notes")
    if not notes:
        print("No notes found.")
        return

    groups = {}
    ungrouped = list(notes)

    for n in list(ungrouped):
        parent = _extract_parent(n.get("title", ""))
        if parent:
            key = parent.lower()
            groups.setdefault(key, []).append(n)
            ungrouped.remove(n)

    for n in list(ungrouped):
        title_lower = n.get("title", "").lower()
        matched = False
        for key in list(groups.keys()):
            if title_lower.startswith(key) or key.startswith(title_lower):
                groups[key].append(n)
                ungrouped.remove(n)
                matched = True
                break
        if not matched:
            groups.setdefault(title_lower, []).append(n)
            ungrouped.remove(n)

    print("MegaMind Organization Report")
    print("=" * 50)
    print()
    print("Notes grouped by similar title prefixes:")
    print()

    suggestions = []
    for key, group in sorted(groups.items()):
        if len(group) < 2:
            continue
        titles = [n.get("title", "") for n in group]
        group_display = titles[0][:60] + "..." if len(titles[0]) > 60 else titles[0]
        print(f"  Possible duplicates under '{group_display}':")
        for n in group:
            tags = n.get("tags") or ""
            print(f"    [{n['id']}] {n['title']}  ({n.get('category','')})  {tags}")
        print()

        parent_name = _extract_parent(max(titles, key=len)) or max(titles, key=len)
        for n in group:
            note_title = n.get("title", "")
            if _extract_parent(note_title):
                continue
            child_part = note_title
            suggestions.append(
                f"  python tools/brain.py update {n['id']} \\\n"
                f'    --title "{parent_name} \u2014 {child_part}" \\\n'
                f'    --category "{n.get("category", "Projects")}" \\\n'
                f'    --tags "{n.get("tags", "")}" \\\n'
                f'    --content "..."'
            )

    if suggestions:
        print("Suggested rename commands (review and customize before running):")
        print()
        for s in suggestions:
            print(s)
            print()
    else:
        print("No duplicate groups detected. All topics look well-organized.")
        print()


def cmd_suggest_tags(args):
    title = (args.title or "").lower()
    content = (args.content or "").lower()
    category = (args.category or "").lower()

    raw = f"{title} {content}"

    # ---- Known projects and their canonical tags (Tier 1) ----
    KNOWN_PROJECTS = [
        ("muzic",  ["muzic-app", "music-app", "flutter", "android"]),
        ("musick", ["muzic-app", "music-app", "flutter", "android"]),
        ("megamind", ["megamind", "project-memory", "backend", "frontend", "agents"]),
        ("yesmusic", ["yesmusic", "music-app", "android"]),
    ]

    # ---- Technical term → canonical tag (Tier 2) ----
    TECH_MAP = {
        "just_audio": "just-audio",
        "just-audio": "just-audio",
        "invidious": "invidious",
        "flutter": "flutter",
        "android": "android",
        "react": "react",
        "vite": "vite",
        "fastapi": "fastapi",
        "sqlite": "sqlite",
        "frontend": "frontend",
        "backend": "backend",
        "python": "python",
        "dart": "dart",
        "typescript": "typescript",
        "javascript": "javascript",
        "opencode": "opencode",
        "openclaude": "openclaude",
        "gemini": "gemini-cli",
        "docker": "docker",
        "git": "git",
        "markdown": "markdown",
    }

    # ---- Generic term → purpose tag or None (Tier 3) ----
    WEAK_MAP = {
        "error": "bug-fix",
        "fix": "bug-fix",
        "fixed": "bug-fix",
        "fixes": "bug-fix",
        "fixing": "bug-fix",
        "issue": "bug-fix",
        "issues": "bug-fix",
        "bug": "bug-fix",
        "bugs": "bug-fix",
        "playback": "playback",
        "player": "playback",
        "audio": "playback",
        "ui": "ui",
        "interface": "ui",
        "design": "ui",
        "cleaner": "ui",
        "polish": "design",
        "setup": "setup",
        "config": "setup",
        "configuration": "setup",
        "progress": "project-progress",
        "blueprint": "blueprint",
    }

    # ---- Words never output as tags ----
    GENERIC = {
        "app", "api", "use", "new", "note", "notes", "added", "updated",
        "update", "using", "working", "done", "changed", "handling",
        "important", "project", "portfolio", "get", "getting", "went",
        "gone", "need", "needs", "make", "making", "take", "took",
        "going", "come", "came", "keep", "keeping", "set", "setting",
        "put", "putting", "let", "lets", "like", "look", "looking",
        "want", "wants", "know", "knowing", "seen", "saw", "see",
        "find", "found", "finding", "show", "showing", "tell", "told",
        "ask", "asked", "asking", "try", "trying", "help", "helps",
        "helping", "last", "next", "first", "second", "back", "still",
        "dark", "minimal", "theme", "note", "cards",
        "music", "song", "track", "tracks",
        "just", "also", "very", "too", "really", "some",
        "what", "do", "know", "about", "the", "and", "for", "with",
        "how", "that", "this", "you", "was", "were", "been", "being",
        "having", "doing", "after", "before", "during", "while", "when",
        "now", "then", "than",
    }

    # ---- Tokenizer ----
    punct = """?!.,:;'"()[]{}"""

    def tokenize(text):
        out = set()
        for w in text.split():
            w = w.strip(punct).strip("-").lower()
            if w and len(w) > 1:
                out.add(w)
        return out

    def ordered_tokens(text):
        out = []
        seen = set()
        for w in text.split():
            w = w.strip(punct).strip("-").lower()
            if w and len(w) > 1 and w not in seen:
                out.append(w)
                seen.add(w)
        return out

    input_tokens = tokenize(raw)
    ordered = ordered_tokens(raw)

    # ---- Tier 1: parent-project tags ----
    project_tags = []
    for keyword, tags in KNOWN_PROJECTS:
        if keyword in input_tokens or keyword in title:
            for t in tags:
                if t not in project_tags:
                    project_tags.append(t)

    seen = set(project_tags)

    # ---- Tiers 2-4: technical, purpose, fallback ----
    tech_tags = []
    purpose_tags = []
    fallback_tags = []

    for t in ordered:
        if t in TECH_MAP:
            canon = TECH_MAP[t]
            if canon not in seen:
                tech_tags.append(canon)
                seen.add(canon)
        elif t in WEAK_MAP:
            canon = WEAK_MAP[t]
            if canon and canon not in seen:
                purpose_tags.append(canon)
                seen.add(canon)
        elif t not in GENERIC and not t.isdigit() and len(t) >= 3:
            if t not in seen:
                fallback_tags.append(t)
                seen.add(t)

    # ---- Sort within tiers, then assemble by priority ----
    purpose_tags.sort()
    fallback_tags.sort()
    all_tags = project_tags + tech_tags + purpose_tags + fallback_tags
    print(",".join(all_tags[:8]))


def cmd_suggest_category(args):
    title = (args.title or "").lower()
    content = (args.content or "").lower()
    raw = f"{title} {content}"

    punct = """?!.,:;'"()[]{}"""
    clean = raw.translate(str.maketrans("", "", punct))
    clean_tokens = set(clean.split())

    def find(phrase):
        words = phrase.split()
        if len(words) == 1:
            return phrase in clean
        return all(w in clean_tokens for w in words)

    CATEGORIES = [
        ("Errors-Fixes", [
            "error", "bug", "crash", "failed", "failure", "issue",
            "fix", "fixed", "exception", "stacktrace", "traceback",
            "not working", "broke", "broken", "solved",
            "403", "forbidden", "build failed", "failed build",
        ]),
        ("Commands", [
            "command", "commands", "powershell", "bash", "terminal",
            "cli", "install", "run", "npm", "pip", "uvicorn",
            "flutter doctor", "git clone", "setup command",
        ]),
        ("Projects", [
            "project", "app", "tool", "product", "roadmap",
            "blueprint", "progress", "architecture", "feature",
            "features", "portfolio", "status", "build plan",
        ]),
        ("Tools-Models", [
            "model", "ai model", "openclaude", "opencode",
            "gemini cli", "claude", "gpt", "deepseek", "ollama",
            "copilot", "workflow", "agent stack", "tools",
        ]),
        ("Prompts", [
            "prompt", "system prompt", "agent prompt",
            "instruction", "reusable prompt", "use this in",
            "paste this",
        ]),
        ("Ideas", [
            "idea", "app idea", "feature idea", "concept",
            "brainstorm", "maybe build", "future idea",
        ]),
        ("Learning-Logs", [
            "learned", "lesson", "explanation", "concept note",
            "study", "understanding", "notes about",
            "what i learned",
        ]),
    ]

    TIEBREAKER = {name: i for i, (name, _) in enumerate(CATEGORIES)}
    # Lower index = higher priority (Errors-Fixes wins ties)

    scores = {}
    for name, keywords in CATEGORIES:
        score = 0
        for kw in keywords:
            weight = 2 if " " in kw else 1
            if find(kw):
                score += weight
        scores[name] = score

    best = max(scores, key=lambda n: (scores[n], -TIEBREAKER[n]))
    if scores[best] == 0:
        best = "Projects"

    print(best)


BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ensure_dirs():
    for d in ["data/release_requests/pending", "data/release_requests/approved",
              "data/release_requests/rejected", "data/audit"]:
        os.makedirs(os.path.join(BASE, d), exist_ok=True)


def cmd_request_core(args):
    _ensure_dirs()
    now = datetime.datetime.now()
    req_id = f"req_{now.strftime('%Y%m%d_%H%M%S')}"
    body = {
        "id": req_id,
        "requested_by": "agent",
        "topic": args.topic,
        "reason": args.reason,
        "status": "pending",
        "created_at": now.isoformat(),
    }
    path = os.path.join(BASE, "data", "release_requests", "pending", f"{req_id}.json")
    with open(path, "w") as f:
        json.dump(body, f, indent=2)
    print(f"Core release request created: {req_id}")
    print("Waiting for user approval.")
    print("Agents cannot access Core directly.")


def cmd_list_core_requests(args):
    _ensure_dirs()
    pending_dir = os.path.join(BASE, "data", "release_requests", "pending")
    files = sorted(os.listdir(pending_dir))
    if not files:
        print("No pending core release requests.")
        return
    for fname in files:
        if not fname.endswith(".json"):
            continue
        path = os.path.join(pending_dir, fname)
        with open(path) as f:
            data = json.load(f)
        print(f"{data['id']}  {data['topic']:50s}  {data['reason']:50s}  {data['created_at']}")


def cmd_delete(args):
    if not args.yes:
        resp = input(f"Delete note {args.id}? [y/N] ")
        if resp.lower() not in ("y", "yes"):
            print("Cancelled.")
            return
    _req("DELETE", f"/notes/{args.id}")
    print(f"Deleted note {args.id}.")


def main():
    parser = argparse.ArgumentParser(prog="brain", description="MegaMind CLI helper")
    sub = parser.add_subparsers(dest="command")

    p_health = sub.add_parser("health", help="Check backend health")

    p_list = sub.add_parser("list", help="List all notes")

    p_index = sub.add_parser("index", help="Show compact topic index of all notes")

    p_get = sub.add_parser("get", help="Get a note by ID")
    p_get.add_argument("id", type=int)

    p_search = sub.add_parser("search", help="Search notes")
    p_search.add_argument("query", help="Search query")

    p_ask = sub.add_parser("ask", help="Ask the brain a question")
    p_ask.add_argument("question", help="Natural language question")

    p_add = sub.add_parser("add", help="Create a new note")
    p_add.add_argument("--title", required=True)
    p_add.add_argument("--category", default="Projects")
    p_add.add_argument("--tags", default="")
    p_add.add_argument("--content")
    p_add.add_argument("--content-file")
    p_add.add_argument("--stdin-content", action="store_true")

    p_del = sub.add_parser("delete", help="Delete a note")
    p_del.add_argument("id", type=int)
    p_del.add_argument("--yes", action="store_true", help="Skip confirmation")

    p_upd = sub.add_parser("update", help="Update a note by ID")
    p_upd.add_argument("id", type=int)
    p_upd.add_argument("--title", required=True)
    p_upd.add_argument("--category", default="Projects")
    p_upd.add_argument("--tags", default="")
    p_upd.add_argument("--content", required=True)

    p_topics = sub.add_parser("topics", help="Show notes grouped by parent topic")

    p_org = sub.add_parser("organize-report", help="Detect possible duplicate/similar titled notes")

    p_tags = sub.add_parser("suggest-tags", help="Suggest tags for a new note based on title, content, and existing notes")
    p_tags.add_argument("--title", required=True)
    p_tags.add_argument("--category", default="Projects")
    p_tags.add_argument("--content", required=True)

    p_cat = sub.add_parser("suggest-category", help="Suggest a category based on title and content")
    p_cat.add_argument("--title", required=True)
    p_cat.add_argument("--content", required=True)

    p_req = sub.add_parser("request-core", help="Request release of Core Layer info into the Window Layer")
    p_req.add_argument("--topic", required=True)
    p_req.add_argument("--reason", required=True)

    p_lst = sub.add_parser("list-core-requests", help="List pending core release requests")

    args = parser.parse_args()

    if args.command == "health":
        cmd_health()
    elif args.command == "list":
        cmd_list()
    elif args.command == "index":
        cmd_index()
    elif args.command == "get":
        cmd_get(args)
    elif args.command == "search":
        cmd_search(args)
    elif args.command == "ask":
        cmd_ask(args)
    elif args.command == "add":
        cmd_add(args)
    elif args.command == "update":
        cmd_update(args)
    elif args.command == "topics":
        cmd_topics()
    elif args.command == "organize-report":
        cmd_organize_report()
    elif args.command == "suggest-tags":
        cmd_suggest_tags(args)
    elif args.command == "suggest-category":
        cmd_suggest_category(args)
    elif args.command == "request-core":
        cmd_request_core(args)
    elif args.command == "list-core-requests":
        cmd_list_core_requests(args)
    elif args.command == "delete":
        cmd_delete(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
