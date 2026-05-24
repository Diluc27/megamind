import os
import platform
import shutil
import subprocess
import sys

ROOT = r"C:\Users\Sm1th\megamind"
FRONTEND = r"C:\Users\Sm1th\megamind\frontend"


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


NPM_PATH = resolve_npm()
NODE_PATH = resolve_node()

if NODE_PATH:
    NODE_DIR = os.path.dirname(NODE_PATH)
    print(f"npm resolved: {NPM_PATH}") if NPM_PATH else None
    print(f"node resolved: {NODE_PATH}")
else:
    print("node not found")

if not NPM_PATH:
    print("Frontend skipped: npm not found. Backend is still running.")
elif not NODE_PATH:
    print("Frontend skipped: node not found. Backend is still running.")

ps_script = rf'''
$Host.UI.RawUI.WindowTitle = "MegaWork - MegaMind"

Write-Host "Cleaning old MegaMind backend/frontend processes..." -ForegroundColor Yellow

# Stop old PowerShell jobs in this session if they exist
Get-Job -Name MegaMindBackend, MegaMindFrontend -ErrorAction SilentlyContinue | Stop-Job -ErrorAction SilentlyContinue
Get-Job -Name MegaMindBackend, MegaMindFrontend -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue

# Stop old backend/frontend processes by port
$ports = @(8000, 5173)
foreach ($port in $ports) {{
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {{
        if ($conn.OwningProcess -and $conn.OwningProcess -ne 0) {{
            Write-Host "Stopping process on port $port PID $($conn.OwningProcess)" -ForegroundColor DarkYellow
            Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        }}
    }}
}}

Start-Sleep -Seconds 2

Write-Host "Starting MegaMind Backend..." -ForegroundColor Green
Start-Job -Name "MegaMindBackend" -ScriptBlock {{
    Set-Location "{ROOT}"
    .\.venv\Scripts\Activate.ps1
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
}} | Out-Null

Start-Sleep -Seconds 2
'''

if NPM_PATH and NODE_PATH:
    ps_script += rf'''
Write-Host "npm resolved: {NPM_PATH}" -ForegroundColor Cyan
Write-Host "node resolved: {NODE_PATH}" -ForegroundColor Cyan
Write-Host "Starting MegaMind Frontend..." -ForegroundColor Green
Start-Job -Name "MegaMindFrontend" -ScriptBlock {{
    Set-Location "{FRONTEND}"
    $env:Path = "{NODE_DIR};$env:Path"
    & "{NPM_PATH}" run dev -- --host 0.0.0.0
}} | Out-Null
'''
elif not NPM_PATH:
    ps_script += r'''
Write-Host "Frontend skipped: npm not found. Backend is still running." -ForegroundColor Yellow
'''
else:
    ps_script += r'''
Write-Host "Frontend skipped: node not found. Backend is still running." -ForegroundColor Yellow
'''

ps_script += rf'''
Write-Host ""
Write-Host "MegaWork activated fresh." -ForegroundColor Cyan
Write-Host "Backend:  http://127.0.0.1:8000" -ForegroundColor Yellow
'''
if NPM_PATH and NODE_PATH:
    ps_script += r'Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow' + '\n'

ps_script += rf'''
Write-Host ""
Write-Host "Stop commands, run inside this MegaWork PowerShell:" -ForegroundColor Cyan
Write-Host "  Get-Job"
Write-Host "  Stop-Job -Name MegaMindBackend, MegaMindFrontend"
Write-Host "  Remove-Job -Name MegaMindBackend, MegaMindFrontend"
Write-Host ""
Write-Host "Live output:" -ForegroundColor Green

while ($true) {{
    Receive-Job -Name MegaMindBackend
    Receive-Job -Name MegaMindFrontend
    Start-Sleep -Seconds 2
}}
'''

is_windows = platform.system().lower() == "windows"

if is_windows:
    subprocess.Popen(
        ["powershell", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
        creationflags=subprocess.CREATE_NEW_CONSOLE
    )
else:
    powershell = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
    subprocess.Popen(
        [powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_script],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

print("MegaWork activated fresh in one PowerShell window using background jobs.")