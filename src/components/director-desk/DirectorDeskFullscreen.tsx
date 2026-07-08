'use client';

import { Suspense, lazy, useEffect, type SyntheticEvent } from 'react';
import { X } from 'lucide-react';
import { useDirectorStore } from './editor/store/directorStore';
import {
  clearDirectorDeskCaptureHandler,
  setDirectorDeskCaptureHandler,
  type DirectorDeskCaptureToCanvas,
} from './editor/io/hostBridge';

const DirectorDeskStage = lazy(() =>
  import('./DirectorDeskStage').then((module) => ({
    default: module.DirectorDeskStage,
  })),
);

export interface DirectorDeskFullscreenProps {
  nodeId: string;
  onClose: () => void;
  onSendCapturesToCanvas?: (captures: DirectorDeskCaptureToCanvas[]) => void | Promise<void>;
}

function stopDirectorDeskEventPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

export function DirectorDeskFullscreen({
  nodeId,
  onClose,
  onSendCapturesToCanvas,
}: DirectorDeskFullscreenProps) {
  const viewMode = useDirectorStore((state) => state.viewMode);
  const setViewMode = useDirectorStore((state) => state.setViewMode);

  useEffect(() => {
    if (!onSendCapturesToCanvas) {
      return;
    }

    const handler = (captures: DirectorDeskCaptureToCanvas[]) => onSendCapturesToCanvas(captures);
    setDirectorDeskCaptureHandler(handler);

    return () => clearDirectorDeskCaptureHandler(handler);
  }, [onSendCapturesToCanvas]);

  return (
    <div
      className="director-desk-root dark fixed inset-0 z-[120] h-screen w-screen overflow-hidden bg-[#090909] text-white"
      data-director-node-id={nodeId}
      data-theme="dark"
      onClick={stopDirectorDeskEventPropagation}
      onContextMenu={stopDirectorDeskEventPropagation}
      onDoubleClick={stopDirectorDeskEventPropagation}
      onPointerDown={stopDirectorDeskEventPropagation}
      onPointerUp={stopDirectorDeskEventPropagation}
    >
      <div className="app-shell">
        <header className="top-bar">
          <div className="top-bar-left">
            <h1 className="top-bar-title">3D导演台</h1>
          </div>
          <div className="top-bar-center">
            <div className="mode-toggle ui-segmented" role="group" aria-label="视角切换">
              <button
                className={`mode-toggle-button ui-segmented-item ${
                  viewMode === 'director' ? 'ui-segmented-item-active' : ''
                }`}
                aria-pressed={viewMode === 'director'}
                type="button"
                onClick={() => setViewMode('director')}
              >
                导演视角
              </button>
              <button
                className={`mode-toggle-button ui-segmented-item ${
                  viewMode === 'camera' ? 'ui-segmented-item-active' : ''
                }`}
                aria-pressed={viewMode === 'camera'}
                type="button"
                onClick={() => setViewMode('camera')}
              >
                机位视角
              </button>
            </div>
          </div>
          <div className="top-bar-actions">
            <button
              className="top-bar-action-button"
              type="button"
              aria-label="关闭导演台"
              title="关闭"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }}
            >
              <X aria-hidden="true" size={16} strokeWidth={1.8} />
            </button>
          </div>
        </header>
        <Suspense
          fallback={
            <div className="grid h-full w-full place-items-center bg-[#090909] text-[13px] text-white/60">
              正在打开导演台...
            </div>
          }
        >
          <DirectorDeskStage nodeId={nodeId} />
        </Suspense>
      </div>
    </div>
  );
}
