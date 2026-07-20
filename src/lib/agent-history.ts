import type { AgentPanelMessage, AgentTaskAttachment } from "@/types/agent";
import { migrateLegacyStorageValue, userStorageKey } from "@/lib/browser-user-storage";

const AGENT_HISTORY_STORAGE_KEY = "genlink.canvasAgentThreads.v1";
const AGENT_DRAFT_STORAGE_KEY = "genlink.canvasAgentDrafts.v1";
const MAX_PROJECT_THREADS = 20;
const MIN_PROJECT_THREADS_ON_QUOTA = 3;

export type AgentThreadRecord = {
  id: string;
  projectId: string;
  projectName: string;
  canvasId: string;
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

function isStorageQuotaError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "name" in error &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED"),
  );
}

function readAgentStorageValue(userId: string, storageKey: string): string | null {
  const storage = window.localStorage;

  try {
    migrateLegacyStorageValue(userId, storageKey, storage);
    return storage.getItem(userStorageKey(userId, storageKey));
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      return null;
    }

    return storage.getItem(userStorageKey(userId, storageKey))
      ?? storage.getItem(storageKey);
  }
}

function readStorage(userId: string): AgentThreadStorage {
  if (!canUseStorage()) {
    return { version: 1, threads: [] };
  }

  const raw = readAgentStorageValue(userId, AGENT_HISTORY_STORAGE_KEY);

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
      )).map((thread) => ({
        ...thread,
        canvasId: typeof thread.canvasId === "string" && thread.canvasId.trim()
          ? thread.canvasId
          : "default",
      })),
    };
  } catch {
    return { version: 1, threads: [] };
  }
}

function writeStorage(userId: string, storage: AgentThreadStorage): boolean {
  if (!canUseStorage()) {
    return true;
  }

  try {
    migrateLegacyStorageValue(userId, AGENT_HISTORY_STORAGE_KEY, window.localStorage);
    window.localStorage.setItem(
      userStorageKey(userId, AGENT_HISTORY_STORAGE_KEY),
      JSON.stringify(storage),
    );
    return true;
  } catch (error) {
    if (isStorageQuotaError(error)) {
      return false;
    }

    throw error;
  }
}

function readDraftStorage(userId: string): AgentDraftStorage {
  if (!canUseStorage()) {
    return { version: 1, drafts: {} };
  }

  const raw = readAgentStorageValue(userId, AGENT_DRAFT_STORAGE_KEY);

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

function writeDraftStorage(userId: string, storage: AgentDraftStorage): void {
  if (!canUseStorage()) {
    return;
  }

  try {
    migrateLegacyStorageValue(userId, AGENT_DRAFT_STORAGE_KEY, window.localStorage);
    window.localStorage.setItem(
      userStorageKey(userId, AGENT_DRAFT_STORAGE_KEY),
      JSON.stringify(storage),
    );
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      throw error;
    }
  }
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
  if (attachment.kind === "video") {
    return {
      ...attachment,
      mediaUrl: "",
      videoUrl: "",
      previewUrl: "",
      thumbnailUrl: "",
    };
  }

  return {
    ...attachment,
    mediaUrl: "",
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

function getCanvasId(canvasId?: string): string {
  return canvasId?.trim() || "default";
}

function getDraftId(projectId: string, canvasId?: string): string {
  return JSON.stringify([projectId, getCanvasId(canvasId)]);
}

export function createAgentDraftScopeKey(
  userId: string,
  projectId: string | undefined,
  projectName: string,
  canvasId?: string,
): string {
  return JSON.stringify([
    userId.trim(),
    getProjectId(projectId, projectName),
    getCanvasId(canvasId),
  ]);
}

export function canSaveAgentDraftForScope(
  hydratedScopeKey: string | null,
  currentScopeKey: string,
): boolean {
  return hydratedScopeKey === currentScopeKey;
}

export function listAgentThreads(
  userId: string,
  projectId: string | undefined,
  projectName: string,
  canvasId?: string,
): AgentThreadRecord[] {
  const resolvedProjectId = getProjectId(projectId, projectName);
  const resolvedCanvasId = getCanvasId(canvasId);

  return readStorage(userId)
    .threads
    .filter((thread) => (
      thread.projectId === resolvedProjectId && thread.canvasId === resolvedCanvasId
    ))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deleteAgentThread(userId: string, threadId: string): void {
  const storage = readStorage(userId);

  writeStorage(userId, {
    version: 1,
    threads: storage.threads.filter((thread) => thread.id !== threadId),
  });
}

export function loadAgentDraft(
  userId: string,
  projectId: string | undefined,
  projectName: string,
  canvasId?: string,
): string {
  const resolvedProjectId = getProjectId(projectId, projectName);
  const storage = readDraftStorage(userId);
  const draftId = getDraftId(resolvedProjectId, canvasId);

  return storage.drafts[draftId]
    ?? (getCanvasId(canvasId) === "default" ? storage.drafts[resolvedProjectId] : undefined)
    ?? "";
}

export function saveAgentDraft(
  userId: string,
  projectId: string | undefined,
  projectName: string,
  draft: string,
  canvasId?: string,
): void {
  const storage = readDraftStorage(userId);
  const resolvedProjectId = getProjectId(projectId, projectName);
  const draftId = getDraftId(resolvedProjectId, canvasId);
  const nextDrafts = { ...storage.drafts };

  if (draft.trim()) {
    nextDrafts[draftId] = draft;
  } else {
    delete nextDrafts[draftId];
  }

  writeDraftStorage(userId, { version: 1, drafts: nextDrafts });
}

export function saveAgentThread(params: {
  userId: string;
  threadId?: string;
  projectId?: string;
  projectName: string;
  canvasId?: string;
  messages: AgentPanelMessage[];
}): AgentThreadRecord {
  const storage = readStorage(params.userId);
  const now = new Date().toISOString();
  const resolvedProjectId = getProjectId(params.projectId, params.projectName);
  const resolvedCanvasId = getCanvasId(params.canvasId);
  const existing = params.threadId
    ? storage.threads.find((thread) => thread.id === params.threadId)
    : undefined;
  const thread: AgentThreadRecord = {
    id: existing?.id ?? `agent-thread-${crypto.randomUUID()}`,
    projectId: resolvedProjectId,
    projectName: params.projectName,
    canvasId: resolvedCanvasId,
    title: createThreadTitle(params.messages),
    messages: compactMessages(params.messages),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const nextThreads = [
    thread,
    ...storage.threads.filter((candidate) => candidate.id !== thread.id),
  ];
  const projectThreads = nextThreads.filter((candidate) => (
    candidate.projectId === resolvedProjectId && candidate.canvasId === resolvedCanvasId
  ));
  const keptProjectThreadIds = new Set(projectThreads.slice(0, MAX_PROJECT_THREADS).map((candidate) => candidate.id));
  const prunedThreads = nextThreads.filter((candidate) => (
    candidate.projectId !== resolvedProjectId ||
    candidate.canvasId !== resolvedCanvasId ||
    keptProjectThreadIds.has(candidate.id)
  ));

  let projectThreadLimit = MAX_PROJECT_THREADS;
  let nextPrunedThreads = prunedThreads;

  while (!writeStorage(params.userId, { version: 1, threads: nextPrunedThreads }) && projectThreadLimit > MIN_PROJECT_THREADS_ON_QUOTA) {
    projectThreadLimit = Math.max(MIN_PROJECT_THREADS_ON_QUOTA, Math.floor(projectThreadLimit / 2));

    const nextKeptProjectThreadIds = new Set(
      projectThreads.slice(0, projectThreadLimit).map((candidate) => candidate.id),
    );

    nextPrunedThreads = nextThreads.filter((candidate) => (
      candidate.projectId !== resolvedProjectId ||
      candidate.canvasId !== resolvedCanvasId ||
      nextKeptProjectThreadIds.has(candidate.id)
    ));
  }

  return thread;
}

export function deleteAgentThreadsForCanvas(
  userId: string,
  projectId: string | undefined,
  projectName: string,
  canvasId: string,
): void {
  const resolvedProjectId = getProjectId(projectId, projectName);
  const resolvedCanvasId = getCanvasId(canvasId);
  const storage = readStorage(userId);
  const draftStorage = readDraftStorage(userId);
  const draftId = getDraftId(resolvedProjectId, resolvedCanvasId);
  const nextDrafts = { ...draftStorage.drafts };

  delete nextDrafts[draftId];
  writeStorage(userId, {
    version: 1,
    threads: storage.threads.filter((thread) => (
      thread.projectId !== resolvedProjectId || thread.canvasId !== resolvedCanvasId
    )),
  });
  writeDraftStorage(userId, { version: 1, drafts: nextDrafts });
}
