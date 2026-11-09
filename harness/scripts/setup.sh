#!/usr/bin/env bash
set -Eeuo pipefail

harness_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="$harness_root/.runtime"
agent_dir="$runtime_root/pi-agent"
pi_bin="$harness_root/node_modules/.bin/pi"
playwright_bin="$harness_root/node_modules/@playwright/test/cli.js"

pi_version="1.5.0"

usage() {
  cat <<EOF
Usage:
  $0 --install   Install pinned harness dependencies locally
  $0 --check     Verify the local installation
EOF
}

[[ $# -eq 1 ]] || { usage >&2; exit 2; }
mode="$1"
[[ "$mode" == "--install" || "$mode" == "--check" ]] || {
  usage >&2
  exit 2
}

required=(bash node npm git curl jq rg timeout realpath find sort tee)
for command in "${required[@]}"; do
  command -v "$command" >/dev/null || {
    echo "Missing required command: $command" >&2
    exit 1
  }
done

node_supported="$(node -p 'const [major, minor] = process.versions.node.split(".").map(Number); major > 22 || (major === 22 && minor >= 19)')"
[[ "$node_supported" == true ]] || {
  echo "Node.js 22.19 or newer is required." >&2
  exit 1
}

export PI_CODING_AGENT_DIR="$agent_dir"
export PLAYWRIGHT_BROWSERS_PATH="$runtime_root/browsers"
export PI_SKIP_VERSION_CHECK=1
export PI_TELEMETRY=0
export GIT_TERMINAL_PROMPT=0

check_installation() {
  [[ -x "$pi_bin" && -f "$playwright_bin" ]] || {
    echo "Harness dependencies are not installed." >&2
    echo "Run: ./harness/scripts/setup.sh --install" >&2
    return 1
  }

  [[ "$($pi_bin --version)" == "$pi_version" ]] || {
    echo "Unexpected Pi version. Run: ./harness/scripts/setup.sh --install" >&2
    return 1
  }

  cd "$harness_root"
  if ! node --input-type=module <<'NODE'
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent("<title>harness-check</title>");
if (await page.title() !== "harness-check") throw new Error("browser check failed");
await browser.close();
NODE
  then
    echo "Chromium could not start. Install its Linux system dependencies with:" >&2
    echo "  sudo node \"$playwright_bin\" install-deps chromium" >&2
    return 1
  fi

  echo "Harness installation check passed."
}

if [[ "$mode" == "--check" ]]; then
  check_installation
  exit
fi

mkdir -p "$runtime_root" "$agent_dir"
cd "$harness_root"
npm ci

node "$playwright_bin" install chromium
check_installation
