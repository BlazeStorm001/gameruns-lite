# NEON BREACH Case Study

This is the preserved output of a nine-hour Qwen3.8-27B (3-bit quantized) evaluation run. Qwen created the game, procedural pixel art, automated tests, browser experiments, and captured screenshots.

- [`game/`](game/) is the unchanged project produced during the run.
- [`scenario/`](scenario/) contains the supplied prompts and reference images.

- [`traces.html`](traces.html) is the complete interactive Pi session export.
- [`qwen3.8-27b-rtx5060ti.ini`](qwen3.8-27b-rtx5060ti.ini) is llama.cpp preset used.

Run the game locally:

```bash
cd examples/neon-breach/qwen3.8-27b/game
python3 -m http.server 8123
```

Open <http://127.0.0.1:8123>

## Run Summary

The run used one Pi session that lasted nine hours. It contained one initial turn, seven continuation turns, and one final-validation turn.
Qwen did not call the optional `generate_image` tool. It generated the game's art procedurally in JavaScript and used browser screenshots while testing.

## Run Configuration

The llama.cpp server used an ASCII-condensed [Unsloth Qwen3.8-27B UD-Q3_K_XL](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF) target derived from the methods described here [bsaleh03/Qwen3.8-27B-ASCII-Condensed](https://huggingface.co/bsaleh03/Qwen3.8-27B-ASCII-Condensed)
with a compatible ASCII-condensed DFlash2 [Q2_K draft](https://huggingface.co/Blazestorm001/Qwen3.8-27B-ASCII-Condensed-DFlash2-GGUF) exported using the same
token mapping. It ran with an 86,000-token context, Q4 target and draft KV
caches, and DFlash proposals of up to four tokens. The target and draft ran on
an RTX 5060 Ti; the F16 multimodal projector ran on a T400.

## Model Server

Replace the placeholder `model`, `spec-draft-model`, and `mmproj` paths in
[`qwen3.8-27b-rtx5060ti.ini`](qwen3.8-27b-rtx5060ti.ini), then run from the
repository root:

```bash
llama serve \
  --models-preset examples/neon-breach/qwen3.8-27b/qwen3.8-27b-rtx5060ti.ini \
  --models-max 1 \
  --host 127.0.0.1 \
  --port 8080
```

Run the evaluation with:

```bash
./harness/scripts/run-eval.sh \
  --scenario harness/scenarios/neon-breach \
  --model qwen \
  --base-url http://127.0.0.1:8080/v1 \
  --hours 9 \
  --turn-minutes 75 \
  --final-minutes 60
```

| Measure | Count | Method |
| --- | ---: | --- |
| Qwen-created game and test code | 3,137 lines | HTML, JavaScript, and `.mjs` files in `game/` |
| Provider-reported input context | 46,346,032 tokens | Uncached input plus cache-read tokens |
| Provider-reported output | 618,034 tokens | Sum across saved assistant records |
| Tool calls | 749 | Unique tool-call IDs in the saved session |
| `game_test` calls | 192 | Unique tool-call IDs |
| Playwright MCP calls | 140 | All `mcp_playwright_*` tool calls |
| Browser screenshots requested | 27 | `mcp_playwright_browser_take_screenshot` calls |
| Image blocks processed | 69 | Image content blocks in the saved session |
| Screenshots retained with the game | 7 | PNG files in the game root |

## Demo

[Watch the NEON BREACH demo](neon-breach-eval-demo.mp4).

## Agent Trace

The complete session is available as an interactive
[agent trace](https://blazestorm001.github.io/game-harness/traces/qwen3.8-27b.html).
