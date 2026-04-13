import { randomId, type TurnOutcome } from "@cua/core";
import type { ModelClient, ModelTurnInput } from "../ports.js";

export class FakeModelClient implements ModelClient {
  async createTurn(input: ModelTurnInput): Promise<TurnOutcome> {
    const requestedBatches = input.session.events.filter(
      (event) => event.type === "action_batch.requested",
    );

    if (requestedBatches.length > 0) {
      return {
        type: "completed",
        message: "Mock task completed after one approved batch.",
        responseId: randomId("response"),
      };
    }

    return {
      type: "action_batch",
      responseId: randomId("response"),
      batch: {
        id: randomId("batch"),
        description: "Mock click on the browser viewport",
        actions: [
          {
            id: randomId("action"),
            kind: "click",
            description: "Click the mock button",
            payload: { x: 320, y: 240 },
            sensitive: true,
          },
        ],
      },
    };
  }
}
