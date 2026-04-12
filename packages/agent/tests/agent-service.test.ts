import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AgentService } from "../src/agent-service.js";
import { FakeBrowserExecutor } from "../src/adapters/fake-browser-executor.js";
import { FakeModelClient } from "../src/adapters/fake-model-client.js";
import { SqliteSessionStore } from "../src/session-store.js";

describe("AgentService", () => {
  it("starts a task and pauses for approval", async () => {
    const agent = await makeAgent();

    const session = await agent.startTask("Click a mock button");

    expect(session.status).toBe("awaiting_approval");
    expect(session.events.map((event) => event.type)).toContain("screenshot.captured");
    expect(session.pendingAction?.kind).toBe("click");
  });

  it("executes an approved action and completes the mock task", async () => {
    const agent = await makeAgent();
    const started = await agent.startTask("Click a mock button");
    const approved = await agent.approve(started.id);

    expect(approved.status).toBe("completed");
    expect(approved.events.map((event) => event.type)).toContain("action.executed");
  });

  it("exports persisted session JSON", async () => {
    const agent = await makeAgent();
    const started = await agent.startTask("Capture a mock session");
    const exported = await agent.exportSession(started.id);

    expect(JSON.parse(exported)).toMatchObject({
      id: started.id,
      task: "Capture a mock session",
    });
  });
});

async function makeAgent(): Promise<AgentService> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "cua-agent-test-"));

  return new AgentService(
    new SqliteSessionStore(dataDir),
    new FakeModelClient(),
    new FakeBrowserExecutor(),
  );
}
