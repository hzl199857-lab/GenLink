import type { AgentPanelMessage, AgentTaskAttachment } from "@/types/agent";

const AGENT_HISTORY_STORAGE_KEY = "genlink.canvasAgentThreads.v1";
const AGENT_DRAFT_STORAGE_KEY = "genlink.canvasAgentDrafts.v1";
const MAX_PROJECT_THREADS = 20;
const MIN_PROJECT_THREADS_ON_QUOTA = 3;

export type AgentThreadRecord = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  messages: AgentPanelMessage[];
  createdAt: string;
  updatedAt: string;
};

type AgentThreadStorage = {
  version: 1;
  threads: AgentThreadRecord[];
};

type AgentDraftStorage = {
  version: 1;
  drafts: Record<string, string>;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStorage(): AgentThreadStorage {
  if (!canUseStorage()) {
    return { version: 1, threads: [] };
  }

  const raw = window.localStorage.getItem(AGENT_HISTORY_STORAGE_KEY);

  if (!raw) {
    return { version: 1, threads: [] };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AgentThreadStorage>;

    if (!Array.isArray(parsed.threads)) {
      return { version: 1, threads: [] };
    }

    return {
      version: 1,
      threads: parsed.threads.filter((thread): thread is AgentThreadRecord => (
        Boolean(thread) &&
        typeof thread.id === "string" &&
        typeof thread.projectId === "string" &&
        typeof thread.title === "string" &&
        Array.isArray(thread.messages)
      )),
    };
  } catch {
    return { version: 1, threads: [] };
  }
}

function writeStorage(storage: AgentThreadStorage): boolean {
  if (!canUseStorage()) {
    return true;
  }

  try {
    window.localStorage.setItem(AGENT_HISTORY_STORAGE_KEY, JSON.stringify(storage));
    return true;
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
    ) {
      return false;
    }

    throw error;
  }
}

function readDraftStorage(): AgentDraftStorage {
  if (!canUseStorage()) {
    return { version: 1, drafts: {} };
  }

  const raw = window.localStorage.getItem(AGENT_DRAFT_STORAGE_KEY);

  if (!raw) {
    return { version: 1, drafts: {} };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AgentDraftStorage>;

    if (!parsed.drafts || typeof parsed.drafts !== "object") {
      return { version: 1, drafts: {} };
    }

    return {
      version: 1,
      drafts: Object.fromEntries(
        Object.entries(parsed.drafts).filter((entry): entry is [string, string] => (
          typeof entry[0] === "string" && typeof entry[1] === "string"
        )),
      ),
    };
  } catch {
    return { version: 1, drafts: {} };
  }
}

function writeDraftStorage(storage: AgentDraftStorage): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(AGENT_DRAFT_STORAGE_KEY, JSON.stringify(storage));
}

function createThreadTitle(messages: AgentPanelMessage[]): string {
  const firstUserMessage = messages.find((message) => (
    message.role === "user" &&
    message.type === "text" &&
    message.content.trim()
  ));

  if (!firstUserMessage || firstUserMessage.type !== "text") {
    return "未命名 Agent 会话";
  }

  const title = firstUserMessage.content.replace(/\s+/g, " ").trim();

  return title.length > 32 ? `${title.slice(0, 32)}...` : title;
}

function compactAttachment(attachment: AgentTaskAttachment): AgentTaskAttachment {
  return {
    ...attachment,
    imageUrl: "",
    hostedImageUrl: "",
    originalImageUrl: "",
    previewUrl: "",
    thumbnailUrl: "",
    semanticImageUrl: "",
  };
}

function compactMessages(messages: AgentPanelMessage[]): AgentPanelMessage[] {
  return messages.map((message) => {
    if (message.type === "text" && message.role === "user" && message.attachments?.length) {
      return {
        ...message,
        attachments: message.attachments.map(compactAttachment),
      };
    }

    if (message.type === "attachment_selection") {
      return {
        ...message,
        status: message.status === "waiting" ? "cancelled" : message.status,
        attachments: message.attachments.map(compactAttachment),
      };
    }

    if (message.type === "execution_plan") {
      return {
        ...message,
        status:
          message.status === "waiting_confirmation" ||
          message.status === "waiting_generation_confirmation"
            ? "cancelled"
            : message.status,
        attachments: message.attachments.map(compactAttachment),
      };
    }

    if (message.type === "planf_ecom_session") {
      return {
        ...message,
        attachments: message.attachments.map(compactAttachment),
      };
    }

    if (message.type === "planf_ecom_plan") {
      return {
        ...message,
        session: {
          ...message.session,
        },
        attachments: message.attachments.map(compactAttachment),
      };
    }

    return message;
  });
}

export function restoreAgentThreadMessages(messages: AgentPanelMessage[]): AgentPanelMessage[] {
  return compactMessages(messages);
}

function getProjectId(projectId: string | undefined, projectName: string): string {
  return projectId?.trim() || `local:${projectName.trim() || "Untitled"}`;
}

export function listAgentThreads(projectId: string | undefined, projectName: string): AgentThreadRecord[] {
  const resolvedProjectId = getProjectId(projectId, projectName);

  return readStorage()
    .threads
    .filter((thread) => thread.projectId === resolvedProjectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deleteAgentThread(threadId: string): void {
  const storage = readStorage();

  writeStorage({
    version: 1,
    threads: storage.threads.filter((thread) => thread.id !== threadId),
  });
}

export function loadAgentDraft(projectId: string | undefined, projectName: string): string {
  const resolvedProjectId = getProjectId(projectId, projectName);

  return readDraftStorage().drafts[resolvedProjectId] ?? "";
}

export function saveAgentDraft(projectId: string | undefined, projectName: string, draft: string): void {
  const storage = readDraftStorage();
  const resolvedProjectId = getProjectId(projectId, projectName);
  const nextDrafts = { ...storage.drafts };

  if (draft.trim()) {
    nextDrafts[resolvedProjectId] = draft;
  } else {
    delete nextDrafts[resolvedProjectId];
  }

  writeDraftStorage({ version: 1, drafts: nextDrafts });
}

export function saveAgentThread(params: {
  threadId?: string;
  projectId?: string;
  projectName: string;
  messages: AgentPanelMessage[];
}): AgentThreadRecord {
  const storage = readStorage();
  const now = new Date().toISOString();
  const resolvedProjectId = getProjectId(params.projectId, params.projectName);
  const existing = params.threadId
    ? storage.threads.find((thread) => thread.id === params.threadId)
    : undefined;
  const thread: AgentThreadRecord = {
    id: existing?.id ?? `agent-thread-${crypto.randomUUID()}`,
    projectId: resolvedProjectId,
    projectName: params.projectName,
    title: createThreadTitle(params.messages),
    messages: compactMessages(params.messages),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const nextThreads = [
    thread,
    ...storage.threads.filter((candidate) => candidate.id !== thread.id),
  ];
  const projectThreads = nextThreads.filter((candidate) => candidate.projectId === resolvedProjectId);
  const keptProjectThreadIds = new Set(projectThreads.slice(0, MAX_PROJECT_THREADS).map((candidate) => candidate.id));
  const prunedThreads = nextThreads.filter((candidate) => (
    candidate.projectId !== resolvedProjectId || keptProjectThreadIds.has(candidate.id)
  ));

  let projectThreadLimit = MAX_PROJECT_THREADS;
  let nextPrunedThreads = prunedThreads;

  while (!writeStorage({ version: 1, threads: nextPrunedThreads }) && projectThreadLimit > MIN_PROJECT_THREADS_ON_QUOTA) {
    projectThreadLimit = Math.max(MIN_PROJECT_THREADS_ON_QUOTA, Math.floor(projectThreadLimit / 2));

    const nextKeptProjectThreadIds = new Set(
      projectThreads.slice(0, projectThreadLimit).map((candidate) => candidate.id),
    );

    nextPrunedThreads = nextThreads.filter((candidate) => (
      candidate.projectId !== resolvedProjectId || nextKeptProjectThreadIds.has(candidate.id)
    ));
  }

  return thread;
}
