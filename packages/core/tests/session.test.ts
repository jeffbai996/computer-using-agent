import { describe, expect, it } from "vitest";
import {
  actionNeedsApproval,
  appendEvent,
  createEvent,
  createSession,
  serializeSession,
  deserializeSession,
  type AgentAction,
} from "../src/index.js";

describe("session reducer", () => {
  it("pauses when approval is required", () => {
    const session = createSession("Open example.com");
    const action: AgentAction = {
      id: "action_1",
      kind: "click",
      description: "Click submit",
      payload: { x: 10, y: 20 },
    };

    const next = appendEvent(
      session,
      createEvent(session.id, "approval.required", { action }),
    );

    expect(next.status).toBe("awaiting_approval");
    expect(next.pendingAction).toEqual(action);
  });

  it("clears pending actions after execution", () => {
    const session = createSession("Open example.com");
    const action: AgentAction = {
      id: "action_1",
      kind: "click",
      description: "Click submit",
      payload: { x: 10, y: 20 },
    };

    const paused = appendEvent(
      session,
      createEvent(session.id, "approval.required", { action }),
    );
    const resumed = appendEvent(
      paused,
      createEvent(session.id, "action.executed", { action }),
    );

    expect(resumed.status).toBe("running");
    expect(resumed.pendingAction).toBeUndefined();
  });

  it("serializes sessions for exports", () => {
    const session = createSession("Collect a screenshot");
    const parsed = deserializeSession(serializeSession(session));

    expect(parsed.id).toBe(session.id);
    expect(parsed.task).toBe(session.task);
  });
});

describe("approval policy", () => {
  it("requires approval for sensitive actions", () => {
    expect(
      actionNeedsApproval({
        id: "action_1",
        kind: "wait",
        description: "Wait after a submit",
        payload: {},
        sensitive: true,
      }),
    ).toBe(true);
  });

  it("does not require approval for waits", () => {
    expect(
      actionNeedsApproval({
        id: "action_1",
        kind: "wait",
        description: "Wait for the next screen",
        payload: {},
      }),
    ).toBe(false);
  });
});
