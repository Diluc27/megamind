import subprocess
import sys

content = r"""After the last saved checkpoint "MegaMind Mobile - Vault Icon Cleanup" (ID 33), MegaMind Mobile Phase 6 Visual Graph work was completed.

The graph feature was upgraded using the Flutter design reference from C:\Users\Sm1th\megamind_mobile\Design\main.dart and applied to the real app screen at C:\Users\Sm1th\megamind_mobile\lib\screens\graph_screen.dart. The mistake where OpenClaude created or edited separate demo files was corrected: the real app graph screen was patched, not lib/main.dart, and no new Flutter project is part of the final implementation.

The final graph design now uses the animated universe/Obsidian-like visual style from the design file, including a starfield-style background, glowing graph nodes, animated visual movement, graph edges, zoom controls, tooltip behavior, and a premium dark MegaMind aesthetic. The graph still uses real app data through NotesRepository and GraphBuilderService instead of static demo nodes.

Privacy rules were preserved. The graph can show normal, locked, and restricted note titles as graph nodes. Locked and restricted note content, body text, and snippets are never shown in graph UI. Tapping locked or restricted note nodes still requires biometric authentication before opening. Category and tag nodes show related note titles only. Restricted notes remain local_only and locked. Sync behavior was not changed: locked, restricted, local_only, and deleted notes continue to be skipped.

A leftover unused import in lib/screens/graph_screen.dart was removed: ../models/graph_edge.dart. Bracket checks passed. Targeted graph_screen.dart analyzer issues were resolved. Debug APK build succeeded at build\app\outputs\flutter-apk\app-debug.apk. Full flutter analyze may still complain if Design/main.dart remains inside the project as a .dart reference file, because Flutter analyzer scans it even though it is only a design reference. Recommended cleanup later: rename Design/main.dart to a non-Dart reference filename after its design is fully integrated.

The uploaded HTML graph design node_graph_final.html is preserved as a future MegaMind Web/frontend graph design reference. It should be reused later for the MegaMind webpage graph UI, likely in the React/Vite frontend, while preserving the same privacy rules.

Next Plans:
1. Real phone verification for Phase 6 Visual Graph:
   - Open graph from the home graph icon.
   - Confirm animated universe graph design appears.
   - Confirm node drag, zoom, tooltip, and tap behavior works.
   - Confirm normal note node opens normally.
   - Confirm locked/restricted note nodes require biometric.
   - Confirm category/tag nodes show title-only related notes.

2. Clean Design folder after graph verification:
   - Keep node_graph_final.html as future MegaMind Web graph reference.
   - Rename Design/main.dart to something like main_design_reference.txt or graph_design_reference.dart.ignore so flutter analyze does not scan it.
   - Do not delete it until the mobile graph design is fully verified.

3. Save a final tested checkpoint after phone verification:
   - Add a MegaMind note confirming graph works on Samsung A35.
   - Include any bugs found and fixes applied.

4. Future MegaMind Web Graph:
   - Reuse node_graph_final.html for the web frontend graph design.
   - Convert it into the MegaMind React/Vite frontend.
   - Use backend Window Layer notes as graph data.
   - Keep locked/restricted content private.
   - Titles/categories/tags can be graph index metadata.
   - Content/snippets must not appear for private nodes.

5. Future Mobile Graph upgrades:
   - Add graph filters: All, Notes, Tags, Categories, Locked, Restricted.
   - Add search inside graph by title/tag/category only.
   - Add tap on tag/category to filter graph view.
   - Add optional mini-map or reset-layout button.
   - Add performance guard for large note counts.

6. Future Sync upgrades:
   - Keep current Mobile to Window push sync as default.
   - Later add optional pull/sync status viewer, but do not pull Core/private data.
   - Locked/restricted/local_only/deleted notes must continue to skip sync.

7. Future Core viewer:
   - Only with explicit user opt-in.
   - Core Space visible only when backend is connected and user intentionally unlocks/approves.
   - Never auto-sync Core to mobile.
   - Core should remain private-first and user-controlled.

8. AI agent workflow rules:
   - Use APDS before every project task.
   - Do not create new Flutter projects unless explicitly asked.
   - Patch the existing app only.
   - Long tasks go to OpenClaude.
   - If worktree/subagents fail, stop retrying and continue without subagents or ask user.
   - Activate Megawork means run C:\Users\Sm1th\megamind\activate_megawork.py, fresh-restart backend/frontend, then verify ports 8000 and 5173.
"""

cmd = [
    sys.executable,
    "tools\\brain.py",
    "add",
    "--title", "MegaMind Mobile - Visual Graph Phase 6 Complete and Next Plans",
    "--category", "Projects",
    "--tags", "megamind-mobile,flutter,visual-graph,obsidian-graph,graph-screen,privacy,locked-notes,restricted-notes,phase-6,next-plans",
    "--content", content,
]

subprocess.run(cmd, check=True)