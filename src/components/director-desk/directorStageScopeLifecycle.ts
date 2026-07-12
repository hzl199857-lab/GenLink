import {
  useDirectorStore,
  type DirectorStore,
} from "./editor/store/directorStore";

type DirectorStageScopeStore = Pick<
  DirectorStore,
  "openScopedScene" | "saveLatestSnapshot"
>;

type ScheduleMicrotask = (callback: () => void) => void;

export function createDirectorStageScopeLifecycle(
  getStore: () => DirectorStageScopeStore = () => useDirectorStore.getState(),
  scheduleMicrotask: ScheduleMicrotask = queueMicrotask,
) {
  let pendingCleanup: { userId: string } | null = null;

  return {
    activate(nodeId: string, userId: string) {
      const previousCleanup = pendingCleanup;
      if (previousCleanup) {
        pendingCleanup = null;
        if (previousCleanup.userId !== userId) {
          getStore().openScopedScene(null, null);
        }
      }

      getStore().openScopedScene(nodeId, userId);
      let active = true;

      return () => {
        if (!active) {
          return;
        }
        active = false;

        getStore().saveLatestSnapshot();
        const cleanup = { userId };
        pendingCleanup = cleanup;
        scheduleMicrotask(() => {
          if (pendingCleanup !== cleanup) {
            return;
          }

          pendingCleanup = null;
          getStore().openScopedScene(null, null);
        });
      };
    },
  };
}

export const directorStageScopeLifecycle = createDirectorStageScopeLifecycle();
