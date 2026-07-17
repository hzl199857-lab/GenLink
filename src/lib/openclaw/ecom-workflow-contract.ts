import type { GLWorkflow } from "@/lib/planf-ecom";

type EcomWorkflowPlanContract = {
  meta: {
    anchorMode: string;
    mainRatio?: string;
  };
  imageSlots: Array<{
    slot: string;
    round: number;
    ratio: string;
  }>;
};

type ExpectedWorkflowSlot = {
  slot: string;
  ratio: string;
};

export type EcomWorkflowContractValidation =
  | { ok: true }
  | { ok: false; error: string };

export function getExpectedEcomWorkflowSlots(
  plan: EcomWorkflowPlanContract,
  hasConfirmedAnchor: boolean,
): ExpectedWorkflowSlot[] {
  if (plan.meta.anchorMode !== "white-bg-first") {
    return plan.imageSlots.map(({ slot, ratio }) => ({ slot, ratio }));
  }

  const expectedRound = hasConfirmedAnchor ? 2 : 1;
  const roundSlots = plan.imageSlots
    .filter((slot) => slot.round === expectedRound)
    .map(({ slot, ratio }) => ({ slot, ratio }));

  if (roundSlots.length > 0 || hasConfirmedAnchor) {
    return roundSlots;
  }

  return [{
    slot: "白底图（主锚）",
    ratio: plan.meta.mainRatio || "1:1",
  }];
}

export function validateEcomWorkflowMatchesPlan(input: {
  workflow: GLWorkflow;
  plan: EcomWorkflowPlanContract;
  hasConfirmedAnchor: boolean;
}): EcomWorkflowContractValidation {
  const expectedSlots = getExpectedEcomWorkflowSlots(input.plan, input.hasConfirmedAnchor);
  const imageNodes = input.workflow.nodes.filter((node) => node.type === "image_generation");

  if (imageNodes.length !== expectedSlots.length) {
    return {
      ok: false,
      error: `workflow image node count ${imageNodes.length} does not match confirmed plan count ${expectedSlots.length}`,
    };
  }

  const errors: string[] = [];

  for (const [index, node] of imageNodes.entries()) {
    const expected = expectedSlots[index];
    const ratio = typeof node.data.aspectRatio === "string" ? node.data.aspectRatio.trim() : "";

    if (ratio !== expected.ratio) {
      errors.push(
        `workflow image node ${node.id} aspectRatio ${ratio || "missing"} does not match confirmed slot ${index + 1} (${expected.slot}) ratio ${expected.ratio}`,
      );
    }
  }

  return errors.length > 0
    ? { ok: false, error: errors.join("; ") }
    : { ok: true };
}
