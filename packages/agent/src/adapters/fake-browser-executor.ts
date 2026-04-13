import type { ActionBatch, BrowserSnapshot, ComputerAction } from "@cua/core";
import type { BatchExecutionResult, BrowserExecutor } from "../ports.js";

const transparentPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export class FakeBrowserExecutor implements BrowserExecutor {
  public executedActions: ComputerAction[] = [];

  async open(_sessionId: string): Promise<void> {
    return;
  }

  async captureSnapshot(_sessionId: string): Promise<BrowserSnapshot> {
    return makeSnapshot();
  }

  async executeBatch(
    _sessionId: string,
    batch: ActionBatch,
  ): Promise<BatchExecutionResult> {
    this.executedActions.push(...batch.actions);

    return {
      executedActions: batch.actions,
      snapshot: makeSnapshot(),
    };
  }

  async close(_sessionId: string): Promise<void> {
    return;
  }
}

function makeSnapshot(): BrowserSnapshot {
  return {
    mimeType: "image/png",
    base64: transparentPng,
    currentUrl: "about:blank",
    title: "Mock Browser",
    viewport: { width: 1024, height: 768 },
    capturedAt: new Date().toISOString(),
  };
}
