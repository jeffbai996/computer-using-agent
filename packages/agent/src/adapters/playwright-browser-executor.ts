import path from "node:path";
import type { ActionBatch, BrowserSnapshot, ComputerAction } from "@cua/core";
import type { BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import type { BatchExecutionResult, BrowserExecutor } from "../ports.js";

const VIEWPORT = { width: 1024, height: 768 };

type BrowserState = {
  context: BrowserContext;
  page: Page;
};

export class PlaywrightBrowserExecutor implements BrowserExecutor {
  private readonly sessions = new Map<string, BrowserState>();

  constructor(
    private readonly dataDir = process.env.CUA_DATA_DIR ?? ".cua-data",
    private readonly startUrl = process.env.CUA_START_URL ?? "about:blank",
  ) {}

  async open(sessionId: string, options: { startUrl?: string } = {}): Promise<void> {
    if (this.sessions.has(sessionId)) {
      return;
    }

    const userDataDir = path.join(this.dataDir, "browser", sessionId);
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: VIEWPORT,
      chromiumSandbox: true,
      env: {},
      args: ["--disable-extensions", "--disable-file-system"],
    });
    const page = context.pages()[0] ?? (await context.newPage());

    if (page.url() === "about:blank") {
      await page.goto(options.startUrl ?? this.startUrl);
    }

    this.sessions.set(sessionId, { context, page });
  }

  async captureSnapshot(sessionId: string): Promise<BrowserSnapshot> {
    const { page } = this.requireState(sessionId);
    const buffer = await page.screenshot({ type: "png" });

    return {
      mimeType: "image/png",
      base64: buffer.toString("base64"),
      currentUrl: page.url(),
      title: await page.title(),
      viewport: page.viewportSize() ?? VIEWPORT,
      capturedAt: new Date().toISOString(),
    };
  }

  async executeBatch(
    sessionId: string,
    batch: ActionBatch,
  ): Promise<BatchExecutionResult> {
    const { page } = this.requireState(sessionId);

    for (const action of batch.actions) {
      await executeAction(page, action);
    }

    return {
      executedActions: batch.actions,
      snapshot: await this.captureSnapshot(sessionId),
    };
  }

  async close(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);

    if (!state) {
      return;
    }

    await state.context.close();
    this.sessions.delete(sessionId);
  }

  private requireState(sessionId: string): BrowserState {
    const state = this.sessions.get(sessionId);

    if (!state) {
      throw new Error(`Browser session ${sessionId} is not open.`);
    }

    return state;
  }
}

async function executeAction(page: Page, action: ComputerAction): Promise<void> {
  if (action.kind === "click") {
    await page.mouse.click(numberPayload(action, "x"), numberPayload(action, "y"), {
      button: mouseButton(action),
    });
    return;
  }

  if (action.kind === "double_click") {
    await page.mouse.dblclick(numberPayload(action, "x"), numberPayload(action, "y"));
    return;
  }

  if (action.kind === "type") {
    await page.keyboard.type(String(action.payload.text ?? ""));
    return;
  }

  if (action.kind === "scroll") {
    await page.mouse.wheel(
      Number(action.payload.deltaX ?? action.payload.scroll_x ?? 0),
      Number(action.payload.deltaY ?? action.payload.scroll_y ?? 500),
    );
    return;
  }

  if (action.kind === "keypress") {
    await pressKeys(page, action.payload.keys ?? action.payload.key);
    return;
  }

  if (action.kind === "wait") {
    await page.waitForTimeout(Number(action.payload.ms ?? 500));
    return;
  }

  if (action.kind === "move") {
    await page.mouse.move(numberPayload(action, "x"), numberPayload(action, "y"));
    return;
  }

  if (action.kind === "drag") {
    await drag(page, action);
    return;
  }

  if (action.kind === "screenshot") {
    return;
  }

  throw new Error(`Unsupported computer action: ${action.kind}`);
}

function numberPayload(action: ComputerAction, key: string): number {
  return Number(action.payload[key] ?? 0);
}

function mouseButton(action: ComputerAction): "left" | "right" | "middle" {
  const button = String(action.payload.button ?? "left").toLowerCase();

  if (button === "right" || button === "middle") {
    return button;
  }

  return "left";
}

async function pressKeys(page: Page, rawKeys: unknown): Promise<void> {
  const keys = Array.isArray(rawKeys) ? rawKeys : [rawKeys ?? "Enter"];
  const normalized = keys.map((key) => normalizeKey(String(key)));

  await page.keyboard.press(normalized.join("+"));
}

async function drag(page: Page, action: ComputerAction): Promise<void> {
  const path = action.payload.path;

  if (!Array.isArray(path) || path.length < 2) {
    throw new Error("Drag action requires a path with at least two points.");
  }

  const points = path.map((point) => point as { x?: number; y?: number });
  const first = points[0];

  await page.mouse.move(Number(first.x ?? 0), Number(first.y ?? 0));
  await page.mouse.down();

  for (const point of points.slice(1)) {
    await page.mouse.move(Number(point.x ?? 0), Number(point.y ?? 0));
  }

  await page.mouse.up();
}

function normalizeKey(key: string): string {
  const normalized = key.toUpperCase();
  const map: Record<string, string> = {
    ENTER: "Enter",
    RETURN: "Enter",
    ESC: "Escape",
    ESCAPE: "Escape",
    TAB: "Tab",
    SPACE: "Space",
    BACKSPACE: "Backspace",
    DELETE: "Delete",
    DEL: "Delete",
    ARROWLEFT: "ArrowLeft",
    ARROWRIGHT: "ArrowRight",
    ARROWUP: "ArrowUp",
    ARROWDOWN: "ArrowDown",
    CTRL: "Control",
    CONTROL: "Control",
    CMD: "Meta",
    COMMAND: "Meta",
    META: "Meta",
    SHIFT: "Shift",
    ALT: "Alt",
  };

  return map[normalized] ?? key;
}
