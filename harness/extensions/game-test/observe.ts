import type { createBrowserSession } from "./browser.ts";

export async function observe(
  page: any,
  includeScreenshot: boolean,
  takeEvents: ReturnType<typeof createBrowserSession>["takeEvents"],
) {
  const pageState = await page.evaluate(async () => {
    const truncation: Record<string, number> = {};
    const note = (kind: string, count = 1) => {
      if (count > 0) {
        truncation[kind] = (truncation[kind] ?? 0) + count;
      }
    };
    const text = (value: string, limit: number) => {
      note("strings", Math.max(0, value.length - limit));
      return value.slice(0, limit);
    };
    const jsonValue = (value: unknown) => {
      const json = JSON.stringify(value);
      if (json === undefined) {
        throw new Error("Game test hooks must return JSON-serializable data.");
      }
      return JSON.parse(json);
    };

    const gameTest = (window as any).__gameTest;
    let snapshot: any = null;
    let snapshotError: string | null = null;
    let actions: any = null;
    let actionsError: string | null = null;

    if (gameTest && typeof gameTest.snapshot === "function") {
      try {
        snapshot = jsonValue(await gameTest.snapshot());
      } catch (error) {
        snapshotError = String(error);
      }
    }

    if (gameTest && typeof gameTest.actions === "function") {
      try {
        actions = jsonValue(await gameTest.actions());
      } catch (error) {
        actionsError = String(error);
      }
    }


    return {
      url: text(location.href, 1500),
      title: text(document.title, 500),
      viewport: { width: innerWidth, height: innerHeight },
      visibility: document.visibilityState,
      activeElement: document.activeElement?.tagName.toLowerCase() ?? null,
      bodyText: text((document.body?.innerText ?? "").replace(/\s+/g, " ").trim(), 1500),
      truncation,
      gameTest: {
        available: Boolean(gameTest),
        methods: gameTest
          ? ["reset", "actions", "act", "step", "snapshot"].filter(
              (name) => typeof gameTest[name] === "function",
            )
          : [],
        actions,
        snapshot,
        snapshotError,
        actionsError,
      },
    };
  });

  const observation = {
    ...pageState,
    ...takeEvents(),
  };

  const content: any[] = [
    {
      type: "text",
      text: JSON.stringify(observation, null, 2),
    },
  ];

  if (includeScreenshot) {
    const screenshot = await page.screenshot({ type: "png" });
    content.push({
      type: "image",
      data: screenshot.toString("base64"),
      mimeType: "image/png",
    });
  }


  return { observation, content };
}
