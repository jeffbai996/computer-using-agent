import type { AgentSession } from "@cua/core";
import type { WorkflowInputs, WorkflowMode, WorkflowSummary } from "@cua/core";
import { AgentService } from "../agent-service.js";
import { FakeBrowserExecutor } from "../adapters/fake-browser-executor.js";
import { FakeModelClient } from "../adapters/fake-model-client.js";
import { OpenAIComputerUseClient } from "../adapters/openai-computer-use-client.js";
import { PlaywrightBrowserExecutor } from "../adapters/playwright-browser-executor.js";
import { createApp } from "../server/app.js";
import { SqliteSessionStore } from "../session-store.js";
import {
  createWorkflowStart,
  getWorkflowSummary,
  listWorkflowSummaries,
} from "../workflows/index.js";

const command = process.argv[2] ?? "help";
const args = process.argv.slice(3);

async function main(): Promise<void> {
  if (command === "serve") {
    const agent = makeAgent({ real: isRealMode(args) });
    const app = createApp(agent);
    const port = Number(process.env.CUA_PORT ?? 4317);

    app.listen(port, "127.0.0.1", () => {
      console.log(`computer-using-agent API listening on http://127.0.0.1:${port}`);
    });
    return;
  }

  if (command === "workflow") {
    await handleWorkflowCommand(args);
    return;
  }

  const agent = makeAgent({ real: isRealMode(args) });

  if (command === "start") {
    const task = stripFlags(args).join(" ").trim();

    if (!task) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- start \"task\" [--real]");
    }

    printSession(await agent.startTask(task));
    return;
  }

  if (command === "resume") {
    const sessionId = stripFlags(args)[0];

    if (!sessionId) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- resume <sessionId> [--real]");
    }

    printSession(await agent.resume(sessionId));
    return;
  }

  if (command === "list") {
    for (const session of await agent.listSessions()) {
      printSession(session);
    }
    return;
  }

  if (command === "approve") {
    const sessionId = stripFlags(args)[0];

    if (!sessionId) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- approve <sessionId> [--real]");
    }

    printSession(await agent.approve(sessionId));
    return;
  }

  if (command === "reject") {
    const cleanArgs = stripFlags(args);
    const sessionId = cleanArgs[0];
    const reason = cleanArgs.slice(1).join(" ");

    if (!sessionId) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- reject <sessionId> [reason]");
    }

    printSession(await agent.reject(sessionId, reason));
    return;
  }

  if (command === "watch") {
    const sessionId = stripFlags(args)[0];

    if (!sessionId) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- watch <sessionId>");
    }

    await watchSession(agent, sessionId);
    return;
  }

  if (command === "export") {
    const sessionId = stripFlags(args)[0];

    if (!sessionId) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- export <sessionId>");
    }

    console.log(await agent.exportSession(sessionId));
    return;
  }

  console.log(`Usage:
  npm run cli --workspace @cua/agent -- serve [--real]
  npm run cli --workspace @cua/agent -- start "task" [--real]
  npm run cli --workspace @cua/agent -- resume <sessionId> [--real]
  npm run cli --workspace @cua/agent -- list
  npm run cli --workspace @cua/agent -- approve <sessionId> [--real]
  npm run cli --workspace @cua/agent -- reject <sessionId> [reason]
  npm run cli --workspace @cua/agent -- watch <sessionId>
  npm run cli --workspace @cua/agent -- export <sessionId>
  npm run cli --workspace @cua/agent -- workflow list
  npm run cli --workspace @cua/agent -- workflow describe <workflowId>
  npm run cli --workspace @cua/agent -- workflow start <workflowId> [--mode fixture|browse|real] [--input key=value] [--real]
  npm run cli --workspace @cua/agent -- workflow export <sessionId>`);
}

async function handleWorkflowCommand(rawArgs: string[]): Promise<void> {
  const subcommand = rawArgs[0] ?? "help";

  if (subcommand === "list") {
    for (const workflow of listWorkflowSummaries()) {
      console.log(`${workflow.id}\t${workflow.title}\t${workflow.modes.join(",")}`);
    }
    return;
  }

  if (subcommand === "describe") {
    const workflow = getWorkflowSummary(rawArgs[1] ?? "");

    if (!workflow) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- workflow describe <workflowId>");
    }

    printWorkflow(workflow);
    return;
  }

  if (subcommand === "start") {
    const workflowId = rawArgs[1];

    if (!workflowId) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- workflow start <workflowId>");
    }

    const options = parseWorkflowOptions(rawArgs.slice(2));
    const plan = createWorkflowStart(workflowId, options);
    const agent = makeAgent({ real: isRealMode(rawArgs) });
    printSession(
      await agent.startTask(plan.task, {
        workflow: plan.metadata,
        startUrl: plan.startUrl,
      }),
    );
    return;
  }

  if (subcommand === "export") {
    const sessionId = rawArgs[1];

    if (!sessionId) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- workflow export <sessionId>");
    }

    console.log(await makeAgent({ real: isRealMode(rawArgs) }).exportSession(sessionId));
    return;
  }

  console.log(`Usage:
  npm run cli --workspace @cua/agent -- workflow list
  npm run cli --workspace @cua/agent -- workflow describe <workflowId>
  npm run cli --workspace @cua/agent -- workflow start <workflowId> [--mode fixture|browse|real] [--input key=value] [--real]
  npm run cli --workspace @cua/agent -- workflow export <sessionId>`);
}

function makeAgent(options: { real?: boolean } = {}): AgentService {
  const store = new SqliteSessionStore();

  if (!options.real) {
    return new AgentService(store, new FakeModelClient(), new FakeBrowserExecutor());
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY before running with --real.");
  }

  return new AgentService(
    store,
    new OpenAIComputerUseClient(),
    new PlaywrightBrowserExecutor(),
  );
}

function printSession(session: AgentSession): void {
  const pending = session.pendingActionBatch
    ? ` pending=${session.pendingActionBatch.actions.length}`
    : "";
  const error = session.lastError ? ` error="${session.lastError}"` : "";
  const workflow = session.workflow ? ` workflow=${session.workflow.id}` : "";

  console.log(`${session.id} status=${session.status}${workflow}${pending}${error}`);
}

function printWorkflow(workflow: WorkflowSummary): void {
  console.log(`${workflow.id}: ${workflow.title}`);
  console.log(workflow.description);
  console.log(`Modes: ${workflow.modes.join(", ")}; default=${workflow.defaultMode}`);
  console.log("Inputs:");
  for (const field of workflow.inputFields) {
    const required = field.required ? " required" : "";
    const defaultValue =
      field.defaultValue === undefined || field.defaultValue === ""
        ? ""
        : ` default=${field.defaultValue}`;
    console.log(`- ${field.name} (${field.kind}${required}${defaultValue})`);
  }
}

async function watchSession(agent: AgentService, sessionId: string): Promise<void> {
  let lastSequence = 0;

  while (true) {
    const session = await agent.getSession(sessionId);

    if (!session) {
      throw new Error(`Unknown session ${sessionId}.`);
    }

    for (const event of session.events.filter((item) => item.sequence > lastSequence)) {
      console.log(`#${event.sequence} ${event.type} ${event.createdAt}`);
      lastSequence = event.sequence;
    }

    if (["completed", "failed", "rejected", "blocked"].includes(session.status)) {
      printSession(session);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function isRealMode(rawArgs: string[]): boolean {
  return rawArgs.includes("--real") || process.env.CUA_REAL_MODE === "1";
}

function stripFlags(rawArgs: string[]): string[] {
  return rawArgs.filter((arg) => arg !== "--real");
}

function parseWorkflowOptions(rawArgs: string[]): {
  mode?: WorkflowMode;
  inputs: WorkflowInputs;
} {
  const inputs: WorkflowInputs = {};
  let mode: WorkflowMode | undefined;

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === "--real") {
      continue;
    }

    if (arg === "--mode") {
      mode = parseWorkflowMode(rawArgs[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      mode = parseWorkflowMode(arg.slice("--mode=".length));
      continue;
    }

    if (arg === "--input") {
      assignInput(inputs, rawArgs[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      assignInput(inputs, arg.slice("--input=".length));
    }
  }

  return { mode, inputs };
}

function parseWorkflowMode(rawMode: string | undefined): WorkflowMode {
  if (rawMode === "fixture" || rawMode === "browse" || rawMode === "real") {
    return rawMode;
  }

  throw new Error("Workflow mode must be fixture, browse, or real.");
}

function assignInput(inputs: WorkflowInputs, rawPair: string | undefined): void {
  if (!rawPair || !rawPair.includes("=")) {
    throw new Error("Workflow inputs must use key=value.");
  }

  const [key, ...rest] = rawPair.split("=");
  inputs[key] = coerceInputValue(rest.join("="));
}

function coerceInputValue(raw: string): string | number | boolean | null {
  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  if (raw === "null") {
    return null;
  }

  const numeric = Number(raw);
  return raw.trim() !== "" && Number.isFinite(numeric) ? numeric : raw;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
