# Minimal Agentic Game Development Harness

A minimal harness around the Pi coding agent for long-running autonomous browser-game development with locally hosted models.

[![Deploy Game](https://github.com/BlazeStorm001/game-harness/actions/workflows/pages.yml/badge.svg)](https://github.com/BlazeStorm001/game-harness/actions/workflows/pages.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

## Why

Evaluating whether a local model can do long-horizon, tool-using work requires a stable agent, a real browser, and sessions that survive hours of autonomous turns. This harness provides that setup.
https://github.com/user-attachments/assets/13a52784-d0fe-40f3-91c3-5eb003e6f420

## Evaluations

| Scenario | Model | Outcome | Details | Trace |
| --- | --- | --- | --- | --- |
| NEON BREACH | Qwen3.8-27B | Complete, playable game | [Case study](examples/neon-breach/qwen3.8-27b/README.md) | [Trace](https://blazestorm001.github.io/game-harness/traces/qwen3.8-27b.html) |
| NEON BREACH | Gemma 4 26B A4B | Incomplete game | [Evaluation](examples/neon-breach/gemma4-26b-a4b/README.md) | [Trace](https://blazestorm001.github.io/game-harness/traces/gemma4-26b-a4b.html) |

[Play the Qwen-generated NEON BREACH game](https://blazestorm001.github.io/game-harness/).

## Quick start

```bash
# install pinned dependencies and verify
./harness/scripts/setup.sh --install
./harness/scripts/setup.sh --check

# start a llama.cpp server, then run the bundled two-hour evaluation
./harness/scripts/run-eval.sh \
  --scenario harness/scenarios/neon-breach \
  --model qwen
```

## Requirements

- Linux or WSL2
- Node.js 20+, npm, Bash, Git
- `curl`, `jq`, `rg`, GNU `timeout`, `realpath`
- A running OpenAI-compatible llama.cpp server

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

Start an OpenAI-compatible llama.cpp server before running an experiment. Pass
`--model` an ID returned by its `/models` endpoint. Use `--base-url` if the
server is not available at `http://127.0.0.1:8080/v1`.

Run the bundled scenario with the two-hour defaults:

```bash
./harness/scripts/run-eval.sh \
  --scenario harness/scenarios/neon-breach \
  --model qwen
```

Run a custom scenario:

```bash
./harness/scripts/run-eval.sh \
  --scenario /path/to/my-scenario \
  --model my-model \
  --hours 4 \
  --turn-minutes 30 \
  --final-minutes 30
```

Each run receives a workspace at `.runs/<scenario>-<timestamp>/`. Resume one by
passing its relative or absolute path; the requested duration is additional:

```bash
./harness/scripts/run-eval.sh \
  --resume .runs/neon-breach-20260910-004540 \
  --model qwen \
  --hours 2
```

The initial prompt runs once. The continuation prompt then repeats until the
reserved final stage, where the final prompt repeats until the overall deadline.
Every Pi invocation is capped by `--turn-minutes` (default 30) and the time
remaining in its stage. `--final-minutes` defaults to 30; set it to `0` to skip
finalization.

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
- Context7 documentation access: set `ENABLE_CONTEXT7=1` and
  `CONTEXT7_API_KEY`.

## Contributing

Open an issue for problems and ideas; pull requests are welcome.

## License

Apache 2.0 - see [LICENSE](LICENSE).
