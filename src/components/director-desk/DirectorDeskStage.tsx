'use client';

import { useEffect } from 'react';
import { DirectorDeskShell } from './app/layout/DirectorDeskShell';
import { DirectorCanvas } from './editor/canvas/DirectorCanvas';
import { directorStageScopeLifecycle } from './directorStageScopeLifecycle';

export interface DirectorDeskStageProps {
  nodeId: string;
  userId: string;
}

export function DirectorDeskStage({ nodeId, userId }: DirectorDeskStageProps) {
  useEffect(() => {
    return directorStageScopeLifecycle.activate(nodeId, userId);
  }, [nodeId, userId]);

  return (
    <DirectorDeskShell>
      <DirectorCanvas />
    </DirectorDeskShell>
  );
}
