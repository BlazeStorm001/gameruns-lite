#!/usr/bin/env bash
set -Eeuo pipefail

harness_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

time_budget="2h"
duration_set=false
turn_budget="0"
final_budget="30m"
model_reference=""
scenario=""
resume=false
resume_target=""
skip_preflight=false

usage() {
  cat <<EOF
Usage:
  $0 --scenario PATH --model PROVIDER/ID [--time-budget TIME] [OPTIONS]
  $0 --resume PATH --model PROVIDER/ID [--time-budget TIME] [OPTIONS]

Options:
  --scenario PATH          Scenario directory (required for a new run)
  --resume PATH            Continue a saved evaluation workspace
  --time-budget TIME       Total runtime, e.g. 30m or 2h (default: 2h)
  --turn-budget TIME       Maximum Pi invocation time (default: 0, no per-turn cap)
  --final-budget TIME      Final phase within total runtime (default: 30m; 0 disables)
  --model PROVIDER/ID      Configured Pi provider/model reference (required)
  --skip-preflight         Skip preflight

Durations use whole minutes (30 or 30m) or hours (2h).
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --scenario)
      shift
      [[ $# -gt 0 ]] || { echo "--scenario requires a value" >&2; exit 2; }
      scenario="$1"
      ;;
    --time-budget)
      shift
      [[ $# -gt 0 ]] || { echo "--time-budget requires a value" >&2; exit 2; }
      [[ "$duration_set" == false ]] || { echo "--time-budget may only be supplied once." >&2; exit 2; }
      time_budget="$1"
      duration_set=true
      ;;
    --resume)
      shift
      [[ $# -gt 0 ]] || { echo "--resume requires a workspace path" >&2; exit 2; }
      [[ "$resume" == false ]] || { echo "--resume may only be specified once." >&2; exit 2; }
      resume=true
      resume_target="$1"
      ;;
    --turn-budget)
      shift
      [[ $# -gt 0 ]] || { echo "--turn-budget requires a value" >&2; exit 2; }
      turn_budget="$1"
      ;;
    --final-budget)
      shift
      [[ $# -gt 0 ]] || { echo "--final-budget requires a value" >&2; exit 2; }
      final_budget="$1"
      ;;
    --model)
      shift
      [[ $# -gt 0 ]] || { echo "--model requires a value" >&2; exit 2; }
      model_reference="$1"
      ;;
    --skip-preflight)
      skip_preflight=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

parse_duration_minutes() {
  local value="$1" flag="$2"
  [[ "$value" =~ ^([0-9]{1,9})([mh]?)$ ]] || {
    echo "$flag requires a non-negative whole duration, e.g. 30m or 2h (up to 9 digits)." >&2
    return 2
  }
  local minutes=$((10#${BASH_REMATCH[1]}))
  [[ "${BASH_REMATCH[2]}" != h ]] || minutes=$((minutes * 60))
  echo "$minutes"
}

total_minutes="$(parse_duration_minutes "$time_budget" --time-budget)"
final_minutes="$(parse_duration_minutes "$final_budget" --final-budget)"
turn_minutes="$(parse_duration_minutes "$turn_budget" --turn-budget)"
(( total_minutes > 0 )) || { echo "--time-budget must be greater than zero." >&2; exit 2; }
(( final_minutes < total_minutes )) || {
  echo "--final-budget must be shorter than --time-budget; use 0 to disable it." >&2
  exit 2
}
if [[ "$resume" == true && -n "$scenario" ]]; then
  echo "Specify exactly one of --scenario or --resume." >&2
  exit 2
fi
if [[ "$resume" == false && -z "$scenario" ]]; then
  echo "--scenario PATH is required for a new run." >&2
  usage >&2
  exit 2
fi
[[ "$model_reference" =~ ^[^/[:space:]]+/[^[:space:]]+$ ]] || {
  echo "--model requires PROVIDER/ID (for example local/qwen-dflash4)." >&2
  exit 2
}
# Model IDs may contain slashes; only the first separates the provider.
provider="${model_reference%%/*}"
model="${model_reference#*/}"
if [[ "$resume" == false ]]; then
  [[ -d "$scenario" ]] || {
    echo "Scenario directory not found: $scenario" >&2
    exit 2
  }
  scenario="$(realpath "$scenario")"
fi

"$harness_root/scripts/setup.sh" --check >/dev/null

pi_bin="$harness_root/node_modules/.bin/pi"

if [[ "$resume" == true ]]; then
  [[ -d "$resume_target" ]] || {
    echo "Resume workspace not found: $resume_target" >&2
    exit 1
  }
  workspace="$(realpath "$resume_target")"
  [[ -d "$workspace/.harness/pi-sessions" ]] || {
    echo "Resume workspace has no .harness/pi-sessions directory: $workspace" >&2
    exit 1
  }
  [[ -f "$workspace/prompts/continue.txt" ]] || {
    echo "Resume workspace is missing prompts/continue.txt: $workspace" >&2
    exit 1
  }
  if (( final_minutes > 0 )); then
    [[ -f "$workspace/prompts/final.txt" ]] || {
      echo "Resume workspace is missing prompts/final.txt: $workspace" >&2
      exit 1
    }
  fi
  latest_session_file="$(
    find "$workspace/.harness/pi-sessions" -mindepth 2 -maxdepth 2 \
      -type f -name '*.jsonl' -printf '%T@ %p\n' 2>/dev/null |
      sort -nr | head -1 | cut -d' ' -f2-
  )"
  [[ -n "$latest_session_file" ]] || {
    echo "No saved Pi session found in $workspace" >&2
    exit 1
  }
else
  if [[ "$skip_preflight" == false ]]; then
    "$harness_root/scripts/preflight.sh" --scenario "$scenario" \
      --model "$model_reference"
  fi
  workspace="$("$harness_root/scripts/create-workspace.sh" "$scenario")"
fi

export AGENT_EVAL_HARNESS_DIR="$harness_root"
export PI_CODING_AGENT_DIR="$harness_root/.runtime/pi-agent"
export PLAYWRIGHT_BROWSERS_PATH="$harness_root/.runtime/browsers"
export PI_SKIP_VERSION_CHECK=1
export PI_TELEMETRY=0
cd "$workspace"
mkdir -p eval-logs .harness/pi-sessions

start_epoch="$(date +%s)"
started_at="$(date --iso-8601=seconds)"
deadline=$((start_epoch + total_minutes * 60))
final_start=$((deadline - final_minutes * 60))
run_id="$(date +%Y%m%d-%H%M%S)"
invocation=0
failures=0
stop_reason="completed"

if [[ "$resume" == true ]]; then
  latest_session_file="$(
    find .harness/pi-sessions -mindepth 2 -maxdepth 2 -type f -name '*.jsonl' \
      -printf '%T@ %p\n' |
      sort -nr | head -1 | cut -d' ' -f2-
  )"
  session_dir="$(dirname "$latest_session_file")"
  previous_metadata="$(
    find eval-logs -maxdepth 1 -name '*-run.json' -type f -printf '%T@ %p\n' 2>/dev/null |
      sort -nr | head -1 | cut -d' ' -f2-
  )"
  if [[ -n "$previous_metadata" ]]; then
    scenario_name="$(jq -r '.scenario.name // "unknown"' "$previous_metadata")"
  else
    scenario_name="unknown"
  fi
else
  session_dir=".harness/pi-sessions/$run_id"
  mkdir -p "$session_dir"
  scenario_root="$(realpath "$scenario")"
  scenario_name="$(basename "$scenario_root")"
fi

metadata="eval-logs/$run_id-run.json"
jq -n \
  --arg runId "$run_id" \
  --arg startedAt "$started_at" \
  --arg workspace "$workspace" \
  --arg sessionDirectory "$session_dir" \
  --arg modelReference "$model_reference" \
  --arg scenarioName "$scenario_name" \
  --arg piVersion "$($pi_bin --version)" \
  --arg playwrightVersion "$(node -p "require('$harness_root/node_modules/@playwright/test/package.json').version")" \
  --argjson resumed "$resume" \
  --arg requestedTimeBudget "$time_budget" \
  --arg requestedTurnBudget "$turn_budget" \
  --arg requestedFinalBudget "$final_budget" \
  '{schemaVersion: 3, runId: $runId, startedAt: $startedAt,
    workspace: $workspace, resumed: $resumed,
    requestedTimeBudget: $requestedTimeBudget, requestedTurnBudget: $requestedTurnBudget,
    requestedFinalBudget: $requestedFinalBudget, modelReference: $modelReference,
    sessionDirectory: $sessionDirectory, scenario: {name: $scenarioName},
    versions: {pi: $piVersion, playwright: $playwrightVersion},
    mcp: "builtin:mcp",
    invocations: []}' > "$metadata"

session_id() {
  local file
  file="$(find "$session_dir" -maxdepth 1 -type f -name '*.jsonl' -print -quit)"
  [[ -n "$file" ]] || return 0
  head -1 "$file" | jq -r 'select(.type == "session") | .id // empty' 2>/dev/null || true
}

export_trace() {
  local session_file trace_file="eval-logs/$run_id-trace.html"
  session_file="$(find "$session_dir" -maxdepth 1 -type f -name '*.jsonl' -print -quit)"
  [[ -n "$session_file" ]] || return 0
  if "$pi_bin" --export "$session_file" "$trace_file" >/dev/null; then
    echo "Trace: $workspace/$trace_file"
  else
    echo "Warning: Could not export the session trace." >&2
  fi
}

finalize_metadata() {
  local status="$?" tmp="${metadata}.tmp"
  jq --arg endedAt "$(date --iso-8601=seconds)" \
    --arg sessionId "$(session_id)" --arg stopReason "$stop_reason" \
    --argjson exitStatus "$status" \
    '. + {endedAt: $endedAt, sessionId: $sessionId,
      stopReason: $stopReason, exitStatus: $exitStatus}' \
    "$metadata" > "$tmp" && mv "$tmp" "$metadata"
  export_trace
}
trap finalize_metadata EXIT

record_invocation() {
  local index="$1" phase="$2" invocation_started="$3" invocation_ended="$4"
  local limit_seconds="$5" elapsed_seconds="$6" process_status="$7"
  local process_outcome="$8" log_file="$9" tmp="${metadata}.tmp"
  jq --argjson index "$index" --arg phase "$phase" \
    --arg startedAt "$invocation_started" --arg endedAt "$invocation_ended" \
    --argjson timeLimitSeconds "$limit_seconds" \
    --argjson elapsedSeconds "$elapsed_seconds" \
    --argjson processExitCode "$process_status" \
    --arg processOutcome "$process_outcome" --arg logFile "$log_file" \
    '.invocations += [{index: $index, phase: $phase, startedAt: $startedAt,
      endedAt: $endedAt, timeLimitSeconds: $timeLimitSeconds,
      elapsedSeconds: $elapsedSeconds, processExitCode: $processExitCode,
      processOutcome: $processOutcome, logFile: $logFile}]' \
    "$metadata" > "$tmp" && mv "$tmp" "$metadata"
}

base=(
  --provider "$provider"
  --model "$model"
  --session-dir "$session_dir"
  --no-context-files
  --no-skills
  --approve
  --mode json
)
last_elapsed=0
last_process_outcome="unknown"

run_prompt() {
  local prompt_file="$1" seconds="$2" phase="$3" initial="$4"
  local process_status process_outcome prompt log_file invocation_started invocation_ended
  local invocation_start_epoch
  local -a args image_args

  invocation=$((invocation + 1))
  prompt="$(cat "$prompt_file")"
  log_file="eval-logs/$run_id-$(printf '%02d' "$invocation")-$phase.jsonl"
  invocation_started="$(date --iso-8601=seconds)"
  invocation_start_epoch="$(date +%s)"
  args=("$pi_bin" "${base[@]}")

  if [[ "$initial" == true ]]; then
    shopt -s nullglob nocaseglob
    image_args=(references/*.png references/*.jpg references/*.jpeg references/*.webp)
    shopt -u nullglob nocaseglob
    args+=(--name "agent-eval-$run_id" "${image_args[@]/#/@}" "$prompt")
  else
    args+=(--continue "$prompt")
  fi

  echo "Invocation $invocation: $phase ($seconds second limit)"
  set +e
  timeout --signal=INT --kill-after=180s "${seconds}s" "${args[@]}" 2>&1 | tee "$log_file"
  process_status=${PIPESTATUS[0]}
  set -e

  invocation_ended="$(date --iso-8601=seconds)"
  last_elapsed=$(($(date +%s) - invocation_start_epoch))
  if [[ $process_status -eq 0 ]]; then
    process_outcome="completed"
  elif [[ $process_status -eq 124 || $process_status -eq 130 ]] && \
       (( last_elapsed >= seconds )); then
    process_outcome="time-limit-reached"
  else
    process_outcome="failed"
  fi
  last_process_outcome="$process_outcome"

  record_invocation "$invocation" "$phase" "$invocation_started" \
    "$invocation_ended" "$seconds" "$last_elapsed" "$process_status" \
    "$process_outcome" "$log_file"

  return "$process_status"
}

echo "Workspace: $workspace"
echo "Session:   $session_dir"

if [[ "$resume" == false ]]; then
  remaining=$((final_start - $(date +%s)))
  if (( remaining > 0 )); then
    limit=$((turn_minutes * 60))
    (( limit == 0 || limit > remaining )) && limit="$remaining"
    if run_prompt prompts/initial.txt "$limit" initial true; then
      failures=0
    elif [[ "$last_process_outcome" == "time-limit-reached" ]]; then
      failures=0
    else
      failures=1
    fi
  fi
else
  echo "Resuming saved session; initial prompt and reference images are not replayed."
fi

while (( $(date +%s) < final_start && failures < 3 )); do
  remaining=$((final_start - $(date +%s)))
  (( remaining > 0 )) || break
  limit=$((turn_minutes * 60))
  (( limit == 0 || limit > remaining )) && limit="$remaining"

  if run_prompt prompts/continue.txt "$limit" continue false; then
    failures=0
  elif [[ "$last_process_outcome" == "time-limit-reached" ]]; then
    failures=0
  else
    failures=$((failures + 1))
  fi
done

if (( failures >= 3 )); then
  stop_reason="consecutive-failures"
fi

if (( final_minutes > 0 )); then
  failures=0
  while (( $(date +%s) < deadline && failures < 3 )); do
    remaining=$((deadline - $(date +%s)))
    (( remaining > 0 )) || break
    limit=$((turn_minutes * 60))
    (( limit == 0 || limit > remaining )) && limit="$remaining"

    if run_prompt prompts/final.txt "$limit" final false; then
      failures=0
    elif [[ "$last_process_outcome" == "time-limit-reached" ]]; then
      failures=0
    else
      failures=$((failures + 1))
    fi
  done

  if (( failures >= 3 )); then
    stop_reason="final-consecutive-failures"
  fi
fi

echo "Evaluation finished. Metadata: $workspace/$metadata"

if [[ "$stop_reason" == "completed" ]]; then
  exit 0
fi
exit 1
