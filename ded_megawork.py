import platform
import subprocess
import sys

ROOT = r"C:\Users\Sm1th\megamind"
IS_WINDOWS = platform.system().lower() == "windows"


def run_windows_powershell():
    subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            f"Set-Location {ROOT}; python stop_megawork.py",
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
            f"Set-Location '{ROOT}'; python stop_megawork.py",
        ],
        check=False,
    )


def main():
    if IS_WINDOWS:
        run_windows_powershell()
    else:
        run_wsl_powershell()
    print("Ded MegaWork stopped.")


if __name__ == "__main__":
    main()
