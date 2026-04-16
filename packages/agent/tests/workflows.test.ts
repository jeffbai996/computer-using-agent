import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AgentService } from "../src/agent-service.js";
import { FakeBrowserExecutor } from "../src/adapters/fake-browser-executor.js";
import { FakeModelClient } from "../src/adapters/fake-model-client.js";
import { SqliteSessionStore } from "../src/session-store.js";
import {
  createWorkflowStart,
  getWorkflowFixtureHtml,
  listWorkflowSummaries,
} from "../src/workflows/index.js";

describe("workflow catalog", () => {
  it("lists the food-order workflow", () => {
    expect(listWorkflowSummaries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "food-order",
          defaultMode: "fixture",
        }),
      ]),
    );
  });

  it("builds a fixture start plan with sanitized metadata", () => {
    const plan = createWorkflowStart("food-order", {
      mode: "fixture",
      inputs: {
        cuisine: "thai",
        budget: 30,
        startUrl: "https://example.com/private-start",
      },
    });

    expect(plan.startUrl).toMatch(/^data:text\/html/);
    expect(plan.task).toContain("[workflow:food-order]");
    expect(plan.metadata).toMatchObject({
      id: "food-order",
      mode: "fixture",
      target: "fixture://food-order",
    });
    expect(plan.metadata.inputs.startUrl).toBeUndefined();
  });

  it("returns fixture html for the food-order workflow", () => {
    expect(getWorkflowFixtureHtml("food-order")).toContain("Food ordering fixture");
  });

  it("persists workflow metadata into session exports", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "cua-workflow-test-"));
    const plan = createWorkflowStart("food-order", {
      mode: "fixture",
      inputs: { cuisine: "thai", budget: 30 },
    });
    const agent = new AgentService(
      new SqliteSessionStore(dataDir),
      new FakeModelClient(),
      new FakeBrowserExecutor(),
    );
    const session = await agent.startTask(plan.task, {
      workflow: plan.metadata,
      startUrl: plan.startUrl,
    });
    const exported = JSON.parse(await agent.exportSession(session.id)) as {
      projection: { workflow?: { id: string; mode: string } };
    };

    expect(exported.projection.workflow).toMatchObject({
      id: "food-order",
      mode: "fixture",
    });
  });
});

