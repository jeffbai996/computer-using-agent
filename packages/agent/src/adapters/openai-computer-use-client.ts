import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import {
  randomId,
  type ComputerAction,
  type ComputerActionKind,
  type SafetyCheck,
  type TurnOutcome,
} from "@cua/core";
import type { ModelClient, ModelTurnInput } from "../ports.js";

type OpenAIComputerUseOptions = {
  apiKey?: string;
  model?: string;
  reasoningEffort?: string;
  mode?: "ga" | "preview";
};

type OpenAIOutputItem = {
  type?: string;
  call_id?: string;
  action?: Record<string, unknown>;
  actions?: Record<string, unknown>[];
  pending_safety_checks?: unknown[];
  content?: unknown[];
  text?: string;
};

export class OpenAIComputerUseClient implements ModelClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly reasoningEffort: string;
  private readonly mode: "ga" | "preview";

  constructor(options: OpenAIComputerUseOptions = {}) {
    this.client = new OpenAI({ apiKey: options.apiKey ?? process.env.OPENAI_API_KEY });
    this.mode =
      options.mode ??
      (process.env.CUA_COMPUTER_USE_MODE === "preview" ? "preview" : "ga");
    this.model =
      options.model ??
      process.env.CUA_MODEL ??
      (this.mode === "preview" ? "computer-use-preview" : "gpt-5.4");
    this.reasoningEffort =
      options.reasoningEffort ?? process.env.CUA_REASONING_EFFORT ?? "xhigh";
  }

  async createTurn(input: ModelTurnInput): Promise<TurnOutcome> {
    if (this.mode === "preview") {
      return this.createPreviewTurn(input);
    }

    const response = await this.client.responses.create({
      model: this.model,
      tools: [{ type: "computer" }],
      reasoning: { effort: this.reasoningEffort },
      previous_response_id: input.session.previousResponseId,
      input: await this.inputForTurn(input),
    } as never);

    return normalizeOpenAITurn(response);
  }

  private async createPreviewTurn(input: ModelTurnInput): Promise<TurnOutcome> {
    const response = await this.client.responses.create({
      model: this.model,
      tools: [
        {
          type: "computer_use_preview",
          display_width: input.snapshot?.viewport.width ?? 1024,
          display_height: input.snapshot?.viewport.height ?? 768,
          environment: "browser",
        },
      ],
      input: input.task,
      truncation: "auto",
    } as never);

    return normalizeOpenAITurn(response);
  }

  private async inputForTurn(input: ModelTurnInput): Promise<unknown> {
    const callId = input.session.previousComputerCallId;

    if (!input.session.previousResponseId || !callId) {
      return `${input.task}\n\nUse the computer tool for UI interaction. Stop before actions that require approval.`;
    }

    if (!input.snapshot?.localPath) {
      return "The harness needs a fresh screenshot before continuing.";
    }

    const image = await readFile(input.snapshot.localPath, "base64");

    return [
      {
        type: "computer_call_output",
        call_id: callId,
        output: {
          type: "input_image",
          image_url: `data:image/png;base64,${image}`,
          detail: "original",
        },
      },
    ];
  }
}

export function normalizeOpenAITurn(response: unknown): TurnOutcome {
  const responseId = (response as { id?: string }).id;
  const output = ((response as { output?: unknown[] }).output ?? []) as OpenAIOutputItem[];
  const computerCall = output.find((item) => item.type === "computer_call")
    ?? output.find((item) => item.type?.includes("computer") && item.type.includes("call"));

  if (computerCall) {
    const rawActions = Array.isArray(computerCall.actions)
      ? computerCall.actions
      : computerCall.action
        ? [computerCall.action]
        : [];

    if (rawActions.length === 0) {
      return {
        type: "blocked",
        reason: "Computer call did not include any actions.",
        responseId,
        rawResponse: response,
      };
    }

    if (rawActions.every((action) => normalizeActionKind(action) === "screenshot")) {
      return {
        type: "needs_screenshot",
        responseId,
        callId: computerCall.call_id,
        rawResponse: response,
      };
    }

    const actions = rawActions.map((action) => normalizeAction(action));

    return {
      type: "action_batch",
      responseId,
      safetyChecks: normalizeSafetyChecks(computerCall.pending_safety_checks),
      rawResponse: response,
      batch: {
        id: randomId("batch"),
        callId: computerCall.call_id,
        responseId,
        description: actions.map((action) => action.description).join(", "),
        actions,
      },
    };
  }

  const message = extractText(output);

  if (message) {
    return {
      type: "completed",
      message,
      responseId,
      rawResponse: response,
    };
  }

  return {
    type: "blocked",
    reason: "Model response did not contain text or a computer call.",
    responseId,
    rawResponse: response,
  };
}

function normalizeAction(rawAction: Record<string, unknown>): ComputerAction {
  const kind = normalizeActionKind(rawAction);

  return {
    id: randomId("action"),
    kind,
    description: `Model requested ${kind}`,
    payload: rawAction,
    raw: rawAction,
    sensitive: actionLooksSensitive(kind, rawAction),
  };
}

function normalizeActionKind(rawAction: Record<string, unknown>): ComputerActionKind {
  const rawKind = String(rawAction.type ?? rawAction.action ?? "unknown");
  const aliases: Record<string, ComputerActionKind> = {
    doubleClick: "double_click",
    double_click: "double_click",
    mouse_move: "move",
    keypress: "keypress",
  };
  const normalized = aliases[rawKind] ?? rawKind;
  const allowed: ComputerActionKind[] = [
    "click",
    "double_click",
    "scroll",
    "type",
    "wait",
    "keypress",
    "drag",
    "move",
    "screenshot",
    "unknown",
  ];

  return allowed.includes(normalized as ComputerActionKind)
    ? (normalized as ComputerActionKind)
    : "unknown";
}

function normalizeSafetyChecks(rawChecks: unknown): SafetyCheck[] {
  if (!Array.isArray(rawChecks)) {
    return [];
  }

  return rawChecks.map((check, index) => {
    const item = check as { id?: string; code?: string; message?: string };

    return {
      id: item.id ?? randomId("safety"),
      code: item.code ?? `safety_check_${index + 1}`,
      message: item.message ?? "OpenAI safety check requires acknowledgement.",
    };
  });
}

function actionLooksSensitive(
  kind: ComputerActionKind,
  rawAction: Record<string, unknown>,
): boolean {
  if (kind === "unknown") {
    return true;
  }

  if (["wait", "screenshot", "move", "scroll"].includes(kind)) {
    return false;
  }

  const raw = JSON.stringify(rawAction).toLowerCase();
  return /submit|delete|remove|purchase|pay|login|sign in|upload|download|install|confirm/.test(
    raw,
  );
}

function extractText(output: OpenAIOutputItem[]): string | undefined {
  const chunks: string[] = [];

  for (const item of output) {
    if (typeof item.text === "string") {
      chunks.push(item.text);
    }

    if (Array.isArray(item.content)) {
      for (const content of item.content) {
        const text = (content as { text?: string }).text;

        if (text) {
          chunks.push(text);
        }
      }
    }
  }

  return chunks.join("\n").trim() || undefined;
}
