import type { AgentAction } from "@cua/core";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
import type { BrowserExecutor, Screenshot } from "../ports.js";

export class PlaywrightBrowserExecutor implements BrowserExecutor {
  private browser?: Browser;
  private page?: Page;

  async open(): Promise<void> {
    this.browser = await chromium.launch({ headless: false });
    this.page = await this.browser.newPage({ viewport: { width: 1024, height: 768 } });
    await this.page.goto("about:blank");
  }

  async captureScreenshot(): Promise<Screenshot> {
    if (!this.page) {
      throw new Error("Browser page is not open.");
    }

    const buffer = await this.page.screenshot({ type: "png" });

    return {
      mimeType: "image/png",
      base64: buffer.toString("base64"),
    };
  }

  async execute(action: AgentAction): Promise<void> {
    if (!this.page) {
      throw new Error("Browser page is not open.");
    }

    if (action.kind === "click") {
      await this.page.mouse.click(
        Number(action.payload.x ?? 0),
        Number(action.payload.y ?? 0),
      );
      return;
    }

    if (action.kind === "type") {
      await this.page.keyboard.type(String(action.payload.text ?? ""));
      return;
    }

    if (action.kind === "scroll") {
      await this.page.mouse.wheel(
        Number(action.payload.deltaX ?? 0),
        Number(action.payload.deltaY ?? 500),
      );
      return;
    }

    if (action.kind === "navigate") {
      await this.page.goto(String(action.payload.url ?? "about:blank"));
      return;
    }

    if (action.kind === "keypress") {
      await this.page.keyboard.press(String(action.payload.key ?? "Enter"));
      return;
    }

    if (action.kind === "wait") {
      await this.page.waitForTimeout(Number(action.payload.ms ?? 500));
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
  }
}
