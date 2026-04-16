import cors from "cors";
import express from "express";
import path from "node:path";
import { z } from "zod";
import type { AgentService } from "../agent-service.js";
import {
  createWorkflowStart,
  getWorkflowFixtureHtml,
  getWorkflowSummary,
  listWorkflowSummaries,
} from "../workflows/index.js";

const startTaskSchema = z.object({
  task: z.string().min(1),
});

const workflowStartSchema = z.object({
  mode: z.enum(["fixture", "browse", "real"]).optional(),
  inputs: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

const rejectSchema = z.object({
  reason: z.string().optional(),
});

export function createApp(agent: AgentService): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));
  app.use(
    "/api/artifacts",
    express.static(path.join(process.env.CUA_DATA_DIR ?? ".cua-data", "artifacts")),
  );

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.get("/api/sessions", async (_request, response, next) => {
    try {
      response.json(await agent.listSessions());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/workflows", (_request, response) => {
    response.json(listWorkflowSummaries());
  });

  app.get("/api/workflows/:workflowId", (request, response) => {
    const workflow = getWorkflowSummary(request.params.workflowId);

    if (!workflow) {
      response.status(404).json({ error: "Workflow not found." });
      return;
    }

    response.json(workflow);
  });

  app.get("/api/fixtures/:workflowId", (request, response) => {
    const html = getWorkflowFixtureHtml(request.params.workflowId);

    if (!html) {
      response.status(404).send("Fixture not found.");
      return;
    }

    response.type("html").send(html);
  });

  app.post("/api/workflows/:workflowId/start", async (request, response, next) => {
    try {
      const body = workflowStartSchema.parse(request.body ?? {});
      const plan = createWorkflowStart(request.params.workflowId, {
        mode: body.mode,
        inputs: body.inputs,
      });

      response.status(201).json(
        await agent.startTask(plan.task, {
          workflow: plan.metadata,
          startUrl: plan.startUrl,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/tasks", async (request, response, next) => {
    try {
      const body = startTaskSchema.parse(request.body);
      response.status(201).json(await agent.startTask(body.task));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions/:sessionId", async (request, response, next) => {
    try {
      const session = await agent.getSession(request.params.sessionId);

      if (!session) {
        response.status(404).json({ error: "Session not found." });
        return;
      }

      response.json(session);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:sessionId/approve", async (request, response, next) => {
    try {
      response.json(await agent.approve(request.params.sessionId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:sessionId/resume", async (request, response, next) => {
    try {
      response.json(await agent.resume(request.params.sessionId));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/sessions/:sessionId/reject", async (request, response, next) => {
    try {
      const body = rejectSchema.parse(request.body ?? {});
      response.json(await agent.reject(request.params.sessionId, body.reason));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/sessions/:sessionId/export", async (request, response, next) => {
    try {
      response.type("application/json").send(await agent.exportSession(request.params.sessionId));
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: express.Request, response: express.Response) => {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    response.status(500).json({ error: message });
  });

  return app;
}
