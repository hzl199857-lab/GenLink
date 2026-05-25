'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Globe2, Image as ImageIcon } from 'lucide-react';
import { Position } from 'reactflow';
import type {
  Panorama360NodeData,
  Panorama360ViewState,
} from '../../types/canvas';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';

const CARD_WIDTH = 720;
const CARD_HEIGHT = 405;
const PITCH_LIMIT = 77.5 * Math.PI / 180;
const FOV_MIN = 35;
const FOV_MAX = 80;
const POINTER_SENSITIVITY = 0.003;
const DEFAULT_VIEW: Panorama360ViewState = {
  yaw: 0,
  pitch: 0,
  fov: 72,
};

type ThreeRuntime = {
  THREE: typeof import('three');
  camera: import('three').PerspectiveCamera;
  renderer: import('three').WebGLRenderer;
  sphere: import('three').Mesh;
  texture: import('three').Texture | null;
  render: () => void;
  disposed: boolean;
};

export type Panorama360SourceImage = {
  imageUrl: string;
  previewUrl?: string;
  alt?: string;
  fileName?: string;
  width?: number;
  height?: number;
};

export interface Panorama360NodeProps {
  data: Panorama360NodeData;
  selected?: boolean;
  sourceImage?: Panorama360SourceImage | null;
  accessoriesVisible?: boolean;
  onTitleChange?: (nextTitle: string | undefined) => void;
  onViewChange?: (view: Panorama360ViewState) => void;
  onNavigationActiveChange?: (active: boolean) => void;
  onSelectNode?: () => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeView(view?: Partial<Panorama360ViewState>): Panorama360ViewState {
  return {
    yaw: Number.isFinite(view?.yaw) ? view?.yaw as number : DEFAULT_VIEW.yaw,
    pitch: clamp(
      Number.isFinite(view?.pitch) ? view?.pitch as number : DEFAULT_VIEW.pitch,
      -PITCH_LIMIT,
      PITCH_LIMIT,
    ),
    fov: clamp(
      Number.isFinite(view?.fov) ? view?.fov as number : DEFAULT_VIEW.fov,
      FOV_MIN,
      FOV_MAX,
    ),
  };
}

function getTextureImageDimensions(texture: import('three').Texture): {
  width?: number;
  height?: number;
} {
  const image = texture.image as
    | { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }
    | undefined;

  return {
    width: image?.naturalWidth || image?.width,
    height: image?.naturalHeight || image?.height,
  };
}

function isCloseToEquirectangular(width?: number, height?: number): boolean {
  if (!width || !height || width <= 0 || height <= 0) {
    return true;
  }

  return Math.abs(width / height - 2) <= 0.04;
}

export function Panorama360Node({
  data,
  selected = false,
  sourceImage,
  accessoriesVisible = selected,
  onTitleChange,
  onViewChange,
  onNavigationActiveChange,
  onSelectNode,
}: Panorama360NodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ThreeRuntime | null>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const navigationActiveRef = useRef(false);
  const loadStateRef = useRef<'empty' | 'loading' | 'ready' | 'error'>('empty');
  const viewRef = useRef(
    normalizeView(data.panorama360Node.viewport.panoramaView),
  );
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [navigationActive, setNavigationActive] = useState(false);
  const [textureStatus, setTextureStatus] = useState<{
    signature: string;
    state: 'ready' | 'error';
  } | null>(null);
  const [textureSize, setTextureSize] = useState<{
    width?: number;
    height?: number;
  }>({
    width: sourceImage?.width,
    height: sourceImage?.height,
  });
  const sourceUrl = sourceImage?.imageUrl?.trim() || '';
  const sourceSignature = useMemo(
    () => [
      sourceUrl,
      sourceImage?.width ?? '',
      sourceImage?.height ?? '',
    ].join('|'),
    [sourceImage?.height, sourceImage?.width, sourceUrl],
  );
  const loadState: 'empty' | 'loading' | 'ready' | 'error' =
    !sourceUrl
      ? 'empty'
      : textureStatus?.signature === sourceSignature
        ? textureStatus.state
        : 'loading';
  const canNavigate = navigationActive && loadState === 'ready';
  const showAspectWarning =
    loadState === 'ready' &&
    !isCloseToEquirectangular(
      textureSize.width ?? sourceImage?.width,
      textureSize.height ?? sourceImage?.height,
    );

  useEffect(() => {
    viewRef.current = normalizeView(data.panorama360Node.viewport.panoramaView);
    runtimeRef.current?.render();
  }, [data.panorama360Node.viewport.panoramaView]);

  useEffect(() => {
    draggingRef.current = false;
  }, [selected]);

  navigationActiveRef.current = navigationActive;
  loadStateRef.current = loadState;

  useEffect(() => {
    onNavigationActiveChange?.(canNavigate);
  }, [canNavigate, onNavigationActiveChange]);

  useEffect(() => {
    return () => onNavigationActiveChange?.(false);
  }, [onNavigationActiveChange]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    void import('three').then((THREE) => {
      if (cancelled || !containerRef.current) {
        return;
      }

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        viewRef.current.fov,
        1,
        0.1,
        250,
      );
      camera.rotation.order = 'YXZ';
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      renderer.sortObjects = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearAlpha(0);
      renderer.domElement.className = 'block h-full w-full';

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(60, 48, 32),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          side: THREE.BackSide,
        }),
      );
      sphere.visible = false;
      scene.add(sphere);

      const runtime: ThreeRuntime = {
        THREE,
        camera,
        renderer,
        sphere,
        texture: null,
        disposed: false,
        render: () => {
          if (runtime.disposed) {
            return;
          }

          const view = viewRef.current;
          camera.rotation.set(view.pitch, view.yaw, 0);
          camera.fov = view.fov;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
        },
      };

      runtimeRef.current = runtime;
      containerRef.current.appendChild(renderer.domElement);

      const resize = () => {
        const rect = containerRef.current?.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect?.width || CARD_WIDTH));
        const height = Math.max(1, Math.floor(rect?.height || CARD_HEIGHT));

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        runtime.render();
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(containerRef.current);
      resize();
      setRuntimeReady(true);
    });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();

      const runtime = runtimeRef.current;
      runtimeRef.current = null;

      if (!runtime) {
        return;
      }

      runtime.disposed = true;
      runtime.texture?.dispose();
      runtime.sphere.geometry.dispose();

      if (Array.isArray(runtime.sphere.material)) {
        runtime.sphere.material.forEach((material) => material.dispose());
      } else {
        runtime.sphere.material.dispose();
      }

      runtime.renderer.dispose();
      runtime.renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;

    if (!runtimeReady || !runtime) {
      return;
    }

    runtime.texture?.dispose();
    runtime.texture = null;
    runtime.sphere.visible = false;
    const material = runtime.sphere.material as import('three').MeshBasicMaterial;
    material.map = null;
    material.needsUpdate = true;
    setTextureSize({
      width: sourceImage?.width,
      height: sourceImage?.height,
    });

    if (!sourceUrl) {
      runtime.render();
      return;
    }

    let cancelled = false;
    const loader = new runtime.THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      sourceUrl,
      (texture) => {
        if (cancelled || runtime.disposed) {
          texture.dispose();
          return;
        }

        texture.colorSpace = runtime.THREE.SRGBColorSpace;
        texture.magFilter = runtime.THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = runtime.renderer.capabilities.getMaxAnisotropy();
        material.map = texture;
        material.needsUpdate = true;
        runtime.texture = texture;
        runtime.sphere.visible = true;
        setTextureSize(getTextureImageDimensions(texture));
        setTextureStatus({
          signature: sourceSignature,
          state: 'ready',
        });
        runtime.render();
      },
      undefined,
      () => {
        if (cancelled || runtime.disposed) {
          return;
        }

        setTextureStatus({
          signature: sourceSignature,
          state: 'error',
        });
        runtime.render();
      },
    );

    return () => {
      cancelled = true;
    };
  }, [runtimeReady, sourceImage?.height, sourceImage?.width, sourceSignature, sourceUrl]);

  const commitView = () => {
    onViewChange?.({ ...viewRef.current });
  };

  const setNavigationMode = (active: boolean) => {
    navigationActiveRef.current = active;
    setNavigationActive(active);
    onNavigationActiveChange?.(active && loadStateRef.current === 'ready');
  };

  const isNavigationReady = () =>
    navigationActiveRef.current && loadStateRef.current === 'ready';

  const updateFovFromWheel = (deltaY: number) => {
    const view = viewRef.current;

    viewRef.current = {
      ...view,
      fov: clamp(view.fov + deltaY * 0.05, FOV_MIN, FOV_MAX),
    };
    runtimeRef.current?.render();
    commitView();
  };

  useEffect(() => {
    const handleNativeWheel = (event: WheelEvent) => {
      const container = containerRef.current;

      if (
        !container ||
        !isNavigationReady() ||
        !(event.target instanceof Node) ||
        !container.contains(event.target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onSelectNode?.();
      updateFovFromWheel(event.deltaY);
    };

    window.addEventListener('wheel', handleNativeWheel, {
      capture: true,
      passive: false,
    });
    return () => {
      window.removeEventListener('wheel', handleNativeWheel, {
        capture: true,
      });
    };
  });

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canNavigate) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelectNode?.();
    draggingRef.current = true;
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const last = lastPointerRef.current;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    const view = viewRef.current;

    viewRef.current = {
      ...view,
      yaw: view.yaw - dx * POINTER_SENSITIVITY,
      pitch: clamp(view.pitch - dy * POINTER_SENSITIVITY, -PITCH_LIMIT, PITCH_LIMIT),
    };
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    runtimeRef.current?.render();
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = false;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    commitView();
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!canNavigate) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelectNode?.();
    updateFovFromWheel(event.deltaY);
  };

  const handleWheelCapture = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!canNavigate) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      className={[
        'relative group node-connectable-root',
        canNavigate ? 'nowheel' : '',
      ].join(' ')}
      style={{ width: CARD_WIDTH }}
    >
      <div className="panorama-360-node-drag-handle node-visible-title -mt-2 mb-1.5 ml-1 flex cursor-grab select-none items-center gap-1.5 text-gl-text-tertiary active:cursor-grabbing">
        <Globe2 size={24} />
        <EditableNodeTitle
          value={data.title}
          fallbackValue="360全景图"
          className="text-[22px] font-medium leading-none"
          inputClassName="nodrag nopan rounded bg-white/8 px-1 text-[22px] font-medium leading-none text-gl-text-primary outline-none ring-1 ring-white/18"
          onCommit={onTitleChange}
        />
      </div>

      <div
        className={[
          'node-connectable-card relative overflow-hidden rounded-gl-xl border bg-[#080b10] shadow-gl-card transition-all duration-150',
          selected
            ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.95)]'
            : 'border-transparent shadow-[0_12px_34px_rgba(0,0,0,0.22)]',
        ].join(' ')}
        style={{ height: CARD_HEIGHT }}
        onClick={(event) => {
          event.stopPropagation();
          onSelectNode?.();
          setNavigationMode(false);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSelectNode?.();
          if (loadState === 'ready') {
            setNavigationMode(true);
          }
        }}
      >
        <div
          ref={containerRef}
          className={[
            'absolute inset-0 touch-none select-none',
            canNavigate
              ? 'nodrag nopan nowheel cursor-grab active:cursor-grabbing'
              : 'cursor-default',
          ].join(' ')}
          onWheelCapture={handleWheelCapture}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        />

        {loadState === 'empty' ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-gl-text-muted">
            <ImageIcon size={30} />
            <span className="text-[13px] font-medium">连接一张 2:1 全景图</span>
          </div>
        ) : null}

        {loadState === 'loading' ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/18 text-[13px] font-medium text-white/70">
            加载全景图...
          </div>
        ) : null}

        {loadState === 'error' ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5 text-center text-[13px] font-medium text-red-200">
            全景图加载失败
          </div>
        ) : null}

        {showAspectWarning ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-[8px] border border-amber-300/24 bg-black/62 px-2.5 py-1.5 text-[11px] font-medium text-amber-100 shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
            建议使用 2:1 等距柱状投影图片
          </div>
        ) : null}
      </div>

      <CardSideHandle
        type="target"
        position={Position.Left}
        visible={accessoriesVisible}
        cardTopOffset={18}
        cardWidth={CARD_WIDTH}
      />
    </div>
  );
}
