'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Expand,
  Globe2,
  Image as ImageIcon,
  Pencil,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import { Position, useViewport } from 'reactflow';
import type {
  Panorama360NodeData,
  Panorama360ViewState,
} from '../../types/canvas';
import { Tooltip } from '@/components/ui/Tooltip';
import { CardSideHandle } from './CardSideHandle';
import { EditableNodeTitle } from './EditableNodeTitle';

const EXPANDED_WIDTH = 720;
const EXPANDED_HEIGHT = 405;
const COLLAPSED_WIDTH = 420;
const COLLAPSED_HEIGHT = 236;
const PITCH_LIMIT = 77.5 * Math.PI / 180;
const FOV_MIN = 35;
const FOV_MAX = 80;
const POINTER_SENSITIVITY = 0.003;
const DEFAULT_VIEW: Panorama360ViewState = {
  yaw: 0,
  pitch: 0,
  fov: 72,
};
const SCREENSHOT_ASPECT_OPTIONS = [
  { id: 'auto', label: '自适应', ratio: null },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '2.35:1', label: '2.35:1', ratio: 2.35 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
] as const;

type ScreenshotAspectId = typeof SCREENSHOT_ASPECT_OPTIONS[number]['id'];

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

export type Panorama360ScreenshotCapture = {
  dataUrl: string;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
  aspect: ScreenshotAspectId;
  view: Panorama360ViewState;
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
  onUploadPanorama?: (file: File) => void;
  onScreenshot?: (capture: Panorama360ScreenshotCapture) => Promise<void> | void;
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

function getScreenshotAspectRatio(aspect: ScreenshotAspectId, width: number, height: number): number | null {
  if (aspect === 'auto') {
    return null;
  }

  return SCREENSHOT_ASPECT_OPTIONS.find((option) => option.id === aspect)?.ratio ?? width / Math.max(height, 1);
}

function PanoramaToolbarButton({
  title,
  children,
  danger,
  onClick,
}: {
  title: string;
  children: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="group/tooltip relative">
      <button
        type="button"
        aria-label={title}
        className={[
          'nodrag nopan flex h-10 w-10 items-center justify-center rounded-gl-pill transition-colors hover:bg-gl-panel-hover',
          danger ? 'text-red-400 hover:text-red-300' : 'text-gl-text-secondary hover:text-gl-text-primary',
        ].join(' ')}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClick?.();
        }}
      >
        {children}
      </button>
      <Tooltip label={title} side="top" />
    </div>
  );
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
  onUploadPanorama,
  onScreenshot,
}: Panorama360NodeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const runtimeRef = useRef<ThreeRuntime | null>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const navigationActiveRef = useRef(false);
  const fullscreenPreviousNavigationRef = useRef(false);
  const aspectMenuCloseTimerRef = useRef<number | null>(null);
  const onSelectNodeRef = useRef(onSelectNode);
  const onViewChangeRef = useRef(onViewChange);
  const viewRef = useRef(
    normalizeView(data.panorama360Node.viewport.panoramaView),
  );
  const { zoom } = useViewport();
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeVersion, setRuntimeVersion] = useState(0);
  const [navigationActive, setNavigationActive] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [screenshotAspect, setScreenshotAspect] = useState<ScreenshotAspectId | null>(null);
  const [aspectMenuOpen, setAspectMenuOpen] = useState(false);
  const [capturingScreenshot, setCapturingScreenshot] = useState(false);
  const [viewerSize, setViewerSize] = useState({ width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT });
  const [textureStatus, setTextureStatus] = useState<{
    signature: string;
    state: 'ready' | 'error';
  } | null>(null);
  const [textureSize, setTextureSize] = useState<{
    width?: number;
    height?: number;
  }>({
    width: data.panorama360Node.panorama.generatedImageWidth ?? sourceImage?.width,
    height: data.panorama360Node.panorama.generatedImageHeight ?? sourceImage?.height,
  });
  const generatedImageUrl =
    data.panorama360Node.panorama.generatedHostedImageUrl?.trim() ||
    data.panorama360Node.panorama.generatedImageUrl?.trim() ||
    '';
  const sourceUrl = generatedImageUrl || sourceImage?.imageUrl?.trim() || '';
  const sourceSignature = useMemo(
    () => [
      sourceUrl,
      data.panorama360Node.panorama.generatedImageWidth ?? sourceImage?.width ?? '',
      data.panorama360Node.panorama.generatedImageHeight ?? sourceImage?.height ?? '',
    ].join('|'),
    [
      data.panorama360Node.panorama.generatedImageHeight,
      data.panorama360Node.panorama.generatedImageWidth,
      sourceImage?.height,
      sourceImage?.width,
      sourceUrl,
    ],
  );
  const generationStatus = data.panorama360Node.panorama.generationStatus ?? 'idle';
  const isGeneratingPanorama = generationStatus === 'generating';
  const loadState: 'empty' | 'loading' | 'ready' | 'error' =
    isGeneratingPanorama
      ? 'loading'
      : generationStatus === 'error' && !sourceUrl
        ? 'error'
    : !sourceUrl
      ? 'empty'
      : textureStatus?.signature === sourceSignature
        ? textureStatus.state
        : 'loading';
  const canNavigate = navigationActive || fullscreen;
  const cardWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
  const cardHeight = collapsed ? COLLAPSED_HEIGHT : EXPANDED_HEIGHT;
  const screenshotFrame = useMemo(() => {
    if (!screenshotAspect || screenshotAspect === 'auto') {
      return null;
    }

    const width = Math.max(1, viewerSize.width);
    const height = Math.max(1, viewerSize.height);
    const ratio = getScreenshotAspectRatio(screenshotAspect, width, height);

    if (!ratio) {
      return null;
    }

    const fittedHeightFromWidth = width / ratio;
    const frameWidth = fittedHeightFromWidth <= height
      ? width
      : height * ratio;
    const frameHeight = fittedHeightFromWidth <= height
      ? fittedHeightFromWidth
      : height;

    return {
      x: Math.round((width - frameWidth) / 2),
      y: Math.round((height - frameHeight) / 2),
      width: Math.round(frameWidth),
      height: Math.round(frameHeight),
    };
  }, [screenshotAspect, viewerSize.height, viewerSize.width]);
  const showAspectWarning =
    loadState === 'ready' &&
    !isCloseToEquirectangular(
      textureSize.width ??
        data.panorama360Node.panorama.generatedImageWidth ??
        sourceImage?.width,
      textureSize.height ??
        data.panorama360Node.panorama.generatedImageHeight ??
        sourceImage?.height,
    );

  const commitView = () => {
    onViewChange?.({ ...viewRef.current });
  };

  const updateViewerSize = useCallback((width: number, height: number) => {
    setViewerSize((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  }, []);

  const cancelAspectMenuClose = useCallback(() => {
    if (aspectMenuCloseTimerRef.current === null) {
      return;
    }

    window.clearTimeout(aspectMenuCloseTimerRef.current);
    aspectMenuCloseTimerRef.current = null;
  }, []);

  const openAspectMenu = useCallback(() => {
    cancelAspectMenuClose();
    setAspectMenuOpen(true);
  }, [cancelAspectMenuClose]);

  const scheduleAspectMenuClose = useCallback(() => {
    cancelAspectMenuClose();
    aspectMenuCloseTimerRef.current = window.setTimeout(() => {
      setAspectMenuOpen(false);
      aspectMenuCloseTimerRef.current = null;
    }, 260);
  }, [cancelAspectMenuClose]);

  const setNavigationMode = useCallback((active: boolean) => {
    const nextActive = active && Boolean(sourceUrl);
    navigationActiveRef.current = nextActive;
    if (!nextActive) {
      cancelAspectMenuClose();
      setAspectMenuOpen(false);
    }
    setNavigationActive(nextActive);
  }, [cancelAspectMenuClose, sourceUrl]);

  const updateFovFromWheel = (deltaY: number) => {
    const view = viewRef.current;

    viewRef.current = {
      ...view,
      fov: clamp(view.fov + deltaY * 0.05, FOV_MIN, FOV_MAX),
    };
    runtimeRef.current?.render();
    onViewChangeRef.current?.({ ...viewRef.current });
  };

  useEffect(() => {
    viewRef.current = normalizeView(data.panorama360Node.viewport.panoramaView);
    runtimeRef.current?.render();
  }, [data.panorama360Node.viewport.panoramaView]);

  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
    onViewChangeRef.current = onViewChange;
  }, [onSelectNode, onViewChange]);

  useEffect(() => {
    draggingRef.current = false;
  }, [selected]);

  useEffect(() => {
    if (!selected && navigationActiveRef.current) {
      setNavigationMode(false);
    }
  }, [selected, setNavigationMode]);

  useEffect(() => {
    onNavigationActiveChange?.(canNavigate);
  }, [canNavigate, onNavigationActiveChange]);

  useEffect(() => {
    return () => onNavigationActiveChange?.(false);
  }, [onNavigationActiveChange]);

  useEffect(() => {
    return () => cancelAspectMenuClose();
  }, [cancelAspectMenuClose]);

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
      renderer.domElement.className = 'block h-full w-full nowheel';
      renderer.domElement.onwheel = (event) => {
        if (!navigationActiveRef.current && !fullscreen) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onSelectNodeRef.current?.();
        updateFovFromWheel(event.deltaY);
      };

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(60, 64, 48),
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
        const element = containerRef.current;
        const width = Math.max(1, Math.floor(element?.clientWidth || cardWidth));
        const height = Math.max(1, Math.floor(element?.clientHeight || cardHeight));

        updateViewerSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
        renderer.setSize(width, height, false);
        runtime.render();
      };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(containerRef.current);
      resize();
      setRuntimeReady(true);
      setRuntimeVersion((version) => version + 1);
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
      runtime.renderer.domElement.onwheel = null;
      runtime.renderer.domElement.remove();
    };
  }, [cardHeight, cardWidth, fullscreen, updateViewerSize]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const container = containerRef.current;

    if (!runtime || !container) {
      return;
    }

    if (runtime.renderer.domElement.parentElement !== container) {
      container.appendChild(runtime.renderer.domElement);
    }

    const resize = () => {
      const width = Math.max(1, Math.floor(container.clientWidth || cardWidth));
      const height = Math.max(1, Math.floor(container.clientHeight || cardHeight));

      updateViewerSize(width, height);
      runtime.camera.aspect = width / height;
      runtime.camera.updateProjectionMatrix();
      runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
      runtime.renderer.setSize(width, height, false);
      runtime.render();
    };
    const resizeObserver = new ResizeObserver(resize);

    resizeObserver.observe(container);
    resize();

    return () => resizeObserver.disconnect();
  }, [cardHeight, cardWidth, collapsed, fullscreen, runtimeReady, updateViewerSize]);

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
      width: data.panorama360Node.panorama.generatedImageWidth ?? sourceImage?.width,
      height: data.panorama360Node.panorama.generatedImageHeight ?? sourceImage?.height,
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
        texture.wrapS = runtime.THREE.RepeatWrapping;
        texture.repeat.x = -1;
        texture.offset.x = 1;
        texture.magFilter = runtime.THREE.LinearFilter;
        texture.minFilter = runtime.THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
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
  }, [
    data.panorama360Node.panorama.generatedImageHeight,
    data.panorama360Node.panorama.generatedImageWidth,
    runtimeReady,
    runtimeVersion,
    sourceImage?.height,
    sourceImage?.width,
    sourceSignature,
    sourceUrl,
  ]);

  useEffect(() => {
    runtimeRef.current?.render();
  }, [collapsed, fullscreen]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || !canNavigate || collapsed) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      if (!(event.target instanceof Node) || !container.contains(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onSelectNodeRef.current?.();
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
  }, [canNavigate, collapsed, fullscreen]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canNavigate || collapsed) {
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

  const handleCardDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSelectNode?.();

    if (!sourceUrl) {
      return;
    }

    if (collapsed) {
      setCollapsed(false);
    }

    setNavigationMode(true);
  };

  const handleUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      onUploadPanorama?.(file);
      event.target.value = '';
    }
  };

  const toggleCollapsed = () => {
    const nextCollapsed = !collapsed;

    if (nextCollapsed) {
      setNavigationMode(false);
    }

    setCollapsed(nextCollapsed);
  };

  const resetView = () => {
    viewRef.current = { ...DEFAULT_VIEW };
    runtimeRef.current?.render();
    onViewChangeRef.current?.({ ...DEFAULT_VIEW });
  };

  const captureScreenshot = async () => {
    if (capturingScreenshot || loadState !== 'ready') {
      return;
    }

    const runtime = runtimeRef.current;
    const sourceCanvas = runtime?.renderer.domElement;
    const container = containerRef.current;

    if (!runtime || !sourceCanvas || !container) {
      return;
    }

    const cssWidth = Math.max(1, container.clientWidth);
    const cssHeight = Math.max(1, container.clientHeight);
    const cropCss = screenshotAspect === 'auto' || !screenshotFrame
      ? { x: 0, y: 0, width: cssWidth, height: cssHeight }
      : screenshotFrame;
    const scaleX = sourceCanvas.width / cssWidth;
    const scaleY = sourceCanvas.height / cssHeight;
    const sourceX = Math.max(0, Math.round(cropCss.x * scaleX));
    const sourceY = Math.max(0, Math.round(cropCss.y * scaleY));
    const sourceWidth = Math.max(1, Math.min(sourceCanvas.width - sourceX, Math.round(cropCss.width * scaleX)));
    const sourceHeight = Math.max(1, Math.min(sourceCanvas.height - sourceY, Math.round(cropCss.height * scaleY)));
    const outputCanvas = document.createElement('canvas');

    outputCanvas.width = sourceWidth;
    outputCanvas.height = sourceHeight;
    const context = outputCanvas.getContext('2d');

    if (!context) {
      return;
    }

    try {
      setCapturingScreenshot(true);
      runtime.render();
      context.drawImage(
        sourceCanvas,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        sourceWidth,
        sourceHeight,
      );
      await onScreenshot?.({
        dataUrl: outputCanvas.toDataURL('image/png'),
        width: sourceWidth,
        height: sourceHeight,
        displayWidth: Math.round(cropCss.width),
        displayHeight: Math.round(cropCss.height),
        aspect: screenshotAspect ?? 'auto',
        view: { ...viewRef.current },
      });
    } finally {
      setCapturingScreenshot(false);
    }
  };

  const handleScreenshotButton = () => {
    if (!screenshotAspect) {
      setAspectMenuOpen(true);
      return;
    }

    void captureScreenshot();
  };

  const enterFullscreen = () => {
    if (!sourceUrl) {
      return;
    }

    fullscreenPreviousNavigationRef.current = navigationActiveRef.current;
    setFullscreen(true);
    setNavigationMode(true);
  };

  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
    setNavigationMode(fullscreenPreviousNavigationRef.current);
  }, [setNavigationMode]);

  useEffect(() => {
    if (!fullscreen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        exitFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exitFullscreen, fullscreen]);

  const viewer = (
    <div
      className={[
        'node-connectable-card relative overflow-hidden border bg-[#080b10] transition-all duration-150',
        fullscreen
          ? 'h-full w-full rounded-[14px] border-white/10 shadow-none'
          : 'rounded-gl-xl shadow-gl-card',
        isGeneratingPanorama && !fullscreen
          ? 'text-node-running border-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.2),0_0_28px_rgba(255,255,255,0.26)]'
          : selected && !fullscreen
          ? 'border-white shadow-[0_0_0_2px_rgba(255,255,255,0.95)]'
          : fullscreen
            ? ''
            : 'border-transparent shadow-[0_12px_34px_rgba(0,0,0,0.22)]',
      ].join(' ')}
      style={{ height: fullscreen ? '100%' : cardHeight }}
      onClick={(event) => {
        event.stopPropagation();
        onSelectNode?.();
      }}
      onDoubleClick={handleCardDoubleClick}
    >
      <div
        ref={containerRef}
        className={[
          'absolute inset-0 touch-none select-none nowheel',
          canNavigate && !collapsed
            ? 'nodrag nopan cursor-grab active:cursor-grabbing'
            : 'cursor-default',
        ].join(' ')}
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
          {generationStatus === 'generating' ? '正在生成全景图...' : '加载全景图...'}
        </div>
      ) : null}

      {loadState === 'error' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5 text-center text-[13px] font-medium text-red-200">
          {data.panorama360Node.panorama.generationErrorMessage || '全景图加载失败'}
        </div>
      ) : null}

      {showAspectWarning && !collapsed ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-[8px] border border-amber-300/24 bg-black/62 px-2.5 py-1.5 text-[11px] font-medium text-amber-100 shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
          建议使用 2:1 等距柱状投影图片
        </div>
      ) : null}

      {navigationActive && !collapsed && loadState === 'ready' && screenshotFrame ? (
        <div
          className="pointer-events-none absolute border border-dashed border-white/62 bg-white/[0.03] shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
          style={{
            left: screenshotFrame.x,
            top: screenshotFrame.y,
            width: screenshotFrame.width,
            height: screenshotFrame.height,
          }}
        />
      ) : null}

    </div>
  );

  return (
    <>
      <div
        className="relative group node-connectable-root nowheel"
        style={{ width: cardWidth }}
      >
        {accessoriesVisible ? (
          <div
            data-canvas-menu-ignore="true"
            className="absolute left-1/2 z-30 transition-[top,transform] duration-300 ease-out"
            style={{
              top: '-58px',
              transform: `translateX(-50%) scale(${1 / Math.max(zoom, 0.0001)})`,
              transformOrigin: 'bottom center',
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center rounded-gl-pill border border-white/10 bg-gl-panel/95 px-2 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md">
              <PanoramaToolbarButton
                title={navigationActive ? '退出编辑' : '编辑'}
                danger={navigationActive}
                onClick={() => {
                  if (collapsed && sourceUrl) {
                    setCollapsed(false);
                    setNavigationMode(true);
                    return;
                  }

                  setNavigationMode(!navigationActive);
                }}
              >
                {navigationActive ? <X size={16} strokeWidth={2.2} /> : <Pencil size={16} strokeWidth={1.9} />}
              </PanoramaToolbarButton>
              <div className="mx-1 h-5 w-px bg-white/10" />
              <PanoramaToolbarButton
                title="上传全景图"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={16} strokeWidth={1.9} />
              </PanoramaToolbarButton>
              <PanoramaToolbarButton title="全屏显示" onClick={enterFullscreen}>
                <Expand size={16} strokeWidth={1.9} />
              </PanoramaToolbarButton>
              <PanoramaToolbarButton title={collapsed ? '展开' : '折叠'} onClick={toggleCollapsed}>
                {collapsed ? <ChevronDown size={16} strokeWidth={1.9} /> : <ChevronUp size={16} strokeWidth={1.9} />}
              </PanoramaToolbarButton>
            </div>
          </div>
        ) : null}

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

        {fullscreen ? null : viewer}

        {navigationActive && !collapsed ? (
          <div
            className="nodrag nopan absolute left-1/2 z-30 -translate-x-1/2"
            data-canvas-menu-ignore="true"
            style={{
              top: `${cardHeight + 54}px`,
              transform: `translateX(-50%) scale(${1 / Math.max(zoom, 0.0001)})`,
              transformOrigin: 'top center',
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseEnter={cancelAspectMenuClose}
            onMouseLeave={scheduleAspectMenuClose}
          >
            {aspectMenuOpen ? (
              <div
                className="absolute bottom-[52px] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-gl-xl border border-white/10 bg-gl-panel/95 px-2 py-2 text-gl-text-secondary shadow-gl-toolbar backdrop-blur-md"
                onMouseEnter={cancelAspectMenuClose}
                onMouseLeave={scheduleAspectMenuClose}
              >
                {SCREENSHOT_ASPECT_OPTIONS.map((option) => {
                  const active = screenshotAspect === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-label={`截图比例 ${option.label}`}
                      className={[
                        'flex h-[48px] min-w-[54px] flex-col items-center justify-center gap-1 rounded-gl-md px-2 text-[11px] font-medium transition-colors',
                        active
                          ? 'bg-gl-panel-hover text-gl-text-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]'
                          : 'hover:bg-gl-panel-hover hover:text-gl-text-primary',
                      ].join(' ')}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setScreenshotAspect(option.id);
                        setAspectMenuOpen(false);
                      }}
                    >
                      <span
                        className={[
                          'block border border-current opacity-90',
                          option.id === 'auto'
                            ? 'h-3 w-5 rounded-[4px] border-dashed'
                            : option.ratio && option.ratio < 1
                              ? 'h-5 w-3 rounded-[4px]'
                              : 'h-2.5 w-6 rounded-[4px]',
                        ].join(' ')}
                      />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="flex items-center rounded-gl-pill border border-white/10 bg-gl-panel/95 px-2 text-gl-text-primary shadow-gl-toolbar backdrop-blur-md">
              <div className="group/tooltip relative">
                <button
                  type="button"
                  aria-label={screenshotAspect ? '生成场景截图' : '选择截图比例'}
                  className="flex h-10 w-10 items-center justify-center rounded-gl-pill text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={capturingScreenshot || loadState !== 'ready'}
                  onMouseEnter={openAspectMenu}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleScreenshotButton();
                  }}
                >
                  <Camera size={16} strokeWidth={1.9} />
                </button>
                {aspectMenuOpen ? null : (
                  <Tooltip label={screenshotAspect ? '生成场景截图' : '选择截图比例'} side="top" />
                )}
              </div>

              <div className="mx-1 h-5 w-px bg-white/10" />

              <div className="group/tooltip relative">
                <button
                  type="button"
                  aria-label="重置视角"
                  className="flex h-10 w-10 items-center justify-center rounded-gl-pill text-gl-text-secondary transition-colors hover:bg-gl-panel-hover hover:text-gl-text-primary"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    resetView();
                  }}
                >
                  <RotateCcw size={16} strokeWidth={1.9} />
                </button>
                <Tooltip label="重置视角" side="top" />
              </div>
            </div>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUploadChange}
        />

        <CardSideHandle
          type="target"
          position={Position.Left}
          visible={accessoriesVisible}
          cardTopOffset={18}
          cardWidth={cardWidth}
        />
      </div>

      {fullscreen && typeof document !== 'undefined' ? createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black p-3"
          role="dialog"
          aria-modal="true"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label="退出全屏"
            className="nodrag nopan absolute right-8 top-7 z-20 rounded-full px-3 py-1.5 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              exitFullscreen();
            }}
          >
            退出全屏
          </button>
          <div className="h-full w-full overflow-hidden rounded-[14px]">
            {viewer}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
