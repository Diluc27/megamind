import os
import subprocess
import sys


NGROK_DIR = r"C:\Users\Sm1th\ngrok"
NGROK_EXE = os.path.join(NGROK_DIR, "ngrok.exe")


def main() -> int:
    if not os.path.exists(NGROK_EXE):
        print(f"ngrok not found: {NGROK_EXE}")
        return 1

    print("Starting ngrok tunnel for MegaMind backend: http://127.0.0.1:8000")
    print("ngrok dashboard: http://127.0.0.1:4040")
    return subprocess.call([NGROK_EXE, "http", "8000"], cwd=NGROK_DIR)


if __name__ == "__main__":
    sys.exit(main())
