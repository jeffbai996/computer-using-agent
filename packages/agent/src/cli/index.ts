import { AgentService } from "../agent-service.js";
import { FakeBrowserExecutor } from "../adapters/fake-browser-executor.js";
import { FakeModelClient } from "../adapters/fake-model-client.js";
import { OpenAIComputerUseClient } from "../adapters/openai-computer-use-client.js";
import { PlaywrightBrowserExecutor } from "../adapters/playwright-browser-executor.js";
import { createApp } from "../server/app.js";
import { SqliteSessionStore } from "../session-store.js";

const command = process.argv[2] ?? "help";
const args = process.argv.slice(3);

async function main(): Promise<void> {
  if (command === "serve") {
    const agent = makeAgent({ real: args.includes("--real") });
    const app = createApp(agent);
    const port = Number(process.env.CUA_PORT ?? 4317);

    app.listen(port, "127.0.0.1", () => {
      console.log(`computer-using-agent API listening on http://127.0.0.1:${port}`);
    });
    return;
  }

  const agent = makeAgent({ real: args.includes("--real") });

  if (command === "start") {
    const task = args.filter((arg) => arg !== "--real").join(" ").trim();

    if (!task) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- start \"task\" [--real]");
    }

    console.log(JSON.stringify(await agent.startTask(task), null, 2));
    return;
  }

  if (command === "list") {
    console.log(JSON.stringify(await agent.listSessions(), null, 2));
    return;
  }

  if (command === "approve") {
    const sessionId = args[0];

    if (!sessionId) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- approve <sessionId>");
    }

    console.log(JSON.stringify(await agent.approve(sessionId), null, 2));
    return;
  }

  if (command === "reject") {
    const sessionId = args[0];
    const reason = args.slice(1).join(" ");

    if (!sessionId) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- reject <sessionId> [reason]");
    }

    console.log(JSON.stringify(await agent.reject(sessionId, reason), null, 2));
    return;
  }

  if (command === "export") {
    const sessionId = args[0];

    if (!sessionId) {
      throw new Error("Usage: npm run cli --workspace @cua/agent -- export <sessionId>");
    }

    console.log(await agent.exportSession(sessionId));
    return;
  }

  console.log(`Usage:
  npm run cli --workspace @cua/agent -- serve [--real]
  npm run cli --workspace @cua/agent -- start "task" [--real]
  npm run cli --workspace @cua/agent -- list
  npm run cli --workspace @cua/agent -- approve <sessionId> [--real]
  npm run cli --workspace @cua/agent -- reject <sessionId> [reason]
  npm run cli --workspace @cua/agent -- export <sessionId>`);
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
