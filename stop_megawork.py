import platform
import subprocess
import sys

IS_WINDOWS = platform.system().lower() == "windows"

PS_SCRIPT = r'''
$Host.UI.RawUI.WindowTitle = "Stop MegaWork - MegaMind"
$selfPid = $PID
$megaWorkWindowPidFile = "C:\Users\Sm1th\megamind\.megawork_window.pid"
$megaWorkWindowNameFile = "C:\Users\Sm1th\megamind\.megawork_window.name"

function Close-MegaWorkWindowByMarker {
    param([string]$Marker)

    if (-not $Marker) {
        return
    }

    $signature = @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class MegaWorkWindowApi {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    public delegate bool EnumChildWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr hWndParent, EnumChildWindowsProc enumProc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder className, int count);

    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
"@
    if (-not ("MegaWorkWindowApi" -as [type])) {
        Add-Type -TypeDefinition $signature
    }

    function Confirm-WindowsTerminalCloseAllDialog {
        param([IntPtr]$WindowHandle, [int]$TerminalProcessId)

        Start-Sleep -Milliseconds 1200
        $script:clickedCloseAllButton = $false

        try {
            Add-Type -AssemblyName UIAutomationClient -ErrorAction SilentlyContinue
            Add-Type -AssemblyName UIAutomationTypes -ErrorAction SilentlyContinue
            $automationRoot = [System.Windows.Automation.AutomationElement]::FromHandle($WindowHandle)
            if ($automationRoot) {
                $buttonCondition = New-Object System.Windows.Automation.PropertyCondition(
                    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                    [System.Windows.Automation.ControlType]::Button
                )
                $buttons = $automationRoot.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
                foreach ($button in $buttons) {
                    $buttonName = $button.Current.Name
                    if ($buttonName -match "Close all|Close tabs|Yes") {
                        Write-Host "Confirming Windows Terminal dialog button '$buttonName'" -ForegroundColor DarkYellow
                        $invokePattern = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
                        $invokePattern.Invoke()
                        $script:clickedCloseAllButton = $true
                        return
                    }
                }
            }
        } catch {
            Write-Host "UI Automation close-confirmation failed: $($_.Exception.Message)" -ForegroundColor DarkGray
        }

        [MegaWorkWindowApi]::EnumWindows({
            param($dialogHwnd, $lParam)
            if (-not [MegaWorkWindowApi]::IsWindowVisible($dialogHwnd)) {
                return $true
            }

            $dialogOwnerProcessId = 0
            [void][MegaWorkWindowApi]::GetWindowThreadProcessId($dialogHwnd, [ref]$dialogOwnerProcessId)
            if ($dialogOwnerProcessId -ne $TerminalProcessId) {
                return $true
            }

            $classBuilder = New-Object System.Text.StringBuilder 256
            [void][MegaWorkWindowApi]::GetClassName($dialogHwnd, $classBuilder, $classBuilder.Capacity)
            $dialogClass = $classBuilder.ToString()
            if ($dialogClass -ne "#32770") {
                return $true
            }

            [MegaWorkWindowApi]::EnumChildWindows($dialogHwnd, {
                param($childHwnd, $childLParam)
                $buttonTextBuilder = New-Object System.Text.StringBuilder 256
                [void][MegaWorkWindowApi]::GetWindowText($childHwnd, $buttonTextBuilder, $buttonTextBuilder.Capacity)
                $buttonText = $buttonTextBuilder.ToString()
                if ($buttonText -match "Close all|Close tabs|Yes") {
                    Write-Host "Confirming Windows Terminal dialog button '$buttonText'" -ForegroundColor DarkYellow
                    [void][MegaWorkWindowApi]::SendMessage($childHwnd, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero)
                    $script:clickedCloseAllButton = $true
                    return $false
                }
                return $true
            }, [IntPtr]::Zero) | Out-Null

            if ($script:clickedCloseAllButton) {
                return $false
            }
            return $true
        }, [IntPtr]::Zero) | Out-Null

        if (-not $script:clickedCloseAllButton) {
            Write-Host "No Windows Terminal close-confirmation button found." -ForegroundColor DarkGray
        }
    }

    $script:closedMegaWorkWindow = $false
    [MegaWorkWindowApi]::EnumWindows({
        param($hWnd, $lParam)
        if (-not [MegaWorkWindowApi]::IsWindowVisible($hWnd)) {
            return $true
        }

        $ownerProcessId = 0
        [void][MegaWorkWindowApi]::GetWindowThreadProcessId($hWnd, [ref]$ownerProcessId)
        $ownerProcess = Get-Process -Id $ownerProcessId -ErrorAction SilentlyContinue
        if (-not $ownerProcess) {
            return $true
        }

        $titleBuilder = New-Object System.Text.StringBuilder 512
        [void][MegaWorkWindowApi]::GetWindowText($hWnd, $titleBuilder, $titleBuilder.Capacity)
        $windowTitle = $titleBuilder.ToString()
        if ($windowTitle -like "*$Marker*") {
            if ($ownerProcess.ProcessName -eq "WindowsTerminal") {
            Write-Host "Closing MegaWork Windows Terminal window '$windowTitle'" -ForegroundColor DarkYellow
            [void][MegaWorkWindowApi]::SendMessage($hWnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
            Confirm-WindowsTerminalCloseAllDialog $hWnd $ownerProcessId
            } else {
                Write-Host "Force-closing marked MegaWork window '$windowTitle' owned by $($ownerProcess.ProcessName) PID $ownerProcessId" -ForegroundColor DarkYellow
                Stop-Process -Id $ownerProcessId -Force -ErrorAction SilentlyContinue
            }
            $script:closedMegaWorkWindow = $true
        }

        return $true
    }, [IntPtr]::Zero) | Out-Null

    if (-not $script:closedMegaWorkWindow) {
        Write-Host "No Windows Terminal window found with MegaWork marker '$Marker'." -ForegroundColor DarkGray
    }
}

Write-Host "Stopping MegaMind backend/frontend/watcher/ngrok..." -ForegroundColor Yellow

# Stop PowerShell jobs in this session if they exist
Get-Job -Name MegaMindBackend, MegaMindFrontend, MegaMindWatcher, MegaMindNgrok -ErrorAction SilentlyContinue | Stop-Job -ErrorAction SilentlyContinue
Get-Job -Name MegaMindBackend, MegaMindFrontend, MegaMindWatcher, MegaMindNgrok -ErrorAction SilentlyContinue | Remove-Job -Force -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath $megaWorkWindowNameFile) {
    $megaWorkWindowName = (Get-Content -LiteralPath $megaWorkWindowNameFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
    Close-MegaWorkWindowByMarker $megaWorkWindowName
}
Close-MegaWorkWindowByMarker "MegaWork-"

# Close only MegaWork service tab shells.
$tabScriptNames = @(
    "megawork_backend_tab.ps1",
    "megawork_frontend_tab.ps1",
    "megawork_watcher_tab.ps1",
    "megawork_ngrok_tab.ps1",
    "megawork_tracker_tab.ps1"
)
Get-CimInstance Win32_Process | Where-Object {
    if ($_.ProcessId -eq $selfPid) {
        $false
    } else {
        $cmd = $_.CommandLine
        if (-not $cmd) {
            $false
        } else {
            $matchesTab = $false
            foreach ($name in $tabScriptNames) {
                if ($cmd -match [regex]::Escape($name)) { $matchesTab = $true }
            }
            $matchesTab
        }
    }
} | ForEach-Object {
    Write-Host "Closing MegaWork tab shell PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Kill MegaWork controller windows/scripts
Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $selfPid -and (
        $_.CommandLine -match "MegaWork - MegaMind" -or
        $_.CommandLine -match "activate_megawork.py"
    )
} | ForEach-Object {
    Write-Host "Killing MegaWork controller PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Kill Shelfd watcher workers
Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $selfPid -and (
        $_.CommandLine -match "tools\\shelfd_watcher.py" -or
        $_.CommandLine -match "tools/shelfd_watcher.py"
    )
} | ForEach-Object {
    Write-Host "Killing Shelfd watcher PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Kill Claude session tracker
Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $selfPid -and $_.CommandLine -match "claude_session_tracker.py"
} | ForEach-Object {
    Write-Host "Killing Claude tracker PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Kill ngrok tunnels tied to MegaMind backend
Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $selfPid -and $_.CommandLine -match "ngrok" -and $_.CommandLine -match "http" -and $_.CommandLine -match "8000"
} | ForEach-Object {
    Write-Host "Killing ngrok tunnel PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Kill uvicorn/backend workers, including orphan multiprocessing children
Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $selfPid -and (
        $_.CommandLine -match "uvicorn" -or
        $_.CommandLine -match "app.main" -or
        $_.CommandLine -match "multiprocessing.spawn"
    )
} | ForEach-Object {
    Write-Host "Killing backend worker PID $($_.ProcessId)" -ForegroundColor DarkYellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Kill frontend/vite/npm processes tied to MegaMind frontend
Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $selfPid -and (
        ($_.CommandLine -match "megamind\\frontend" -and ($_.CommandLine -match "npm" -or $_.CommandLine -match "vite" -or $_.CommandLine -match "node")) -or
        ($_.CommandLine -match "vite" -and $_.CommandLine -match "5173")
    )
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

# Remove saved MegaWork window marker files after cleanup.
Remove-Item -LiteralPath $megaWorkWindowNameFile -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $megaWorkWindowPidFile -Force -ErrorAction SilentlyContinue

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
