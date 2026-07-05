import type { GenerateTextParams } from "./vibe";

const AGENT_WORKFLOW_NODE_PROPERTIES = {
  id: { type: "string" },
  type: { type: "string", enum: ["rh-text", "rh-image", "rh-video"] },
  subType: {
    type: "string",
    enum: [
      "text-text",
      "image-text",
      "video-text",
      "text-image",
      "image-image",
      "text-video",
      "image-video",
      "multimodal-video",
      "video-edit",
      "video-hd",
      "start-end-video",
      "video-video",
    ],
  },
  from: { type: "string", enum: ["agent"] },
  agentNodeType: {
    type: "string",
    enum: [
      "character",
      "non_human_character",
      "prop",
      "shot",
      "first_frame",
      "scene",
      "copywriting",
      "logo",
      "cover",
      "illustration",
      "background",
      "reference",
      "style_ref",
      "output",
      "prompt_bridge",
      "storyboard",
      "video_clip",
      "enhancer",
      "campaign_shot",
      "interior_render",
      "floor_plan",
      "material_board",
      "detail_shot",
      "body_part",
      "transform_state",
    ],
  },
  title: { type: "string" },
  content: { type: "string" },
  aspectRatio: { type: ["string", "null"], enum: ["auto", "1:1", "16:9", "9:16", "4:3", "3:4", null] },
  duration: { type: ["string", "null"] },
  sourceNodeId: { type: ["string", "null"] },
  editAction: {
    type: ["string", "null"],
    enum: ["redraw", "erase", "enhance", "expand", "cutout", "lighting", "multiangle", null],
  },
} as const;

const AGENT_WORKFLOW_EDGE_PROPERTIES = {
  id: { type: "string" },
  source: { type: "string" },
  target: { type: "string" },
} as const;

export const AGENT_STEP_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "genlink_agent_workflow",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        workflow: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            autoRun: { type: "boolean" },
            nodes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: AGENT_WORKFLOW_NODE_PROPERTIES,
                required: Object.keys(AGENT_WORKFLOW_NODE_PROPERTIES),
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: AGENT_WORKFLOW_EDGE_PROPERTIES,
                required: Object.keys(AGENT_WORKFLOW_EDGE_PROPERTIES),
              },
            },
          },
          required: ["name", "autoRun", "nodes", "edges"],
        },
      },
      required: ["summary", "workflow"],
    },
  },
} as const satisfies NonNullable<GenerateTextParams["responseFormat"]>;

export const AGENT_RUNTIME_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "genlink_agent_runtime_step",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          type: "string",
          enum: ["read_rule_file", "workflow"],
        },
        reason: { type: ["string", "null"] },
        filePath: { type: ["string", "null"] },
        summary: { type: ["string", "null"] },
        workflow: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                autoRun: { type: "boolean" },
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: AGENT_WORKFLOW_NODE_PROPERTIES,
                    required: Object.keys(AGENT_WORKFLOW_NODE_PROPERTIES),
                  },
                },
                edges: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: AGENT_WORKFLOW_EDGE_PROPERTIES,
                    required: Object.keys(AGENT_WORKFLOW_EDGE_PROPERTIES),
                  },
                },
              },
              required: ["name", "autoRun", "nodes", "edges"],
            },
            { type: "null" },
          ],
        },
      },
      required: ["type", "reason", "filePath", "summary", "workflow"],
    },
  },
} as const satisfies NonNullable<GenerateTextParams["responseFormat"]>;
