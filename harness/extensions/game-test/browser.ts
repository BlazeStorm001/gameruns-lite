import type { Browser, Page } from "@playwright/test";
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
  browser?: Browser;
  page?: Page;
  events: BrowserEvent[];
};

type OperationParams = {
  url?: string;
  key?: string;
  durationMs?: number;
  x?: number;
  y?: number;
  input?: unknown;
  ticks?: number;
  seed?: number;
  mode?: "manual" | "realtime";
};

function harnessRoot(cwd: string) {
  return resolve(process.env.AGENT_EVAL_HARNESS_DIR || resolve(cwd, ".harness"));
}

async function loadChromium(cwd: string) {
  const root = harnessRoot(cwd);
  const entry = resolve(root, "node_modules/@playwright/test/index.mjs");
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
    const text =
      raw.length > MAX_TEXT * 2 ? `${raw.slice(0, MAX_TEXT)} ... [truncated] ... ${raw.slice(-MAX_TEXT)}` : raw;
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
    await state.browser?.close();
    state.browser = undefined;
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

  async function runOperation(operation: string, params: OperationParams, cwd = process.cwd()) {
    let transition: unknown;
    let hasTransition = false;
    if (operation === "open") {
      if (!params.url) throw new Error("operation=open requires url.");
      await closeBrowser();

      const chromium = await loadChromium(cwd);
      try {
        state.browser = await chromium.launch({ headless: true });
      } catch (error) {
        throw new Error(
          `Could not launch Chromium: ${String(error)}\n\n` + "Run ./harness/scripts/setup.sh --install to install the pinned browser.\n" +
          "Run ./harness/scripts/setup.sh --check to verify the installation.",
          { cause: error },
        );
      }
      try {
        const context = await state.browser.newContext({
          viewport: { width: 1280, height: 720 },
        });
        state.page = await context.newPage();

        state.page.on("console", (message) => {
          if (["error", "warning"].includes(message.type())) remember(`console.${message.type()}`, message.text());
        });
        state.page.on("pageerror", (error) => remember("pageerror", error));
        state.page.on("requestfailed", (request) => {
          remember("requestfailed", `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
        });
        state.page.on("response", (response) => {
          if (response.status() >= 400) remember("http", `${response.status()} ${response.url()}`);
        });

        await state.page.goto(params.url, { waitUntil: "domcontentloaded", timeout: 15000 });
      } catch (error) {
        await closeBrowser();
        throw new Error(`Could not open ${params.url}: ${String(error)}`, { cause: error });
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
      } else if (operation === "step") {
        transition = await page.evaluate(
          async ({ input, ticks }) => {
            const api = (window as any).__gameTest;
            if (!api || typeof api.step !== "function") {
              throw new Error("window.__gameTest.step({ input, ticks }) is not available");
            }
            return await api.step({ input: input ?? {}, ticks: ticks ?? 1 });
          },
          { input: params.input, ticks: params.ticks },
        );
        hasTransition = true;
      } else if (operation === "wait") {
        await page.waitForTimeout(params.durationMs ?? 1000);
      } else if (operation === "reset") {
        const reset = await page.evaluate(
          async ({ seed, mode }) => {
            const api = (window as any).__gameTest;
            if (!api || typeof api.reset !== "function") return { available: false };
            return { available: true, state: await api.reset({ seed, mode }) };
          },
          { seed: params.seed, mode: params.mode ?? "manual" },
        );
        transition = reset.state;
        hasTransition = reset.available;
        if (!reset.available) {
          state.events = [];
          dropped = 0;
          await page.reload({ waitUntil: "domcontentloaded" });
        }
      } else if (operation === "set-mode") {
        if (!params.mode) throw new Error("operation=set-mode requires mode.");
        transition = await page.evaluate(async (mode: "manual" | "realtime") => {
          const api = (window as any).__gameTest;
          if (!api || typeof api.setMode !== "function") {
            throw new Error("window.__gameTest.setMode(mode) is not available");
          }
          return await api.setMode(mode);
        }, params.mode);
        hasTransition = true;
      } else if (operation === "reload") {
        state.events = [];
        dropped = 0;
        await page.reload({ waitUntil: "domcontentloaded" });
      }
    }

    if (hasTransition) {
      try {
        const json = JSON.stringify(transition);
        if (json === undefined) throw new Error("state is undefined");
        transition = JSON.parse(json);
      } catch (error) {
        throw new Error(`Game test transition must be JSON-serializable: ${String(error)}`, { cause: error });
      }
    }

    return { page: requirePage(), transition };
  }

  return { close: closeBrowser, runOperation, takeEvents };
}
