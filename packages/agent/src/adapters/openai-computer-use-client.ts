import OpenAI from "openai";
import { randomId, type AgentAction, type AgentActionKind } from "@cua/core";
import type { ModelClient, ModelInput, ModelStep } from "../ports.js";

type OpenAIComputerUseOptions = {
  apiKey?: string;
  model?: string;
};

export class OpenAIComputerUseClient implements ModelClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAIComputerUseOptions = {}) {
    this.client = new OpenAI({ apiKey: options.apiKey ?? process.env.OPENAI_API_KEY });
    this.model = options.model ?? "computer-use-preview";
  }

  async nextStep(input: ModelInput): Promise<ModelStep> {
    const response = await this.client.responses.create({
      model: this.model,
      tools: [
        {
          type: "computer_use_preview",
          display_width: 1024,
          display_height: 768,
          environment: "browser",
        },
      ],
      input: [
        {
          role: "user",
          content: input.task,
        },
      ],
      truncation: "auto",
    } as never);

    return normalizeOpenAIStep(response);
  }
}

export function normalizeOpenAIStep(response: unknown): ModelStep {
  const output = (response as { output?: unknown[] }).output ?? [];
  const computerCall = output.find((item) => {
    const type = (item as { type?: string }).type ?? "";
    return type.includes("computer") && type.includes("call");
  });

  if (!computerCall) {
    return {
      type: "complete",
      message: "Model did not request another computer action.",
    };
  }

  const rawAction = (computerCall as { action?: Record<string, unknown> }).action ?? {};
  const kind = normalizeActionKind(String(rawAction.type ?? rawAction.action ?? "unknown"));

  return {
    type: "action",
    action: {
      id: randomId("action"),
      kind,
      description: `Model requested ${kind}`,
      payload: rawAction,
      sensitive: kind !== "wait",
    },
  };
}

function normalizeActionKind(rawKind: string): AgentActionKind {
  const allowed: AgentActionKind[] = [
    "click",
    "type",
    "scroll",
    "navigate",
    "keypress",
    "wait",
    "unknown",
  ];

  return allowed.includes(rawKind as AgentActionKind)
    ? (rawKind as AgentActionKind)
    : "unknown";
}
