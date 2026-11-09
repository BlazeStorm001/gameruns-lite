import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { createBrowserSession } from "./browser.ts";
import { observe } from "./observe.ts";

const operations = Type.Union([
  Type.Literal("open"),
  Type.Literal("observe"),
  Type.Literal("key"),
  Type.Literal("click"),
  Type.Literal("step"),
  Type.Literal("wait"),
  Type.Literal("reset"),
  Type.Literal("set-mode"),
  Type.Literal("reload"),
  Type.Literal("close"),
]);

export default function gameTestExtension(pi: ExtensionAPI) {
  const session = createBrowserSession();

  pi.registerTool({
    name: "game_test",
    label: "Game Test",
    description:
      "Drive and inspect a running browser game as an action-transition-observation loop. " +
      "Start the game's dev server with bash, open its URL, then use keyboard/mouse input or " +
      "the optional deterministic window.__gameTest contract. Every operation returns compact state and errors; " +
      "screenshots are included by default for open and observe.",
    promptSnippet: "Play and inspect a running browser game through deterministic state transitions",
    promptGuidelines: [
      "Use game_test on the actual running game before claiming browser behavior works.",
      "For reliable tests, expose window.__gameTest with reset({seed,mode}), step({input,ticks}), snapshot(), and setMode(mode). Manual mode must freeze automatic simulation between calls. Each step must advance the entire simulation by exactly the requested fixed ticks through the normal input and simulation paths, render, release temporary input, and return compact JSON state including tick and simulated time. A seeded reset and repeated input sequence must be reproducible.",
      "Test meaningful transitions by observing state before and after input, including start, gameplay, damage/scoring or objectives, win/loss, and restart when those states exist.",
      'Examples: {operation:"reset",seed:7}; {operation:"step",input:{keys:["ArrowRight"]},ticks:60}; {operation:"step",input:{},ticks:60,screenshot:true}. The game may document another compact input shape, including optional one-shot commands.',
      "Input applies only to that step and is released afterward. Use empty input to advance the whole world. Use reload after editing browser code; reset does not load source edits.",
      "Also test realtime mode with actual keyboard or pointer input; deterministic hooks do not replace normal-play verification.",
      "Check fresh browserEvents for runtime errors and missing assets. Request screenshots at visual checkpoints.",
    ],
    executionMode: "sequential",
    parameters: Type.Object({
      operation: operations,
      url: Type.Optional(Type.String({ description: "URL for open, for example http://127.0.0.1:8000." })),
      input: Type.Optional(
        Type.Unknown({
          description:
            "Input scoped to one step. Usually keys, mouse buttons/pointer, or a documented one-shot command.",
        }),
      ),
      key: Type.Optional(
        Type.String({ description: "Playwright key name for operation=key, such as Enter, ArrowLeft, or Space." }),
      ),
      x: Type.Optional(Type.Number({ description: "Viewport x coordinate for operation=click." })),
      y: Type.Optional(Type.Number({ description: "Viewport y coordinate for operation=click." })),
      ticks: Type.Optional(
        Type.Integer({
          description: "Fixed simulation ticks for operation=step; defaults to 1.",
          minimum: 1,
          maximum: 3600,
        }),
      ),
      seed: Type.Optional(
        Type.Integer({
          description: "Deterministic seed for operation=reset; reset enters manual mode by default.",
        }),
      ),
      mode: Type.Optional(
        Type.Union([Type.Literal("manual"), Type.Literal("realtime")], {
          description: "Simulation mode for reset or set-mode.",
        }),
      ),
      durationMs: Type.Optional(
        Type.Integer({
          description: "Key hold or wait duration in milliseconds.",
          minimum: 0,
          maximum: 30000,
        }),
      ),
      settleMs: Type.Optional(
        Type.Integer({
          description:
            "Delay after the operation before observing. Defaults to 0 for deterministic transitions and 100ms otherwise.",
          minimum: 0,
          maximum: 10000,
        }),
      ),

      screenshot: Type.Optional(
        Type.Boolean({
          description: "Include a screenshot. Defaults to true for open/observe and false otherwise.",
        }),
      ),
    }),

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      if (signal?.aborted) throw new Error("Game test operation aborted.");

      const operation = params.operation;
      const includeScreenshot = params.screenshot ?? ["open", "observe"].includes(operation);
      const settleMs = params.settleMs ?? (["step", "reset", "set-mode"].includes(operation) ? 0 : 100);

      onUpdate?.({
        content: [{ type: "text", text: `Game test: ${operation}...` }],
        details: { operation: operation },
      });

      if (operation === "close") {
        await session.close();
        return {
          content: [{ type: "text", text: "Browser closed." }],
          details: { operation: "close" },
        };
      }

      const { page, transition } = await session.runOperation(operation, params, ctx.cwd);
      if (settleMs > 0) await page.waitForTimeout(settleMs);
      if (signal?.aborted) throw new Error("Game test operation aborted.");

      const result = await observe(page, includeScreenshot, session.takeEvents, transition);
      const contextWindow = ctx.getContextUsage?.()?.contextWindow;
      if (
        result.observation.gameTest.snapshot !== null &&
        typeof contextWindow === "number" &&
        Number.isFinite(contextWindow) &&
        contextWindow > 0
      ) {
        // Approximate tokens as one per four characters of the compact JSON representation.
        const tokens = Math.ceil(JSON.stringify(result.observation.gameTest.snapshot).length / 4);
        if (tokens > contextWindow / 2) {
          result.content.unshift({
            type: "text",
            text: `Warning: this game snapshot is approximately ${tokens.toLocaleString("en-US")} tokens, more than 50% of the configured ${contextWindow.toLocaleString("en-US")}-token context window.`,
          });
        }
      }
      return {
        content: result.content,
        details: { operation: operation, observation: result.observation },
      };
    },
  });

  pi.on("session_shutdown", async () => {
    await session.close();
  });
}
