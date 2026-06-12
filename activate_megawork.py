import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = r"C:\Users\Sm1th\megamind"
FRONTEND = r"C:\Users\Sm1th\megamind\frontend"
PYTHON = r"C:\Users\Sm1th\megamind\.venv\Scripts\python.exe"
TAB_DIR = os.path.join(tempfile.gettempdir(), "megamind_megawork_tabs")
WINDOW_NAME = f"MegaWork-{os.getpid()}-{int(time.time())}"
WINDOW_NAME_FILE = os.path.join(ROOT, ".megawork_window.name")


def resolve_npm():
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if npm:
        return os.path.realpath(npm)

    fallbacks = [
        r"C:\Program Files\nodejs\npm.cmd",
        r"C:\Users\Sm1th\AppData\Roaming\npm\npm.cmd",
        r"F:\npm.cmd",
        r"F:\npm",
    ]
    for path in fallbacks:
        if os.path.exists(path):
            return os.path.realpath(path)

    return None


def resolve_node():
    node = shutil.which("node.exe") or shutil.which("node")
    if node:
        return os.path.realpath(node)

    fallbacks = [
        r"F:\node.exe",
        r"C:\Program Files\nodejs\node.exe",
    ]
    for path in fallbacks:
        if os.path.exists(path):
            return os.path.realpath(path)

    return None


def resolve_wt():
    wt = shutil.which("wt.exe") or shutil.which("wt")
    if wt:
        return os.path.realpath(wt)

    fallbacks = [
        os.path.join(os.environ.get("LOCALAPPDATA", ""), r"Microsoft\WindowsApps\wt.exe"),
        r"C:\Users\Sm1th\AppData\Local\Microsoft\WindowsApps\wt.exe",
    ]
    for path in fallbacks:
        if path and os.path.exists(path):
            return path

    return None


def ps_quote(value):
    return "'" + value.replace("'", "''") + "'"


def write_script(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def save_megawork_window_name():
    with open(WINDOW_NAME_FILE, "w", encoding="utf-8") as f:
        f.write(WINDOW_NAME)
    print(f"MegaWork Windows Terminal marker saved: {WINDOW_NAME}")


def tab_script(title, body):
    tab_title = f"{WINDOW_NAME} {title}"
    return f"""
$Host.UI.RawUI.WindowTitle = {ps_quote(tab_title)}
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location {ps_quote(ROOT)}
Clear-Host
Write-Host {ps_quote(tab_title)} -ForegroundColor Cyan
Write-Host {ps_quote('MegaWork tab started. Run stop_megawork.py to stop and close it.')} -ForegroundColor DarkGray
Write-Host ""
{body}
Write-Host ""
Write-Host {ps_quote(tab_title + ' exited.')} -ForegroundColor Yellow
exit
""".lstrip()


def cleanup_script(tab_paths):
    escaped_tab_names = ", ".join(ps_quote(os.path.basename(path)) for path in tab_paths)
    return rf'''
$ErrorActionPreference = "SilentlyContinue"
Write-Host "Clearing old MegaWork tabs/processes only..." -ForegroundColor Yellow

$tabScriptNames = @({escaped_tab_names})
Get-CimInstance Win32_Process | Where-Object {{
    $cmd = $_.CommandLine
    if (-not $cmd) {{
        $false
    }} else {{
        $matchesTab = $false
        foreach ($name in $tabScriptNames) {{
            if ($cmd -match [regex]::Escape($name)) {{ $matchesTab = $true }}
        }}
        $matchesTab
    }}
}} | ForEach-Object {{
    Write-Host "Closing existing MegaWork tab shell PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force
}}

# Stop orphan watcher processes from prior tabs/controller windows.
Get-CimInstance Win32_Process | Where-Object {{
    $_.CommandLine -match "tools\\shelfd_watcher.py" -or
    $_.CommandLine -match "tools/shelfd_watcher.py"
}} | ForEach-Object {{
    Write-Host "Stopping Shelfd watcher PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force
}}

# Stop Claude session tracker.
Get-CimInstance Win32_Process | Where-Object {{
    $_.CommandLine -match "claude_session_tracker.py"
}} | ForEach-Object {{
    Write-Host "Stopping Claude tracker PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force
}}

# Stop ngrok tunnels tied to MegaMind backend.
Get-CimInstance Win32_Process | Where-Object {{
    $_.CommandLine -match "ngrok" -and $_.CommandLine -match "http" -and $_.CommandLine -match "8000"
}} | ForEach-Object {{
    Write-Host "Stopping ngrok tunnel PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force
}}

# Stop old backend/frontend listeners by port.
foreach ($port in @(8000, 5173)) {{
    Get-NetTCPConnection -LocalPort $port | ForEach-Object {{
        if ($_.OwningProcess -and $_.OwningProcess -ne 0) {{
            Write-Host "Stopping process on port $port PID $($_.OwningProcess)" -ForegroundColor DarkYellow
            Stop-Process -Id $_.OwningProcess -Force
        }}
    }}
}}

Start-Sleep -Seconds 2
'''.lstrip()


def run_cleanup(tab_paths):
    cleanup_path = os.path.join(tempfile.gettempdir(), "megamind_megawork_cleanup.ps1")
    write_script(cleanup_path, cleanup_script(tab_paths))
    subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            cleanup_path,
        ],
        check=False,
    )


def build_tabs(npm_path, node_path):
    tabs = []

    backend_path = os.path.join(TAB_DIR, "megawork_backend_tab.ps1")
    write_script(
        backend_path,
        tab_script(
            "MegaWork Backend",
            f"& {ps_quote(PYTHON)} -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload",
        ),
    )
    tabs.append(("Backend", backend_path))

    ngrok_path = os.path.join(TAB_DIR, "megawork_ngrok_tab.ps1")
    write_script(
        ngrok_path,
        tab_script(
            "MegaWork Ngrok",
            f"Start-Sleep -Seconds 2\n& {ps_quote(PYTHON)} activate_ngrok.py",
        ),
    )
    tabs.append(("Ngrok", ngrok_path))

    watcher_path = os.path.join(TAB_DIR, "megawork_watcher_tab.ps1")
    write_script(
        watcher_path,
        tab_script(
            "MegaWork Shelfd Watcher",
            f"$env:Path = 'C:\\Users\\Sm1th\\AppData\\Roaming\\npm;C:\\Users\\Sm1th\\nodejs;' + $env:Path\nStart-Sleep -Seconds 7\n& {ps_quote(PYTHON)} tools\\shelfd_watcher.py",
        ),
    )
    tabs.append(("Shelfd Watcher", watcher_path))

    tracker_path = os.path.join(TAB_DIR, "megawork_tracker_tab.ps1")
    write_script(
        tracker_path,
        tab_script(
            "Claude Tracker",
            f"Start-Sleep -Seconds 3\n& {ps_quote(PYTHON)} tools\\claude_session_tracker.py",
        ),
    )
    tabs.append(("Claude Tracker", tracker_path))

    if npm_path and node_path:
        frontend_path = os.path.join(TAB_DIR, "megawork_frontend_tab.ps1")
        node_dir = os.path.dirname(node_path)
        write_script(
            frontend_path,
            tab_script(
                "MegaWork Frontend",
                f"Set-Location {ps_quote(FRONTEND)}\n$env:Path = {ps_quote(node_dir + ';')} + $env:Path\n& {ps_quote(npm_path)} run dev -- --host 0.0.0.0",
            ),
        )
        tabs.append(("Frontend", frontend_path))
    else:
        frontend_path = os.path.join(TAB_DIR, "megawork_frontend_tab.ps1")
        reason = "npm not found" if not npm_path else "node not found"
        write_script(
            frontend_path,
            tab_script(
                "MegaWork Frontend",
                f"Write-Host {ps_quote('Frontend skipped: ' + reason)} -ForegroundColor Yellow",
            ),
        )
        tabs.append(("Frontend", frontend_path))

    return tabs


def launch_tabs(wt_path, tabs):
    save_megawork_window_name()
    args = [wt_path, "-w", WINDOW_NAME]
    for index, (title, script_path) in enumerate(tabs):
        if index > 0:
            args.append(";")
        args.extend(
            [
                "new-tab",
                "--title",
                f"{WINDOW_NAME} {title}",
                "--suppressApplicationTitle",
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                script_path,
            ]
        )
    subprocess.Popen(args)


def main():
    if platform.system().lower() != "windows":
        print("MegaWork tab launcher must be run with Windows Python/PowerShell.")
        print(r"Use: powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"Set-Location 'C:\Users\Sm1th\megamind'; python .\activate_megawork.py\"")
        return 1

    wt_path = resolve_wt()
    if not wt_path:
        print("Windows Terminal wt.exe not found. Install/open Windows Terminal to use tabbed MegaWork.")
        return 1

    npm_path = resolve_npm()
    node_path = resolve_node()
    print(f"Windows Terminal resolved: {wt_path}")
    print(f"npm resolved: {npm_path}" if npm_path else "npm not found")
    print(f"node resolved: {node_path}" if node_path else "node not found")

    tabs = build_tabs(npm_path, node_path)
    run_cleanup([path for _, path in tabs])
    launch_tabs(wt_path, tabs)

    print("MegaWork activated fresh in one Windows Terminal window with service tabs.")
    print("Tabs: Backend, Ngrok, Shelfd Watcher, Claude Tracker, Frontend")
    print("Backend:  http://127.0.0.1:8000")
    print("ngrok:    http://127.0.0.1:4040")
    if npm_path and node_path:
        print("Frontend: http://localhost:5173")
    return 0


if __name__ == "__main__":
    sys.exit(main())
