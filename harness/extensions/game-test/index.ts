import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { createBrowserSession } from "./browser.ts";
import { observe } from "./observe.ts";

const operations = Type.Union([
  Type.Literal("open"),
  Type.Literal("observe"),
  Type.Literal("key"),
  Type.Literal("click"),
  Type.Literal("action"),
  Type.Literal("step"),
  Type.Literal("wait"),
  Type.Literal("reset"),
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
      "the optional window.__gameTest contract. Every operation returns compact state and errors; " +
      "screenshots are included by default for open and observe.",
    promptSnippet: "Play and inspect a running browser game through deterministic state transitions",
    promptGuidelines: [
      "Use game_test on the actual running game before claiming browser behavior works.",
      "For reliable tests, expose window.__gameTest with reset(seed), actions(), act(action, payload), step(frames), and snapshot(); return focused JSON-serializable state and keep production behavior unchanged. Hook results use standard JSON serialization without truncation; the game is responsible for selecting relevant state.",
      "Test meaningful transitions by observing state before and after input, including start, gameplay, damage/scoring or objectives, win/loss, and restart when those states exist.",
      'Examples: {operation:"open",url:"http://127.0.0.1:8000"}; {operation:"action",action:"start"}; {operation:"key",key:"Space"}; {operation:"observe"}.',
      "reset calls the game reset hook when available; it does not load source edits. Use reload after editing code (reset falls back to reload only without a hook).",
      "Check fresh browserEvents for runtime errors and missing assets. Request screenshots at visual checkpoints.",
    ],
    executionMode: "sequential",
    parameters: Type.Object({
      operation: operations,
      url: Type.Optional(
        Type.String({ description: "URL for open, for example http://127.0.0.1:8000." }),
      ),
      action: Type.Optional(
        Type.String({ description: "High-level action name for operation=action." }),
      ),
      payload: Type.Optional(
        Type.Unknown({ description: "Optional JSON-serializable payload for operation=action." }),
      ),
      key: Type.Optional(
        Type.String({ description: "Playwright key name for operation=key, such as Enter, ArrowLeft, or Space." }),
      ),
      x: Type.Optional(Type.Number({ description: "Viewport x coordinate for operation=click." })),
      y: Type.Optional(Type.Number({ description: "Viewport y coordinate for operation=click." })),
      frames: Type.Optional(
        Type.Integer({ description: "Frame count for operation=step.", minimum: 1, maximum: 3600 }),
      ),
      seed: Type.Optional(Type.Integer({ description: "Deterministic seed for operation=reset." })),
      durationMs: Type.Optional(
        Type.Integer({
          description: "Key hold or wait duration in milliseconds.",
          minimum: 0,
          maximum: 30000,
        }),
      ),
      settleMs: Type.Optional(
        Type.Integer({
          description: "Delay after the operation before observing. Defaults to 100ms.",
          minimum: 0,
          maximum: 10000,
        }),
      ),

      screenshot: Type.Optional(
        Type.Boolean({ description: "Include a screenshot. Defaults to true for open/observe and false otherwise." }),
      ),
    }),

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      if (signal?.aborted) throw new Error("Game test operation aborted.");

      // Legacy execute-time aliases intentionally remain outside the schema.
      const requestedOperation: string = params.operation;
      const operation = requestedOperation === "act" ? "action" : requestedOperation === "snapshot" ? "observe" : requestedOperation;
      const includeScreenshot = params.screenshot ?? ["open", "observe"].includes(operation);
      const settleMs = params.settleMs ?? 100;

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

      const page = await session.runOperation(operation, params, ctx.cwd);
      if (settleMs > 0) await page.waitForTimeout(settleMs);
      if (signal?.aborted) throw new Error("Game test operation aborted.");

      const result = await observe(page, includeScreenshot, session.takeEvents);
      const contextWindow = ctx.getContextUsage?.()?.contextWindow;
      if (result.observation.gameTest.snapshot !== null &&
          typeof contextWindow === "number" && Number.isFinite(contextWindow) && contextWindow > 0) {
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
