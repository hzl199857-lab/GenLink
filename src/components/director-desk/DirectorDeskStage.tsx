'use client';

import { useEffect } from 'react';
import { DirectorDeskShell } from './app/layout/DirectorDeskShell';
import { DirectorCanvas } from './editor/canvas/DirectorCanvas';
import { useDirectorStore } from './editor/store/directorStore';

export interface DirectorDeskStageProps {
  nodeId: string;
}

export function DirectorDeskStage({ nodeId }: DirectorDeskStageProps) {
  useEffect(() => {
    const store = useDirectorStore.getState();
    store.openScopedScene(nodeId);

    return () => {
      useDirectorStore.getState().saveLatestSnapshot();
    };
  }, [nodeId]);

  return (
    <DirectorDeskShell>
      <DirectorCanvas />
    </DirectorDeskShell>
  );
}
