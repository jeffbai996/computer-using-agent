import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PlaywrightBrowserExecutor } from "../src/adapters/playwright-browser-executor.js";

const runBrowserTests = process.env.CUA_RUN_BROWSER_TESTS === "1";

describe.skipIf(!runBrowserTests)("PlaywrightBrowserExecutor", () => {
  it("executes a local fixture batch and captures a snapshot", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "cua-browser-test-"));
    const fixtureUrl =
      "data:text/html,<html><title>Fixture</title><body><input autofocus /></body></html>";
    const browser = new PlaywrightBrowserExecutor(dataDir, fixtureUrl);
    const sessionId = "session_test";

    await browser.open(sessionId);
    await browser.executeBatch(sessionId, {
      id: "batch_fixture",
      description: "Use local fixture",
      actions: [
        {
          id: "action_type",
          kind: "type",
          description: "Type text",
          payload: { text: "hello" },
        },
        {
          id: "action_key",
          kind: "keypress",
          description: "Press Enter",
          payload: { key: "ENTER" },
        },
        {
          id: "action_wait",
          kind: "wait",
          description: "Wait briefly",
          payload: { ms: 10 },
        },
      ],
    });

    const snapshot = await browser.captureSnapshot(sessionId);
    await browser.close(sessionId);

    expect(snapshot.mimeType).toBe("image/png");
    expect(snapshot.viewport.width).toBeGreaterThan(0);
    expect(snapshot.currentUrl).toBeDefined();
  });
});
