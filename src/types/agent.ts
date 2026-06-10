import type { CanvasEdge, CanvasNode } from "./canvas";

export type AgentProvider =
  | "vibe"
  | "fucheers"
  | "comfly"
  | "zhenzhen"
  | "runninghub"
  | "grsai";

export type AgentPanelState =
  | "closed"
  | "idle"
  | "composing"
  | "awaiting_attachment_selection"
  | "planning"
  | "awaiting_plan_confirmation"
  | "executing"
  | "completed"
  | "error";

export type AgentTaskAttachment = {
  id: string;
  kind: "image";
  name: string;
  mimeType: string;
  imageUrl: string;
  previewUrl: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  status: "attached" | "uploading" | "ready" | "error";
  sourceNodeId?: string;
};

export type AgentRunSummary = {
  id: string;
  userPrompt: string;
  createdNodeIds: string[];
  createdEdgeIds: string[];
  status: "draft" | "running" | "completed" | "error" | "cancelled";
  createdAt: string;
};

export type AgentMessageSummary = {
  id: string;
  role: "user" | "agent";
  content: string;
  createdAt: string;
};

export type AgentTaskContext = {
  project: {
    id?: string;
    name: string;
  };
  input: {
    message: string;
    attachments: AgentTaskAttachment[];
    referencedAttachmentIds: string[];
  };
  executionTarget: {
    createOnCanvas: true;
    placement: "viewport_center_right";
    confirmationMode: "workflow_auto_apply";
  };
  canvasSummary?: {
    nodeCount: number;
    edgeCount: number;
    groupCount: number;
  };
  recentRuns?: AgentRunSummary[];
  recentMessages?: AgentMessageSummary[];
};

export type AgentImageGenerationPreference = {
  mode: "auto" | "manual";
  provider?: AgentProvider;
  model?: string;
  runningHubChannel?: "official" | "low-cost";
  aspectRatio?: string;
  quality?: string;
};

export type AgentActionNodeRef =
  | { kind: "created"; clientActionId: string }
  | { kind: "existing"; nodeId: string };

export type CanvasAgentAction =
  | {
      type: "create_uploaded_image_node";
      clientActionId: string;
      attachmentId: string;
      title?: string;
      position?: { x: number; y: number };
    }
  | {
      type: "create_image_generation_node";
      clientActionId: string;
      prompt: string;
      position?: { x: number; y: number };
      options?: {
        aspectRatio?: string;
        quality?: string;
        model?: string;
        provider?: string;
        runningHubChannel?: "official" | "low-cost";
      };
    }
  | {
      type: "connect_nodes";
      sourceRef: AgentActionNodeRef;
      targetRef: AgentActionNodeRef;
      sourceHandle?: string;
      targetHandle?: string;
    }
  | {
      type: "run_image_generation";
      nodeRef: AgentActionNodeRef;
    }
  | {
      type: "create_text_node";
      clientActionId: string;
      text: string;
      title?: string;
      position?: { x: number; y: number };
    };

export type CanvasAgentToolRisk = "read" | "write" | "generate";

export type CanvasAgentToolName =
  | "read_canvas_summary"
  | "create_text_node"
  | "create_uploaded_image_node"
  | "create_image_generation_node"
  | "connect_nodes"
  | "set_image_generation_options"
  | "run_image_generation"
  | "genlink_canvas_get_snapshot"
  | "genlink_canvas_get_node"
  | "genlink_canvas_create_workflow"
  | "genlink_canvas_create_node"
  | "genlink_canvas_connect_nodes"
  | "genlink_canvas_update_node_params"
  | "genlink_canvas_run_node"
  | "genlink_canvas_get_job_status";

export type CanvasAgentToolCall = {
  id: string;
  name: CanvasAgentToolName;
  input: Record<string, unknown>;
  risk: CanvasAgentToolRisk;
  requiresConfirmation: boolean;
};

export type CanvasAgentToolResult = {
  id: string;
  toolCallId: string;
  toolName: CanvasAgentToolName;
  ok: boolean;
  message: string;
  createdNodeIds?: string[];
  createdEdgeIds?: string[];
  updatedNodeIds?: string[];
  data?: unknown;
  error?: string;
};

export type CanvasAgentTraceItem =
  | {
      id: string;
      type: "thinking";
      content: string;
    }
  | {
      id: string;
      type: "tool_call";
      call: CanvasAgentToolCall;
    }
  | {
      id: string;
      type: "tool_result";
      result: CanvasAgentToolResult;
    }
  | {
      id: string;
      type: "final";
      content: string;
    };

export type AgentRunMeta = {
  usedModel: boolean;
  usedFallback: boolean;
  fallbackReason?: string;
  model?: string;
  modelRawOutput?: string;
};

export type AgentExecutionPlan = {
  title: string;
  stageLabel?: string;
  brief: Array<{
    label: string;
    value: string;
  }>;
  steps: string[];
  promptPreview?: string;
  confirmationLabel?: string;
};

export type AgentPanelMessage =
  | {
      id: string;
      role: "user";
      type: "text";
      content: string;
      attachmentIds?: string[];
      attachments?: AgentTaskAttachment[];
      createdAt: string;
    }
  | {
      id: string;
      role: "agent";
      type: "planf_ecom_plan";
      summary: string;
      session: Extract<AgentPanelMessage, { type: "planf_ecom_session" }>["session"];
      values: Record<string, unknown>;
      plan: {
        type: "ecom-image-plan" | "ecom-detail-page-plan";
        title: string;
        checkpointPrompt: string;
        meta: {
          productName: string;
          category: string;
          platform: string;
          imageSet: string;
          anchorMode: string;
          totalImages: number;
          deliveryRounds: number;
          styleMode: string;
          extraConstraints?: string;
        };
        imageSlots: Array<{
          index: number;
          slot: string;
          round: number;
          subType: string;
          anchorSource: string;
          ratio: string;
          intent: string;
        }>;
        options: Array<{
          id: "A" | "B" | "C" | "D";
          label: string;
        }>;
      };
      attachments: AgentTaskAttachment[];
      status: "waiting_confirmation" | "adjusting" | "submitted" | "completed" | "error";
      adjustmentOption?: {
        id: "B" | "C" | "D";
        label: string;
      };
      adjustmentDraft?: string;
      errorMessage?: string;
      createdAt: string;
    }
  | {
      id: string;
      role: "agent";
      type: "text";
      content: string;
      createdAt: string;
    }
  | {
      id: string;
      role: "agent";
      type: "attachment_selection";
      title: string;
      attachmentIds: string[];
      attachments: AgentTaskAttachment[];
      prompt: string;
      provider?: AgentProvider;
      model?: string;
      reason?: string;
      status: "waiting" | "selected" | "cancelled";
      selectedAttachmentId?: string;
      createdAt: string;
    }
  | {
      id: string;
      role: "agent";
      type: "planf_ecom_session";
      session: {
        sessionId: string;
        route: "ecomImageTrack";
        phase: "collecting";
        preset: string;
        request: string;
        referenceImageCount: number;
        stateHeader: string;
        protocol: {
          name: "form-fields";
          trigger: string;
          responsePath: string;
        };
        agent: {
          title: string;
          subtitle: string;
        };
        message: string;
        thinkingSteps: Array<{
          label: string;
          detail: string;
        }>;
        fields: Array<
          | {
              id: string;
              label: string;
              type: "text";
              value: string;
              required: boolean;
              placeholder?: string;
            }
          | {
              id: string;
              label: string;
              type: "select";
              value: string;
              options: Array<{ label: string; value: string }>;
              required: boolean;
              hint?: string;
            }
          | {
              id: string;
              label: string;
              type: "multi-select";
              value: string[];
              options: Array<{ label: string; value: string }>;
              required: boolean;
              maxSelected: number;
              minSelected?: number;
            }
          | {
              id: string;
              label: string;
              type: "text";
              value: string;
              required: boolean;
              placeholder?: string;
            }
          | {
              id: string;
              label: string;
              type: "upload";
              value: string;
              accept: "image";
              required: boolean;
              hint: string;
            }
        >;
      };
      attachments: AgentTaskAttachment[];
      status: "collecting" | "submitted" | "error";
      errorMessage?: string;
      createdAt: string;
    }
  | {
      id: string;
      role: "agent";
      type: "execution_plan";
      summary?: string;
      plan: AgentExecutionPlan;
      actions: CanvasAgentAction[];
      attachments: AgentTaskAttachment[];
      trace?: CanvasAgentTraceItem[];
      meta?: AgentRunMeta;
      imageGenerationNodeId?: string;
      imageGenerationNodeIds?: string[];
      groupId?: string;
      groupName?: string;
      planfEcom?: {
        phase: "white-bg-anchor" | "fanout";
        session: Extract<AgentPanelMessage, { type: "planf_ecom_session" }>["session"];
        values: Record<string, unknown>;
        plan: Extract<AgentPanelMessage, { type: "planf_ecom_plan" }>["plan"];
        anchorNodeId?: string;
        anchorOutputUrl?: string;
      };
      status:
        | "waiting_confirmation"
        | "cancelled"
        | "waiting_generation_confirmation"
        | "generating"
        | "executed"
        | "generation_error"
        | "error";
      createdAt: string;
    };

export type AgentCanvasSnapshot = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  groupCount: number;
};
