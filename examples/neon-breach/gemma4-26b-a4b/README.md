# NEON BREACH - Gemma 4 26B A4B

This directory preserves an incomplete NEON BREACH evaluation produced by a
local Gemma 4 26B A4B model during a nine-hour run. The model created a
multi-file Canvas game, but the game failed to start or run reliably end to end.

- [`traces.html`](traces.html) is the complete interactive Pi session export.
- [`game/`](game/) contains the final generated output for inspection.
- [`gemma4-26b-a4b-qat-q4-mtp1-90k.ini`](gemma4-26b-a4b-qat-q4-mtp1-90k.ini)
  is the llama.cpp preset used.

## Run Summary

The nine-hour run used one Pi session with one initial turn, 57 continuation
turns, and one final-validation turn. The high continuation count partly reflects
short, interrupted turns.

## Run Configuration

The llama.cpp server used a QAT [Gemma 4 26B A4B Instruct](https://huggingface.co/unsloth/gemma-4-26B-A4B-it-qat-GGUF) `UD-Q4_K_XL`
target with a 90,000-token context. MTP speculative decoding proposed up to
one token, and both target and draft KV caches used Q4 quantization. Reasoning
was enabled with a 1,024-token budget.

## Model Server

Replace the placeholder `model`, `spec-draft-model`, and `mmproj` paths in
[`gemma4-26b-a4b-qat-q4-mtp1-90k.ini`](gemma4-26b-a4b-qat-q4-mtp1-90k.ini),
then run from the repository root:

```bash
llama serve \
  --models-preset examples/neon-breach/gemma4-26b-a4b/gemma4-26b-a4b-qat-q4-mtp1-90k.ini \
  --models-max 1 \
  --host 127.0.0.1 \
  --port 8080
```

Run the evaluation with:

```bash
./harness/scripts/run-eval.sh \
  --scenario harness/scenarios/neon-breach \
  --model gemma-4-26b-a4b-it \
  --base-url http://127.0.0.1:8080/v1 \
  --hours 9 \
  --turn-minutes 75 \
  --final-minutes 60
```

| Measure | Count | Method |
| --- | ---: | --- |
| Gemma-created game and test code | Approximately 1,900 lines | HTML, JavaScript, and CSS files in `game/` |
| Tool calls | 2,771 | Saved session |
| `game_test` calls | 312 | Saved session |
| Playwright MCP calls | 840 | Saved session |

## Result

The browser shows the game module loading, the engine initializing,
and Level 1 rendering. It does not establish a working complete game.

## Agent Trace

The complete session is available in the local
[`traces.html`](traces.html) export and as a published
[Gemma 4 trace](https://blazestorm001.github.io/gameruns-lite/traces/gemma4-26b-a4b.html).
