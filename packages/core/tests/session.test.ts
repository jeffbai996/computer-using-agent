import { describe, expect, it } from "vitest";
import {
  appendEvent,
  createEvent,
  createSession,
  requiresApproval,
  type ActionBatch,
} from "../src/index.js";

describe("session projection", () => {
  it("sets and clears a pending action batch", () => {
    const session = createSession("Click a button");
    const batch = makeBatch();

    const paused = appendEvent(
      session,
      createEvent(session, "approval.required", {
        batch,
        safetyChecks: [{ id: "safety_1", code: "approval_required", message: "click" }],
      }),
    );

    expect(paused.status).toBe("awaiting_approval");
    expect(paused.pendingActionBatch).toEqual(batch);

    const resumed = appendEvent(
      paused,
      createEvent(paused, "action_batch.executed", {
        batch,
        approved: true,
      }),
    );

    expect(resumed.status).toBe("running");
    expect(resumed.pendingActionBatch).toBeUndefined();
  });

  it("stores latest browser snapshot metadata", () => {
    const session = createSession("Capture a screenshot");
    const next = appendEvent(
      session,
      createEvent(session, "browser.snapshot_captured", {
        snapshot: {
          mimeType: "image/png",
          screenshotPath: "/api/artifacts/session/screenshot.png",
          localPath: "/tmp/screenshot.png",
          currentUrl: "https://example.com",
          title: "Example Domain",
          viewport: { width: 1024, height: 768 },
          capturedAt: "2026-04-13T00:00:00.000Z",
        },
      }),
    );

    expect(next.latestScreenshotPath).toBe("/api/artifacts/session/screenshot.png");
    expect(next.latestScreenshotLocalPath).toBe("/tmp/screenshot.png");
    expect(next.currentUrl).toBe("https://example.com");
  });

  it("rejects execution events after terminal state", () => {
    const session = createSession("Finish");
    const completed = appendEvent(
      session,
      createEvent(session, "task.completed", { message: "done" }),
    );

    expect(() =>
      appendEvent(
        completed,
        createEvent(completed, "action_batch.executed", { batch: makeBatch() }),
      ),
    ).toThrow(/terminal session/);
  });
});

describe("approval policy", () => {
  it("requires approval for risky or unknown action batches", () => {
    const decision = requiresApproval(makeBatch(), {
      currentUrl: "https://example.com",
    });

    expect(decision.required).toBe(true);
    expect(decision.reasons).toContain("click changes page state");
  });

  it("requires approval for denied domains", () => {
    const decision = requiresApproval(
      {
        id: "batch_1",
        description: "Wait on denied domain",
        actions: [
          {
            id: "action_1",
            kind: "wait",
            description: "Wait",
            payload: { url: "https://bad.example" },
          },
        ],
      },
      undefined,
      { denyDomains: ["bad.example"] },
    );

    expect(decision.required).toBe(true);
    expect(decision.reasons).toContain("domain denied: bad.example");
  });
});

function makeBatch(): ActionBatch {
  return {
    id: "batch_1",
    description: "Click",
    actions: [
      {
        id: "action_1",
        kind: "click",
        description: "Click submit",
        payload: { x: 10, y: 20 },
      },
    ],
  };
}
