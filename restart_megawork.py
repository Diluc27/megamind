import platform
import subprocess
import sys
import time

ROOT = r"C:\Users\Sm1th\megamind"
IS_WINDOWS = platform.system().lower() == "windows"


def run_windows_powershell(script):
    subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            f"Set-Location {ROOT}; python {script}",
        ],
        check=False,
    )


def run_wsl_powershell(script):
    powershell = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe"
    subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            f"Set-Location '{ROOT}'; python {script}",
        ],
        check=False,
    )


def run(script):
    if IS_WINDOWS:
        run_windows_powershell(script)
    else:
        run_wsl_powershell(script)


def main():
    print("Restarting MegaWork...")
    print("Step 1: Stopping all tabs and processes...")
    run("stop_megawork.py")
    print("Waiting for ports to release...")
    time.sleep(2)
    print("Step 2: Activating fresh tabs...")
    run("activate_megawork.py")
    print("MegaWork restarted successfully.")


if __name__ == "__main__":
    main()
