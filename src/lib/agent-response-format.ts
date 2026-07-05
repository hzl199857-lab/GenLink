import type { GenerateTextParams } from "./vibe";

const AGENT_TOOL_NAMES = [
  "read_canvas_summary",
  "create_text_node",
  "create_uploaded_image_node",
  "create_image_generation_node",
  "connect_nodes",
  "set_image_generation_options",
  "run_image_generation",
] as const;

export const AGENT_STEP_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "genlink_agent_step",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          type: "string",
          enum: ["tool_call", "final"],
        },
        thinking: {
          type: ["string", "null"],
        },
        tool: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                name: {
                  type: "string",
                  enum: AGENT_TOOL_NAMES,
                },
                input: {
                  type: "object",
                  additionalProperties: true,
                },
              },
              required: ["name", "input"],
            },
            {
              type: "null",
            },
          ],
        },
        message: {
          type: ["string", "null"],
        },
      },
      required: ["type", "thinking", "tool", "message"],
    },
  },
} as const satisfies NonNullable<GenerateTextParams["responseFormat"]>;
