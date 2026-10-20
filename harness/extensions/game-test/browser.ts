import { access } from "node:fs/promises";

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_EVENTS = 12;
const MAX_TEXT = 500;

type BrowserEvent = {
  kind: string;
  text: string;
  count: number;
};

type BrowserState = {
  browser?: any;
  context?: any;
  page?: any;
  events: BrowserEvent[];
};

type OperationParams = {
  url?: string;
  key?: string;
  durationMs?: number;
  x?: number;
  y?: number;
  action?: string;
  payload?: unknown;
  frames?: number;
  seed?: number;
};

function harnessRoot(cwd: string) {
  return resolve(process.env.AGENT_EVAL_HARNESS_DIR || resolve(cwd, ".harness"));
}

async function loadChromium(cwd: string) {
  const root = harnessRoot(cwd);
  const entry = resolve(root, "node_modules/playwright/index.mjs");
  await access(entry).catch(() => {
    throw new Error(
      `Playwright is not installed in ${root}. Run harness/scripts/setup.sh --install first.`,
    );
  });

  const playwright = await import(pathToFileURL(entry).href);
  return playwright.chromium;
}


export function createBrowserSession() {
  const state: BrowserState = { events: [] };

  let dropped = 0;

  function remember(kind: string, value: unknown) {
    const raw = String(value ?? "").replace(/\s+/g, " ");
    const text = raw.length > MAX_TEXT * 2
      ? `${raw.slice(0, MAX_TEXT)} ... [truncated] ... ${raw.slice(-MAX_TEXT)}`
      : raw;
    const previous = state.events.find((event) => event.kind === kind && event.text === text);
    if (previous) {
      previous.count++;
      return;
    }
    state.events.push({ kind, text, count: 1 });
    if (state.events.length > MAX_EVENTS) {
      state.events.shift();
      dropped++;
    }
  }

  async function closeBrowser() {
    await state.browser?.close().catch(() => undefined);
    state.browser = undefined;
    state.context = undefined;
    state.page = undefined;
    state.events = [];
    dropped = 0;
  }

  function requirePage() {
    if (!state.page || state.page.isClosed()) {
      throw new Error("No game page is open. Call game_test with operation=open first.");
    }
    return state.page;
  }

  function takeEvents() {
    const events = state.events;
    const capturedDropped = dropped;
    state.events = [];
    dropped = 0;
    return {
      browserEvents: events,
      browserEventInfo: { dropped: capturedDropped, limit: MAX_EVENTS },
    };
  }

  async function runOperation(operation: string, params: OperationParams, cwd: string) {
    if (operation === "open") {
      if (!params.url) throw new Error("operation=open requires url.");
      await closeBrowser();
      const chromium = await loadChromium(cwd);
      try {
        state.browser = await chromium.launch({ headless: true });
      } catch (error) {
        throw new Error(
          `Could not launch Chromium: ${String(error)}\n\n` +
          "Run ./harness/scripts/setup.sh --install to install the pinned browser.\n" +
          "Run ./harness/scripts/setup.sh --check to verify the installation.",
          { cause: error },
        );
      }
      state.context = await state.browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      state.page = await state.context.newPage();

      state.page.on("console", (message: any) => {
        if (["error", "warning"].includes(message.type())) remember(`console.${message.type()}`, message.text());
      });
      state.page.on("pageerror", (error: any) => remember("pageerror", error));
      state.page.on("requestfailed", (request: any) => {
        remember("requestfailed", `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
      });
      state.page.on("response", (response: any) => {
        if (response.status() >= 400) remember("http", `${response.status()} ${response.url()}`);
      });

      try {
        await state.page.goto(params.url, { waitUntil: "domcontentloaded", timeout: 15000 });
      } catch (error) {
        await closeBrowser();
        throw new Error(`Could not open ${params.url}: ${String(error)}`);
      }
    } else {
      const page = requirePage();

      if (operation === "key") {
        if (!params.key) throw new Error("operation=key requires key.");
        await page.keyboard.down(params.key);
        await page.waitForTimeout(params.durationMs ?? 50);
        await page.keyboard.up(params.key);
      } else if (operation === "click") {
        if (params.x === undefined || params.y === undefined) {
          throw new Error("operation=click requires x and y.");
        }
        await page.mouse.click(params.x, params.y);
      } else if (operation === "action") {
        if (!params.action) throw new Error("operation=action requires action.");
        await page.evaluate(
          async ({ action, payload }: { action: string; payload: unknown }) => {
            const api = (window as any).__gameTest;
            if (!api || typeof api.act !== "function") {
              throw new Error("window.__gameTest.act(action, payload) is not available");
            }
            await api.act(action, payload);
          },
          { action: params.action, payload: params.payload },
        );
      } else if (operation === "step") {
        if (!params.frames) throw new Error("operation=step requires frames.");
        await page.evaluate(async (frames: number) => {
          const api = (window as any).__gameTest;
          if (!api || typeof api.step !== "function") {
            throw new Error("window.__gameTest.step(frames) is not available");
          }
          await api.step(frames);
        }, params.frames);
      } else if (operation === "wait") {
        await page.waitForTimeout(params.durationMs ?? 1000);
      } else if (operation === "reset") {
        const resetThroughHook = await page.evaluate(async (seed: number | undefined) => {
          const api = (window as any).__gameTest;
          if (!api || typeof api.reset !== "function") return false;
          await api.reset(seed);
          return true;
        }, params.seed);
        if (!resetThroughHook) {
          state.events = [];
          dropped = 0;
          await page.reload({ waitUntil: "domcontentloaded" });
        }
      } else if (operation === "reload") {
        state.events = [];
        dropped = 0;
        await page.reload({ waitUntil: "domcontentloaded" });
      }
    }

    return requirePage();
  }

  return { close: closeBrowser, runOperation, takeEvents };
}
