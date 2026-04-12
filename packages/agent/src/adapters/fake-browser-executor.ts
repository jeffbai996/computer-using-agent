import type { AgentAction } from "@cua/core";
import type { BrowserExecutor, Screenshot } from "../ports.js";

const transparentPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export class FakeBrowserExecutor implements BrowserExecutor {
  public executedActions: AgentAction[] = [];

  async open(): Promise<void> {
    return;
  }

  async captureScreenshot(): Promise<Screenshot> {
    return {
      mimeType: "image/png",
      base64: transparentPng,
    };
  }

  async execute(action: AgentAction): Promise<void> {
    this.executedActions.push(action);
  }

  async close(): Promise<void> {
    return;
  }
}
