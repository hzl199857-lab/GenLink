'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

const FRAG_SHADER = /* glsl */ `
  precision mediump float;
  in vec2 fragCoord;

  uniform float u_time;
  uniform float u_opacities[10];
  uniform vec3 u_colors[6];
  uniform float u_total_size;
  uniform float u_dot_size;
  uniform vec2 u_resolution;
  uniform int u_reverse;

  out vec4 fragColor;

  float PHI = 1.61803398874989484820459;
  float random(vec2 xy) { return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x); }

  void main() {
    vec2 st = fragCoord.xy;
    st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));
    st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));

    float opacity = step(0.0, st.x);
    opacity *= step(0.0, st.y);

    vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));

    float frequency = 5.0;
    float show_offset = random(st2);
    float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
    opacity *= u_opacities[int(rand * 10.0)];
    opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
    opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

    vec3 color = u_colors[int(show_offset * 6.0)];

    float animation_speed_factor = 0.5;
    vec2 center_grid = u_resolution / 2.0 / u_total_size;
    float dist_from_center = distance(center_grid, st2);

    float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);
    float max_grid_dist = distance(center_grid, vec2(0.0, 0.0));
    float timing_offset_outro = (max_grid_dist - dist_from_center) * 0.02 + (random(st2 + 42.0) * 0.2);

    float current_timing_offset;
    if (u_reverse == 1) {
      current_timing_offset = timing_offset_outro;
      opacity *= 1.0 - step(current_timing_offset, u_time * animation_speed_factor);
      opacity *= clamp((step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
    } else {
      current_timing_offset = timing_offset_intro;
      opacity *= step(current_timing_offset, u_time * animation_speed_factor);
      opacity *= clamp((1.0 - step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
    }

    fragColor = vec4(color, opacity);
    fragColor.rgb *= fragColor.a;
  }
`;

const VERT_SHADER = /* glsl */ `
  precision mediump float;
  uniform vec2 u_resolution;
  out vec2 fragCoord;
  void main() {
    gl_Position = vec4(position.x, position.y, 0.0, 1.0);
    fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution;
    fragCoord.y = u_resolution.y - fragCoord.y;
  }
`;

interface CanvasRevealEffectProps {
  animationSpeed?: number;
  startTimeOffsetMs?: number;
  opacities?: number[];
  colors?: number[][];
  containerClassName?: string;
  dotSize?: number;
  showGradient?: boolean;
  reverse?: boolean;
}

const DEFAULT_OPACITIES = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1];
const DEFAULT_COLORS = [[0, 255, 255]];

export function CanvasRevealEffect({
  animationSpeed = 10,
  startTimeOffsetMs = 0,
  opacities = DEFAULT_OPACITIES,
  colors = DEFAULT_COLORS,
  containerClassName = '',
  dotSize = 3,
  showGradient = true,
  reverse = false,
}: CanvasRevealEffectProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const colorsArr = useMemo(() => {
    if (colors.length === 2) {
      return [colors[0], colors[0], colors[0], colors[1], colors[1], colors[1]];
    }
    if (colors.length === 3) {
      return [colors[0], colors[0], colors[1], colors[1], colors[2], colors[2]];
    }
    return [colors[0], colors[0], colors[0], colors[0], colors[0], colors[0]];
  }, [colors]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      u_time: { value: 0 },
      u_resolution: { value: new THREE.Vector2(2, 2) },
      u_colors: {
        value: colorsArr.map((c) => new THREE.Vector3(c[0] / 255, c[1] / 255, c[2] / 255)),
      },
      u_opacities: { value: opacities },
      u_total_size: { value: 20 },
      u_dot_size: { value: dotSize },
      u_reverse: { value: reverse ? 1 : 0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT_SHADER,
      fragmentShader: FRAG_SHADER,
      uniforms,
      glslVersion: THREE.GLSL3,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    function resize() {
      if (!mount) return;
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      uniforms.u_resolution.value.set(w * 2, h * 2);
    }
    resize();
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block;';

    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const start = performance.now();
    let raf = 0;
    const tick = () => {
      uniforms.u_time.value =
        ((performance.now() - start + startTimeOffsetMs) / 1000) * (animationSpeed * 0.1);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [animationSpeed, startTimeOffsetMs, dotSize, reverse, colorsArr, opacities]);

  return (
    <div ref={mountRef} className={`h-full relative w-full ${containerClassName}`}>
      {showGradient && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      )}
    </div>
  );
}
