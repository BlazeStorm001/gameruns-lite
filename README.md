<img src="assets/gameruns-lite-logo.png" alt="GameRuns Lite logo: a pink looping G with a bold black outline" width="160">

# GameRuns Lite

A minimal harness around the Pi coding agent for long-running autonomous browser-game development runs.

[![Deploy Game](https://github.com/BlazeStorm001/gameruns-lite/actions/workflows/pages.yml/badge.svg)](https://github.com/BlazeStorm001/gameruns-lite/actions/workflows/pages.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

## Why

Evaluating whether a model can do long-horizon, tool-using work requires a stable agent, a real browser, and sessions that survive hours of autonomous turns. This harness provides that setup.
https://github.com/user-attachments/assets/13a52784-d0fe-40f3-91c3-5eb003e6f420

## Evaluations

| Scenario | Model | Outcome | Details | Trace |
| --- | --- | --- | --- | --- |
| NEON BREACH | Qwen3.8-27B | Complete, playable game | [Case study](examples/neon-breach/qwen3.8-27b/README.md) | [Trace](https://blazestorm001.github.io/gameruns-lite/traces/qwen3.8-27b.html) |
| NEON BREACH | Gemma 4 26B A4B | Incomplete game | [Evaluation](examples/neon-breach/gemma4-26b-a4b/README.md) | [Trace](https://blazestorm001.github.io/gameruns-lite/traces/gemma4-26b-a4b.html) |

[Play the Qwen-generated NEON BREACH game](https://blazestorm001.github.io/gameruns-lite/).

## Quick start

Requires Linux or WSL2, Node.js 22.19+, npm, Bash, Git, `curl`, `jq`, `rg`,
GNU `timeout`, and `realpath`. Use a model that supports images and tool calls.

```bash
git clone https://github.com/BlazeStorm001/gameruns-lite.git
cd gameruns-lite
./harness/scripts/setup.sh --install
./harness/scripts/setup.sh --check
```

Configure a model below, then start a two-hour run:

```bash
./harness/scripts/run-eval.sh \
  --scenario harness/scenarios/neon-breach \
  --model local/qwen
```

## Model setup

The harness uses `harness/.runtime/pi-agent/`, separate from your personal Pi
configuration.

### Local or custom endpoints

Start your OpenAI-compatible server, then create
`harness/.runtime/pi-agent/models.json`:

```json
{
  "providers": {
    "local": {
      "baseUrl": "http://127.0.0.1:8080/v1",
      "api": "openai-completions",
      "apiKey": "local",
      "models": [{
        "id": "qwen",
        "input": ["text", "image"],
        "contextWindow": 90112,
        "maxTokens": 90112
      }]
    }
  }
}
```

Adjust the example to match your model and server, including llama.cpp or another
OpenAI-compatible endpoint. Use `local` for servers without authentication, or
`${MODEL_API_KEY}` to read a key from your environment.
Set `maxTokens` to your desired output limit; Pi defaults to 16,384 when omitted.
See [Pi model configuration](https://pi.dev/docs/latest/models#configure-a-compatible-endpoint)
for more options.

### Subscription or hosted providers

Open the harness's Pi from the repository root:

```bash
PI_CODING_AGENT_DIR="$PWD/harness/.runtime/pi-agent" \
  ./harness/node_modules/.bin/pi
```

Sign in with `/login`, choose a model with `/model`, then exit Pi.
Pass its `PROVIDER/ID` to the harness with `--model`.
Built-in providers need no custom `models.json` configuration.
Sign in once for this harness; your global Pi login is separate.

## Scenarios

A scenario is a directory with three prompts and optional reference images:

```text
my-scenario/
  prompts/
    initial.txt
    continue.txt
    final.txt
  references/              # optional PNG, JPEG, or WebP files
```

`initial.txt` starts a new session with its references, `continue.txt` guides
each autonomous turn and later resumes, and `final.txt` reserves the closing
validation pass.

## Usage

Use `--model PROVIDER/ID` for both new runs and resumes. A short run:

```bash
./harness/scripts/run-eval.sh \
  --scenario harness/scenarios/neon-breach \
  --model local/qwen \
  --time-budget 15m \
  --final-budget 3m
```

Each run receives a workspace at `.runs/<scenario>-<timestamp>/`. Resume one by
passing its relative or absolute path; the requested duration is additional:

```bash
./harness/scripts/run-eval.sh \
  --resume .runs/neon-breach-20260910-004540 \
  --model local/qwen \
  --time-budget 2h
```

The initial prompt runs once, followed by repeated continuation prompts.
During the final stage, the final prompt repeats until time runs out.

- `--time-budget`: total runtime (default `2h`).
- `--final-budget`: time reserved within that total for finalization (default `30m`; `0` disables it).
- `--turn-budget`: optional cap per Pi invocation (default `0`, uncapped).

Each invocation stops at its stage deadline, even without a turn cap.

## Context and tools

Pi runs with `--no-context-files`, `--no-skills`, and an isolated
`PI_CODING_AGENT_DIR` to reduce accidental context contamination. This is not a
security boundary: Pi retains the launching user's filesystem permissions.

The `game_test` extension drives a real browser and asks generated games for an
action-transition-observation loop. Playwright MCP is also available.

Optional integrations:

- Cloudflare image generation: export `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_API_TOKEN` in the shell used to launch the experiment. The
  `generate_image` tool uses FLUX.1 Schnell and requires ImageMagick's `magick`
  command. Leave the variables unset to run without remote image generation.

## Contributing

Open an issue for problems and ideas; pull requests are welcome.

## License

Apache 2.0 - see [LICENSE](LICENSE).
