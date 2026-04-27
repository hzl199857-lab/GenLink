'use client';

import React from 'react';
import { InfiniteCanvas } from '@/components/canvas/InfiniteCanvas';
import { CanvasHeader } from '@/components/canvas/CanvasHeader';
import { useCanvasStore } from '@/store/canvas-store';

export default function HomePage() {
  const projectName = useCanvasStore((s) => s.projectName);
  const loading = useCanvasStore((s) => s.loading);
  const error = useCanvasStore((s) => s.error);
  
  const setProjectName = useCanvasStore((s) => s.setProjectName);
  const newProject = useCanvasStore((s) => s.newProject);
  const saveProject = useCanvasStore((s) => s.saveProject);
  const loadProject = useCanvasStore((s) => s.loadProject);

  const handleOpenLoadDialog = () => {
    const projectId = window.prompt('请输入要加载的项目 ID (Project ID):');
    if (projectId) {
      loadProject(projectId).catch((err) => {
        alert('加载失败: ' + err.message);
      });
    }
  };

  const handleSave = () => {
    saveProject().then((id) => {
      // Success is handled silently or via Toast in the future
    }).catch((err) => {
      // Error handled by store, sets hasError state
    });
  };

  return (
    <main className="fixed inset-0 w-full h-full bg-gl-app overflow-hidden text-gl-text-primary">
      <CanvasHeader
        projectName={projectName}
        loading={loading}
        hasError={!!error}
        onProjectNameChange={setProjectName}
        onNewProject={() => newProject()}
        onSave={handleSave}
        onOpenLoadDialog={handleOpenLoadDialog}
      />
      <InfiniteCanvas />
    </main>
  );
}
