'use client';

import React, { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Connection,
  Node as ReactFlowNode,
  Edge as ReactFlowEdge,
  NodeProps,
  BackgroundVariant,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useCanvasStore } from '@/store/canvas-store';
import type { CanvasNode, NodeType, PromptNodeData, TextNodeData, AITextResultNodeData, ImageNodeData } from '@/types/canvas';

import { TextNode } from '../nodes/TextNode';
import { PromptNode } from '../nodes/PromptNode';
import { AITextResultNode } from '../nodes/AITextResultNode';
import { ImageNode } from '../nodes/ImageNode';
import { NodeFloatingToolbar } from '../nodes/NodeFloatingToolbar';
import { CanvasToolbar } from './CanvasToolbar';

// --- Adapters ---
function TextNodeAdapter({ id, data, selected, xPos, yPos }: NodeProps) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addNode = useCanvasStore((s) => s.addNode);
  const [editing, setEditing] = useState(false);

  const handleCopy = () => {
    addNode({
      id: crypto.randomUUID(),
      type: 'text',
      position: { x: xPos + 40, y: yPos + 40 },
      data: { ...data },
    });
  };

  return (
    <div className="relative">
      <NodeFloatingToolbar
        visible={!!selected}
        onCopy={handleCopy}
        onDelete={() => deleteNode(id)}
        onLink={() => console.log('Link clicked')}
        onShare={() => console.log('Share clicked')}
        onMore={() => console.log('More clicked')}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-gl-panel !border !border-gl-stroke-medium !rounded-full hover:!bg-gl-accent-cool-soft transition-colors"
      />
      <TextNode
        id={id}
        data={data as TextNodeData}
        selected={selected}
        editing={editing}
        onChange={(next) => updateNodeData<'text'>(id, next)}
        onStartEdit={() => setEditing(true)}
        onEndEdit={() => setEditing(false)}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-gl-panel !border !border-gl-stroke-medium !rounded-full hover:!bg-gl-accent-cool-soft transition-colors"
      />
    </div>
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
    <div className="relative">
      <NodeFloatingToolbar
        visible={!!selected}
        onCopy={handleCopy}
        onDelete={() => deleteNode(id)}
        onLink={() => console.log('Link clicked')}
        onShare={() => console.log('Share clicked')}
        onMore={() => console.log('More clicked')}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-gl-panel !border !border-gl-stroke-medium !rounded-full hover:!bg-gl-accent-cool-soft transition-colors"
      />
      <PromptNode
        id={id}
        data={data as PromptNodeData}
        selected={selected}
        onChange={(next) => updateNodeData<'prompt'>(id, next)}
        onGenerateText={() => generateText(id)}
        onGenerateImage={() => generateImage(id)}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-gl-panel !border !border-gl-stroke-medium !rounded-full hover:!bg-gl-accent-cool-soft transition-colors"
      />
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
    <div className="relative">
      <NodeFloatingToolbar
        visible={!!selected}
        onCopy={handleCopy}
        onDelete={() => deleteNode(id)}
        onLink={() => console.log('Link clicked')}
        onShare={() => console.log('Share clicked')}
        onMore={() => console.log('More clicked')}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-gl-panel !border !border-gl-stroke-medium !rounded-full hover:!bg-gl-accent-cool-soft transition-colors"
      />
      <AITextResultNode
        id={id}
        data={data as AITextResultNodeData}
        selected={selected}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-gl-panel !border !border-gl-stroke-medium !rounded-full hover:!bg-gl-accent-cool-soft transition-colors"
      />
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
    <div className="relative">
      <NodeFloatingToolbar
        visible={!!selected}
        onCopy={handleCopy}
        onDelete={() => deleteNode(id)}
        onLink={() => console.log('Link clicked')}
        onShare={() => console.log('Share clicked')}
        onMore={() => console.log('More clicked')}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-gl-panel !border !border-gl-stroke-medium !rounded-full hover:!bg-gl-accent-cool-soft transition-colors"
      />
      <ImageNode
        id={id}
        data={data as ImageNodeData}
        selected={selected}
        loading={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2.5 !h-2.5 !bg-gl-panel !border !border-gl-stroke-medium !rounded-full hover:!bg-gl-accent-cool-soft transition-colors"
      />
    </div>
  );
}

const nodeTypes = {
  text: TextNodeAdapter,
  prompt: PromptNodeAdapter,
  ai_text_result: AITextResultNodeAdapter,
  image: ImageNodeAdapter,
};

// --- Inner Canvas ---
function InnerCanvas() {
  const storeNodes = useCanvasStore((s) => s.nodes);
  const storeEdges = useCanvasStore((s) => s.edges);
  
  const addNodeAtCenter = useCanvasStore((s) => s.addNodeAtCenter);
  const updateNodePosition = useCanvasStore((s) => s.updateNodePosition);
  const deleteNode = useCanvasStore((s) => s.deleteNode);
  const addEdgeStore = useCanvasStore((s) => s.addEdge);
  const deleteEdge = useCanvasStore((s) => s.deleteEdge);

  const [rfNodes, setRfNodes] = useState<ReactFlowNode[]>([]);
  const [rfEdges, setRfEdges] = useState<ReactFlowEdge[]>([]);

  const { project } = useReactFlow();

  // Sync store to local RF state
  useEffect(() => {
    setRfNodes((currentRfNodes) => {
      return storeNodes.map((n) => {
        const existing = currentRfNodes.find((rn) => rn.id === n.id);
        return {
          id: n.id,
          type: n.type,
          position: n.position,
          data: n.data,
          selected: existing?.selected,
          dragging: existing?.dragging,
        };
      });
    });
  }, [storeNodes]);

  useEffect(() => {
    setRfEdges((currentRfEdges) => {
      return storeEdges.map((e) => {
        const existing = currentRfEdges.find((re) => re.id === e.id);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          selected: existing?.selected,
        };
      });
    });
  }, [storeEdges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
    
    // Sync position and remove back to store
    changes.forEach((change) => {
      if (change.type === 'position' && change.position && !change.dragging) {
        updateNodePosition(change.id, change.position);
      } else if (change.type === 'remove') {
        deleteNode(change.id);
      }
    });
  }, [updateNodePosition, deleteNode]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));

    changes.forEach((change) => {
      if (change.type === 'remove') {
        deleteEdge(change.id);
      }
    });
  }, [deleteEdge]);

  const onConnect = useCallback((connection: Connection) => {
    addEdgeStore({
      id: crypto.randomUUID(),
      source: connection.source || '',
      target: connection.target || '',
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
    });
  }, [addEdgeStore]);

  const handleAddNode = useCallback((type: NodeType) => {
    // Calculate center of screen in RF coordinate space
    const center = project({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addNodeAtCenter(type, center);
  }, [addNodeAtCenter, project]);

  return (
    <>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        deleteKeyCode="Delete"
        defaultEdgeOptions={{
          animated: false,
          style: { stroke: 'rgba(190,205,225,0.3)', strokeWidth: 1.4 },
          type: 'smoothstep',
        }}
        fitView
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

      <CanvasToolbar
        onAddTextNode={() => handleAddNode('text')}
        onAddPromptNode={() => handleAddNode('prompt')}
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
