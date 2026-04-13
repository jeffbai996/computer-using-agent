import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AgentService } from "../src/agent-service.js";
import { FakeBrowserExecutor } from "../src/adapters/fake-browser-executor.js";
import { FakeModelClient } from "../src/adapters/fake-model-client.js";
import { normalizeOpenAITurn } from "../src/adapters/openai-computer-use-client.js";
import { SqliteSessionStore } from "../src/session-store.js";

describe("AgentService", () => {
  it("starts a task and pauses for approval", async () => {
    const agent = await makeAgent();

    const session = await agent.startTask("Click a mock button");

    expect(session.status).toBe("awaiting_approval");
    expect(session.events.map((event) => event.type)).toContain("browser.snapshot_captured");
    expect(session.pendingActionBatch?.actions[0]?.kind).toBe("click");
  });

  it("executes an approved batch and completes after restart", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "cua-agent-test-"));
    const started = await makeAgent(dataDir).then((agent) =>
      agent.startTask("Click a mock button"),
    );
    const restarted = await makeAgent(dataDir);
    const approved = await restarted.approve(started.id);

    expect(approved.status).toBe("completed");
    expect(approved.events.map((event) => event.type)).toContain("action_batch.executed");
  });

  it("rejects a pending batch without executing it", async () => {
    const browser = new FakeBrowserExecutor();
    const agent = await makeAgent(undefined, browser);
    const started = await agent.startTask("Click a mock button");
    const rejected = await agent.reject(started.id, "Nope");

    expect(rejected.status).toBe("rejected");
    expect(browser.executedActions).toHaveLength(0);
  });

  it("exports projection and event log", async () => {
    const agent = await makeAgent();
    const started = await agent.startTask("Capture a mock session");
    const exported = JSON.parse(await agent.exportSession(started.id)) as {
      projection: { id: string; task: string };
      events: unknown[];
    };

    expect(exported.projection).toMatchObject({
      id: started.id,
      task: "Capture a mock session",
    });
    expect(exported.events.length).toBeGreaterThan(0);
  });
});

describe("OpenAI computer-use normalization", () => {
  it("normalizes GA batched computer calls", () => {
    const outcome = normalizeOpenAITurn({
      id: "response_1",
      output: [
        {
          type: "computer_call",
          call_id: "call_1",
          actions: [
            { type: "click", x: 1, y: 2 },
            { type: "type", text: "hello" },
          ],
        },
      ],
    });

    expect(outcome.type).toBe("action_batch");
    expect(outcome.type === "action_batch" ? outcome.batch.actions : []).toHaveLength(2);
  });

  it("normalizes screenshot-first turns", () => {
    const outcome = normalizeOpenAITurn({
      id: "response_1",
      output: [
        {
          type: "computer_call",
          call_id: "call_1",
          actions: [{ type: "screenshot" }],
        },
      ],
    });

    expect(outcome).toMatchObject({
      type: "needs_screenshot",
      callId: "call_1",
    });
  });

  it("normalizes text-only turns as completion", () => {
    const outcome = normalizeOpenAITurn({
      id: "response_1",
      output: [{ type: "message", content: [{ text: "done" }] }],
    });

    expect(outcome).toMatchObject({ type: "completed", message: "done" });
  });
});

async function makeAgent(
  dataDir?: string,
  browser = new FakeBrowserExecutor(),
): Promise<AgentService> {
  const resolvedDataDir = dataDir ?? (await mkdtemp(path.join(tmpdir(), "cua-agent-test-")));

  return new AgentService(
    new SqliteSessionStore(resolvedDataDir),
    new FakeModelClient(),
    browser,
  );
}
