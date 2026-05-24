import platform
import subprocess
import sys

IS_WINDOWS = platform.system().lower() == "windows"

PS_SCRIPT = r'''
$Host.UI.RawUI.WindowTitle = "Stop MegaWork - MegaMind"

Write-Host "Stopping MegaMind backend/frontend..." -ForegroundColor Yellow

# Stop PowerShell jobs in this session if they exist
Get-Job -Name MegaMindBackend, MegaMindFrontend -ErrorAction SilentlyContinue | Stop-Job -ErrorAction SilentlyContinue
Get-Job -Name MegaMindBackend, MegaMindFrontend -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue

# Kill MegaWork controller windows/scripts
Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match "MegaWork - MegaMind" -or
    $_.CommandLine -match "activate_megawork.py"
} | ForEach-Object {
    Write-Host "Killing MegaWork controller PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Kill uvicorn/backend workers, including orphan multiprocessing children
Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -match "uvicorn" -or
    $_.CommandLine -match "app.main" -or
    $_.CommandLine -match "multiprocessing.spawn"
} | ForEach-Object {
    Write-Host "Killing backend worker PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Kill frontend/vite/npm processes tied to MegaMind frontend
Get-CimInstance Win32_Process | Where-Object {
    ($_.CommandLine -match "megamind\\frontend" -and ($_.CommandLine -match "npm" -or $_.CommandLine -match "vite" -or $_.CommandLine -match "node")) -or
    ($_.CommandLine -match "vite" -and $_.CommandLine -match "5173")
} | ForEach-Object {
    Write-Host "Killing frontend worker PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Kill anything still listening on ports 8000 or 5173
1..5 | ForEach-Object {
    foreach ($port in @(8000, 5173)) {
        $lines = netstat -ano | Select-String ":$port" | Select-String "LISTENING"
        foreach ($line in $lines) {
            $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
            $ownerPid = $parts[-1]

            if ($ownerPid -and $ownerPid -ne "0") {
                Write-Host "Killing listener on port $port PID $ownerPid" -ForegroundColor DarkYellow
                taskkill /PID $ownerPid /F 2>$null
            }
        }
    }
    Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "Final port check:" -ForegroundColor Cyan
$backend = netstat -ano | Select-String ":8000" | Select-String "LISTENING"
$frontend = netstat -ano | Select-String ":5173" | Select-String "LISTENING"

if (-not $backend -and -not $frontend) {
    Write-Host "MegaWork stopped successfully. No backend/frontend listeners found." -ForegroundColor Green
} else {
    Write-Host "Some listeners may still remain:" -ForegroundColor Red
    netstat -ano | Select-String ":8000|:5173"
    Write-Host ""
    Write-Host "If PIDs do not exist in taskkill, check orphan Python workers with:" -ForegroundColor Yellow
    Write-Host "Get-CimInstance Win32_Process | Where-Object { `$_.CommandLine -match 'multiprocessing.spawn|uvicorn|app.main' }"
}

Write-Host ""
Write-Host "Done."
'''

def run_windows_powershell():
    subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            PS_SCRIPT,
        ],
        check=False,
    )

def run_wsl_powershell():
    powershell = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
    subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            PS_SCRIPT,
        ],
        check=False,
    )

def main():
    if IS_WINDOWS:
        run_windows_powershell()
    else:
        run_wsl_powershell()

if __name__ == "__main__":
    main()