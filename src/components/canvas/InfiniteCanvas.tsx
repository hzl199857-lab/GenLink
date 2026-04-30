'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import ReactFlow, {
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  NodeChange,
  EdgeChange,
  Connection,
  Node as ReactFlowNode,
  Edge as ReactFlowEdge,
  NodeProps,
  BackgroundVariant,
  Position,
  type OnConnectStartParams,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { CANVAS_IMAGE_API_KEY_STORAGE_KEY, CANVAS_TEXT_API_KEY_STORAGE_KEY, useCanvasStore } from '@/store/canvas-store';
import type { CanvasNode, NodeType, PromptNodeData, TextNodeData, AITextResultNodeData, ImageNodeData, UploadedImageNodeData } from '@/types/canvas';

import { TextNode } from '../nodes/TextNode';
import { PromptNode } from '../nodes/PromptNode';
import { AITextResultNode } from '../nodes/AITextResultNode';
import { ImageNode } from '../nodes/ImageNode';
import { UploadedImageNode } from '../nodes/UploadedImageNode';
import { CardSideHandle } from '../nodes/CardSideHandle';
import { NodeFloatingToolbar } from '../nodes/NodeFloatingToolbar';
import { ApiSettingsPanel } from './ApiSettingsPanel';
import { AddNodeMenu, type AddNodeMenuAction } from './AddNodeMenu';
import { CanvasToolbar } from './CanvasToolbar';

let notifyPromptBarInteraction: (() => void) | null = null;

// --- Adapters ---
function readImageFile(file: File): Promise<UploadedImageNodeData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';

      if (!imageUrl) {
        reject(new Error('Invalid image file'));
        return;
      }

      const image = new window.Image();
      image.onload = () => {
        resolve({
          imageUrl,
          fileName: file.name,
          width: image.naturalWidth || 320,
          height: image.naturalHeight || 320,
        });
      };
      image.onerror = () => reject(new Error('Invalid image file'));
      image.src = imageUrl;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function createUploadedImageNode(
  data: UploadedImageNodeData,
  position: { x: number; y: number },
): CanvasNode {
  return {
    id: crypto.randomUUID(),
    type: 'uploaded_image',
    position,
    data,
  };
}

function TextNodeAdapter({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const generateText = useCanvasStore((s) => s.generateTextFromTextNode);
  const connectedImages = useCanvasStore((s) => s.getConnectedImagesForTextNode(id));
  const [editing, setEditing] = useState(false);
  const [promptFocused, setPromptFocused] = useState(false);

  return (
    <TextNode
      id={id}
      data={data as TextNodeData}
      selected={selected || promptFocused}
      editing={editing}
      connectedImages={connectedImages}
      onChange={(next) => updateNodeData<'text'>(id, next)}
      onStartEdit={() => setEditing(true)}
      onEndEdit={() => setEditing(false)}
      onRun={() => generateText(id)}
      onPromptPointerDown={() => notifyPromptBarInteraction?.()}
      onPromptFocusWithinChange={setPromptFocused}
    />
  );
}

function PromptNodeAdapter({ id, data, selected, xPos, yPos }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const generateText = useCanvasStore((s) => s.generateTextFromPrompt);
  const generateImage = useCanvasStore((s) => s.generateImageFromPrompt);

  const handleCopy = () => {
    addNode({
      id: crypto.randomUUID(),
      type: 'prompt',
      position: { x: xPos + 40, y: yPos + 40 },
      data: { ...data },
    });
  };

  return (
    <div className="relative group node-connectable-root">
      <NodeFloatingToolbar
        visible={!!selected}
        onCopy={handleCopy}
        onDelete={() => deleteNode(id)}
        onLink={() => console.log('Link clicked')}
        onShare={() => console.log('Share clicked')}
        onMore={() => console.log('More clicked')}
      />
      <CardSideHandle type="target" position={Position.Left} visible={!!selected} />
      <PromptNode
        id={id}
        data={data as PromptNodeData}
        selected={selected}
        onChange={(next) => updateNodeData<'prompt'>(id, next)}
        onGenerateText={() => generateText(id)}
        onGenerateImage={() => generateImage(id)}
      />
      <CardSideHandle type="source" position={Position.Right} visible={!!selected} />
    </div>
  );
}

function AITextResultNodeAdapter({ id, data, selected, xPos, yPos }: NodeProps) {
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);

  const handleCopy = () => {
    addNode({
      id: crypto.randomUUID(),
      type: 'ai_text_result',
      position: { x: xPos + 40, y: yPos + 40 },
      data: { ...data },
    });
  };

  return (
    <div className="relative group node-connectable-root">
      <NodeFloatingToolbar
        visible={!!selected}
        onCopy={handleCopy}
        onDelete={() => deleteNode(id)}
        onLink={() => console.log('Link clicked')}
        onShare={() => console.log('Share clicked')}
        onMore={() => console.log('More clicked')}
      />
      <CardSideHandle type="target" position={Position.Left} visible={!!selected} />
      <AITextResultNode
        id={id}
        data={data as AITextResultNodeData}
        selected={selected}
      />
      <CardSideHandle type="source" position={Position.Right} visible={!!selected} />
    </div>
  );
}

function ImageNodeAdapter({ id, data, selected, xPos, yPos }: NodeProps) {
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);

  const handleCopy = () => {
    addNode({
      id: crypto.randomUUID(),
      type: 'image',
      position: { x: xPos + 40, y: yPos + 40 },
      data: { ...data },
    });
  };

  return (
    <div className="relative group node-connectable-root">
      <NodeFloatingToolbar
        visible={!!selected}
        onCopy={handleCopy}
        onDelete={() => deleteNode(id)}
        onLink={() => console.log('Link clicked')}
        onShare={() => console.log('Share clicked')}
        onMore={() => console.log('More clicked')}
      />
      <CardSideHandle type="target" position={Position.Left} visible={!!selected} />
      <ImageNode
        id={id}
        data={data as ImageNodeData}
        selected={selected}
        loading={false}
      />
      <CardSideHandle type="source" position={Position.Right} visible={!!selected} />
    </div>
  );
}

function UploadedImageNodeAdapter({ id, data, selected }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);

  const handleReplace = async (file: File) => {
    const next = await readImageFile(file);
    updateNodeData<'uploaded_image'>(id, next);
  };

  return (
    <UploadedImageNode
      data={data as UploadedImageNodeData}
      selected={selected}
      onReplace={handleReplace}
    />
  );
}

const nodeTypes = {
  text: TextNodeAdapter,
  prompt: PromptNodeAdapter,
  ai_text_result: AITextResultNodeAdapter,
  image: ImageNodeAdapter,
  uploaded_image: UploadedImageNodeAdapter,
};

const EDGE_DELETE_BUTTON_SIZE = 20;
const EDGE_DELETE_BUTTON_OFFSET = 18;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

function getEdgeDeleteButtonPosition(point: { x: number; y: number }): { x: number; y: number } {
  const maxX = Math.max(8, window.innerWidth - EDGE_DELETE_BUTTON_SIZE - 8);
  const maxY = Math.max(8, window.innerHeight - EDGE_DELETE_BUTTON_SIZE - 8);

  return {
    x: Math.min(Math.max(point.x + EDGE_DELETE_BUTTON_OFFSET, 8), maxX),
    y: Math.min(Math.max(point.y + EDGE_DELETE_BUTTON_OFFSET, 8), maxY),
  };
}

function getConnectDropTargetElement(event: MouseEvent | TouchEvent): Element | null {
  if (event.target instanceof Element) {
    return event.target;
  }

  if ('changedTouches' in event) {
    const touch = event.changedTouches[0];

    if (touch) {
      return document.elementFromPoint(touch.clientX, touch.clientY);
    }
  }

  return null;
}

// --- Inner Canvas ---
function InnerCanvas() {
  const storeNodes = useCanvasStore((s) => s.nodes);
  const storeEdges = useCanvasStore((s) => s.edges);

  const addNodeAtCenter = useCanvasStore((s) => s.addNodeAtCenter);
  const updateNodePosition = useCanvasStore((s) => s.updateNodePosition);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const addEdgeStore = useCanvasStore((s) => s.addEdge);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(() => new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [edgeDeleteButtonPosition, setEdgeDeleteButtonPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const activeSelectedEdgeId = selectedEdgeId && storeEdges.some((edge) => edge.id === selectedEdgeId)
    ? selectedEdgeId
    : null;

  const rfNodes = useMemo<ReactFlowNode[]>(() => {
    return storeNodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
      selected: selectedNodeIds.has(n.id),
      dragHandle: n.type === 'text' ? '.text-node-drag-handle' : undefined,
    }));
  }, [storeNodes, selectedNodeIds]);

  const rfEdges = useMemo<ReactFlowEdge[]>(() => {
    return storeEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      selected: activeSelectedEdgeId === e.id,
      interactionWidth: 28,
      style: activeSelectedEdgeId === e.id
        ? {
            stroke: 'rgba(255,255,255,0.95)',
            strokeWidth: 4.4,
          }
        : {
            stroke: 'rgba(190,205,225,0.3)',
            strokeWidth: 2.8,
          },
    }));
  }, [activeSelectedEdgeId, storeEdges]);

  const [apiSettingsOpen, setApiSettingsOpen] = useState(false);
  const [textApiKey, setTextApiKey] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : window.localStorage.getItem(CANVAS_TEXT_API_KEY_STORAGE_KEY) ?? '',
  );
  const [imageApiKey, setImageApiKey] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : window.localStorage.getItem(CANVAS_IMAGE_API_KEY_STORAGE_KEY) ?? '',
  );
  const [addMenu, setAddMenu] = useState<{
    screen: { x: number; y: number };
    canvas: { x: number; y: number };
  } | null>(null);
  const uploadInputRef = React.useRef<HTMLInputElement>(null);
  const uploadPositionRef = React.useRef<{ x: number; y: number } | null>(null);
  const promptBarInteractionRef = useRef(false);
  const pendingConnectionRef = useRef<OnConnectStartParams | null>(null);

  const { project } = useReactFlow();

  useEffect(() => {
    notifyPromptBarInteraction = () => {
      promptBarInteractionRef.current = true;
      window.setTimeout(() => {
        promptBarInteractionRef.current = false;
      }, 0);
    };

    return () => {
      if (notifyPromptBarInteraction) {
        notifyPromptBarInteraction = null;
      }
    };
  }, []);

  const clearEdgeSelection = useCallback(() => {
    setSelectedEdgeId(null);
    setEdgeDeleteButtonPosition(null);
  }, []);

  const handleDeleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) {
      return;
    }

    deleteEdge(selectedEdgeId);
    clearEdgeSelection();
  }, [clearEdgeSelection, deleteEdge, selectedEdgeId]);

  const handleDeleteSelectedNodes = useCallback(() => {
    if (selectedNodeIds.size === 0) {
      return;
    }

    selectedNodeIds.forEach((nodeId) => {
      deleteNode(nodeId);
    });

    setSelectedNodeIds(new Set());
  }, [deleteNode, selectedNodeIds]);

  useEffect(() => {
    if (!selectedEdgeId && selectedNodeIds.size === 0) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      if (selectedNodeIds.size > 0) {
        handleDeleteSelectedNodes();
        clearEdgeSelection();
        return;
      }

      handleDeleteSelectedEdge();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    clearEdgeSelection,
    handleDeleteSelectedEdge,
    handleDeleteSelectedNodes,
    selectedEdgeId,
    selectedNodeIds,
  ]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const selectionChanges = changes.filter((change) => change.type === 'select');

    if (selectionChanges.length > 0) {
      if (promptBarInteractionRef.current) {
        return;
      }

      const activeElement = document.activeElement;

      if (!(activeElement instanceof Element) || !activeElement.closest('.text-node-prompt-bar')) {
        setSelectedNodeIds((current) => {
          const next = new Set(current);

          selectionChanges.forEach((change) => {
            if (change.selected) {
              next.add(change.id);
            } else {
              next.delete(change.id);
            }
          });

          return next;
        });
      }
    }

    changes.forEach((change) => {
      if (change.type === 'position' && change.position) {
        updateNodePosition(change.id, change.position);
      } else if (change.type === 'remove') {
        setSelectedNodeIds((current) => {
          if (!current.has(change.id)) return current;

          const next = new Set(current);
          next.delete(change.id);
          return next;
        });
        deleteNode(change.id);
      }
    });
  }, [updateNodePosition, deleteNode]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    changes.forEach((change) => {
      if (change.type === 'remove') {
        deleteEdge(change.id);
      }
    });
  }, [deleteEdge]);

  const handleEdgeClick = useCallback((
    event: React.MouseEvent,
    edge: ReactFlowEdge,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    setSelectedNodeIds(new Set());
    setAddMenu(null);
    setSelectedEdgeId(edge.id);
    setEdgeDeleteButtonPosition(getEdgeDeleteButtonPosition({
      x: event.clientX,
      y: event.clientY,
    }));
  }, []);

  const handlePaneClick = useCallback(() => {
    setAddMenu(null);
    clearEdgeSelection();
  }, [clearEdgeSelection]);

  const onConnect = useCallback((connection: Connection) => {
    addEdgeStore({
      id: crypto.randomUUID(),
      source: connection.source || '',
      target: connection.target || '',
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
    });
  }, [addEdgeStore]);

  const onConnectStart = useCallback((_event: React.MouseEvent | React.TouchEvent, params: OnConnectStartParams) => {
    pendingConnectionRef.current = params;
  }, []);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const pendingConnection = pendingConnectionRef.current;
    pendingConnectionRef.current = null;

    if (!pendingConnection?.nodeId || !pendingConnection.handleType) {
      return;
    }

    const dropTarget = getConnectDropTargetElement(event);

    if (!dropTarget || dropTarget.closest('.react-flow__handle')) {
      return;
    }

    const targetNodeElement = dropTarget.closest('.react-flow__node');
    const targetNodeId = targetNodeElement?.getAttribute('data-id');

    if (!targetNodeId || targetNodeId === pendingConnection.nodeId) {
      return;
    }

    if (pendingConnection.handleType === 'source') {
      addEdgeStore({
        id: crypto.randomUUID(),
        source: pendingConnection.nodeId,
        target: targetNodeId,
        sourceHandle: pendingConnection.handleId || undefined,
      });
      return;
    }

    addEdgeStore({
      id: crypto.randomUUID(),
      source: targetNodeId,
      target: pendingConnection.nodeId,
      targetHandle: pendingConnection.handleId || undefined,
    });
  }, [addEdgeStore]);

  const handleAddNode = useCallback((type: NodeType) => {
    const center = project({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addNodeAtCenter(type, center);
  }, [addNodeAtCenter, project]);

  const openUploadPicker = useCallback((position?: { x: number; y: number }) => {
    uploadPositionRef.current = position ?? project({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    const input = uploadInputRef.current;

    if (!input) {
      return;
    }

    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.click();
  }, [project]);

  const addUploadedImage = useCallback(async (file: File, position: { x: number; y: number }) => {
    const data = await readImageFile(file);
    addNode(createUploadedImageNode(data, position));
  }, [addNode]);

  const handleUploadInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const position = uploadPositionRef.current;

    if (file && position) {
      void addUploadedImage(file, position);
    }

    event.target.value = '';
    uploadPositionRef.current = null;
  }, [addUploadedImage]);

  const handleImageDrop = useCallback((event: React.DragEvent) => {
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith('image/'));

    if (!file) {
      return;
    }

    event.preventDefault();
    setAddMenu(null);
    void addUploadedImage(
      file,
      project({ x: event.clientX, y: event.clientY }),
    );
  }, [addUploadedImage, project]);

  const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
    const target = event.target;

    if (!(target instanceof Element) || target.closest('.react-flow__node')) {
      return;
    }

    const canvasPosition = project({
      x: event.clientX,
      y: event.clientY,
    });

    setAddMenu({
      screen: { x: event.clientX, y: event.clientY },
      canvas: canvasPosition,
    });
  }, [project]);

  const handleAddMenuSelect = useCallback((action: AddNodeMenuAction) => {
    if (action === 'text' && addMenu) {
      addNodeAtCenter('text', addMenu.canvas);
    }

    if (action === 'upload' && addMenu) {
      openUploadPicker(addMenu.canvas);
    }

    setAddMenu(null);
  }, [addMenu, addNodeAtCenter, openUploadPicker]);

  const handleSaveApiKeys = useCallback((values: { textApiKey: string; imageApiKey: string }) => {
    window.localStorage.setItem(CANVAS_TEXT_API_KEY_STORAGE_KEY, values.textApiKey);
    window.localStorage.setItem(CANVAS_IMAGE_API_KEY_STORAGE_KEY, values.imageApiKey);
    setTextApiKey(values.textApiKey);
    setImageApiKey(values.imageApiKey);
    setApiSettingsOpen(false);
  }, []);

  return (
    <>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onNodeClick={clearEdgeSelection}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onPaneClick={handlePaneClick}
        onPaneScroll={handlePaneClick}
        onMoveStart={handlePaneClick}
        onDoubleClick={handlePaneDoubleClick}
        connectOnClick={false}
        zoomOnDoubleClick={false}
        nodeDragThreshold={1}
        deleteKeyCode={null}
        defaultEdgeOptions={{
          animated: false,
          style: { stroke: 'rgba(190,205,225,0.3)', strokeWidth: 2.8 },
          type: 'smoothstep',
        }}
        fitView
        onDrop={handleImageDrop}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer.items).some((item) => item.kind === 'file')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
      >
        <Background
          gap={24}
          size={0.8}
          color="rgba(255,255,255,0.06)"
          variant={BackgroundVariant.Dots}
          className="gl-canvas-bg"
        />
        <MiniMap
          style={{ background: '#131923', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14 }}
          maskColor="rgba(11,13,18,0.6)"
          nodeColor={() => '#1A2230'}
          nodeStrokeColor={() => 'rgba(255,255,255,0.1)'}
          pannable
          zoomable
        />
        <Controls
          className="!bg-gl-panel !border !border-gl-stroke-subtle !rounded-gl-md"
          showInteractive={false}
        />
      </ReactFlow>

      {activeSelectedEdgeId && edgeDeleteButtonPosition ? (
        <button
          type="button"
          aria-label="Delete selected connection"
          className="edge-delete-button fixed z-20 flex h-5 w-5 items-center justify-center rounded-full border border-white/35 bg-white text-[#1b1f27] shadow-[0_8px_18px_rgba(255,255,255,0.22)] transition hover:scale-110 hover:bg-white/90"
          style={{
            left: edgeDeleteButtonPosition.x,
            top: edgeDeleteButtonPosition.y,
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleDeleteSelectedEdge();
          }}
        >
          <X size={10} strokeWidth={3} />
        </button>
      ) : null}

      {addMenu ? (
        <AddNodeMenu
          x={addMenu.screen.x}
          y={addMenu.screen.y}
          onSelect={handleAddMenuSelect}
        />
      ) : null}

      <CanvasToolbar
        onAddTextNode={() => handleAddNode('text')}
        onAddPromptNode={() => handleAddNode('prompt')}
        onUploadImage={() => openUploadPicker()}
        onOpenApiSettings={() => setApiSettingsOpen(true)}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleUploadInputChange}
      />
      <ApiSettingsPanel
        open={apiSettingsOpen}
        initialTextApiKey={textApiKey}
        initialImageApiKey={imageApiKey}
        onClose={() => setApiSettingsOpen(false)}
        onSave={handleSaveApiKeys}
      />
    </>
  );
}

// --- Wrapper ---
export function InfiniteCanvas() {
  return (
    <ReactFlowProvider>
      <InnerCanvas />
    </ReactFlowProvider>
  );
}
