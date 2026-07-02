type AgentDecisionState = {
  type: string;
  status?: string;
};

export function hasBlockingAgentDecision(messages: AgentDecisionState[]): boolean {
  return messages.some((message) => (
    (message.type === "attachment_selection" && message.status === "waiting") ||
    (message.type === "execution_plan" && message.status === "waiting_confirmation") ||
    (
      message.type === "planf_ecom_plan" &&
      (
        message.status === "waiting_confirmation" ||
        message.status === "adjusting"
      )
    ) ||
    (
      message.type === "ecom_planner_prompt_markdown" &&
      message.status === "waiting_confirmation"
    )
  ));
}
