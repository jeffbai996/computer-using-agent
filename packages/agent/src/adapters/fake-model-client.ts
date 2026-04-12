import { randomId } from "@cua/core";
import type { ModelClient, ModelInput, ModelStep } from "../ports.js";

export class FakeModelClient implements ModelClient {
  async nextStep(input: ModelInput): Promise<ModelStep> {
    const requestedActions = input.session.events.filter(
      (event) => event.type === "action.requested",
    );

    if (requestedActions.length > 0) {
      return {
        type: "complete",
        message: "Mock task completed after one approved action.",
      };
    }

    return {
      type: "action",
      action: {
        id: randomId("action"),
        kind: "click",
        description: "Mock click on the browser viewport",
        payload: { x: 320, y: 240 },
        sensitive: true,
      },
    };
  }
}
