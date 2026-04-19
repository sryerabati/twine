"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  deriveBrainRegionActivations,
  type BrainRegionActivation,
  type BrainRegionId,
} from "@/lib/brain-regions";
import type { BrainResponsePoint } from "@/lib/contracts";
import { cn } from "@/lib/utils";

type Brain3DViewportProps = {
  point: BrainResponsePoint | null;
  mode?: "panel" | "hero";
  className?: string;
};

const BRAIN_MODEL_PATH = "/models/brain.glb";
const DARK_GREEN = "#0f2215";
const PRIMARY_GREEN = "#35b85f";
const ACCENT_GREEN = "#86d89e";
const SOFT_GREEN = "#e5ffed";

const REGION_VISUALS: Record<
  BrainRegionId,
  {
    color: string;
    position: [number, number, number];
    rotation: [number, number, number];
    fallback: {
      top: number;
      left: number;
      right: number;
      labelTop: number;
      labelLeft: number;
    };
  }
> = {
  frontal: {
    color: PRIMARY_GREEN,
    position: [-0.92, 0.72, 0.74],
    rotation: [0.14, 0.42, -0.08],
    fallback: { top: 24, left: 22, right: 22, labelTop: 13, labelLeft: 21 },
  },
  parietal: {
    color: PRIMARY_GREEN,
    position: [-0.88, 1.02, -0.04],
    rotation: [-0.08, 0.38, 0.04],
    fallback: { top: 34, left: 28, right: 28, labelTop: 24, labelLeft: 46 },
  },
  temporal: {
    color: PRIMARY_GREEN,
    position: [-1.08, -0.2, 0.14],
    rotation: [0.02, 0.2, -0.16],
    fallback: { top: 54, left: 17, right: 17, labelTop: 46, labelLeft: 23 },
  },
  occipital: {
    color: ACCENT_GREEN,
    position: [-0.78, 0.44, -0.86],
    rotation: [0.08, -0.1, 0.12],
    fallback: { top: 42, left: 36, right: 36, labelTop: 34, labelLeft: 71 },
  },
};
const FALLBACK_DOTS = buildFallbackDots();

export function Brain3DViewport({
  point,
  mode = "panel",
  className,
}: Brain3DViewportProps) {
  const [supportsWebGl, setSupportsWebGl] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSupportsWebGl(checkWebGlSupport());
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      data-testid="brain-viewport"
      className={cn(
        "relative aspect-[7/5] w-full",
        mode === "panel"
          ? "overflow-hidden rounded-[1.7rem] border border-border/35 bg-[radial-gradient(circle_at_top,rgba(53,184,95,0.08),transparent_48%)]"
          : "overflow-visible rounded-none bg-transparent",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0",
          mode === "hero"
            ? "bg-[radial-gradient(circle_at_center,rgba(53,184,95,0.12),transparent_58%)]"
            : "bg-[radial-gradient(circle_at_center,rgba(53,184,95,0.08),transparent_42%)]",
        )}
      />
      {supportsWebGl ? (
        <Canvas
          className="h-full w-full"
          camera={{ fov: mode === "hero" ? 27 : 30, position: [0, 0.16, 8.9] }}
          dpr={[1, 1.75]}
          gl={{ alpha: true, antialias: true }}
        >
          <ambientLight intensity={0.35} color="#dffff1" />
          <Suspense fallback={null}>
            <BrainScene point={point} hero={mode === "hero"} />
          </Suspense>
        </Canvas>
      ) : (
        <BrainViewportFallback point={point} mode={mode} />
      )}
    </div>
  );
}

function BrainScene({
  point,
  hero,
}: {
  point: BrainResponsePoint | null;
  hero: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const model = useLoader(GLTFLoader, BRAIN_MODEL_PATH);
  const regions = deriveBrainRegionActivations(point?.hemisphereHeatmap);
  const sampledPoints = useMemo(() => {
    const sourceMesh = findFirstMesh(model.scene);

    if (!sourceMesh) {
      return null;
    }

    const geometry = sourceMesh.geometry.clone();
    geometry.center();
    geometry.computeBoundingBox();

    const size = geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    const scale = 4.85 / maxDimension;

    geometry.scale(scale, scale, scale);
    geometry.translate(0, 0.18, 0);
    const surface = geometry.index ? geometry.toNonIndexed() : geometry;
    const positionAttribute = surface.getAttribute("position");
    const targetCount = Math.min(hero ? 7200 : 5600, positionAttribute.count);
    const stride = Math.max(1, Math.floor(positionAttribute.count / targetCount));
    const sampledCount = Math.ceil(positionAttribute.count / stride);
    const positions = new Float32Array(sampledCount * 3);
    let writeIndex = 0;

    for (let index = 0; index < positionAttribute.count; index += stride) {
      const jitterX = (randomFromIndex(index * 11 + 1) - 0.5) * 0.016;
      const jitterY = (randomFromIndex(index * 13 + 2) - 0.5) * 0.016;
      const jitterZ = (randomFromIndex(index * 17 + 3) - 0.5) * 0.016;

      positions[writeIndex * 3] = positionAttribute.getX(index) + jitterX;
      positions[writeIndex * 3 + 1] = positionAttribute.getY(index) + jitterY;
      positions[writeIndex * 3 + 2] = positionAttribute.getZ(index) + jitterZ;
      writeIndex += 1;
    }

    if (surface !== geometry) {
      geometry.dispose();
      surface.dispose();
    } else {
      surface.dispose();
    }

    return positions;
  }, [hero, model.scene]);
  const pointCloudGeometry = useMemo(() => {
    if (!sampledPoints) {
      return null;
    }

    const globalActivation = clamp01(point?.globalActivation ?? 0.24);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(sampledPoints, 3));
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(buildPointCloudColors(sampledPoints, regions, globalActivation), 3),
    );

    return geometry;
  }, [point?.globalActivation, regions, sampledPoints]);

  useEffect(() => {
    return () => {
      pointCloudGeometry?.dispose();
    };
  }, [pointCloudGeometry]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const group = groupRef.current;

    if (!group) {
      return;
    }

    group.rotation.x = 0.18 + Math.sin(t * 0.22) * 0.05;
    group.rotation.y = -0.4 + Math.sin(t * 0.3) * (hero ? 0.32 : 0.24);
    group.rotation.z = Math.sin(t * 0.14) * 0.04;
    group.position.y = Math.sin(t * 0.36) * 0.06;
  });

  if (!pointCloudGeometry) {
    return null;
  }

  return (
    <group ref={groupRef} scale={hero ? 0.9 : 0.96} position={[0, hero ? -0.12 : -0.04, 0]}>
      <points geometry={pointCloudGeometry}>
        <pointsMaterial
          size={hero ? 0.066 : 0.058}
          sizeAttenuation
          transparent
          opacity={hero ? 0.92 : 0.84}
          depthWrite={false}
          vertexColors
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

function BrainViewportFallback({
  point,
  mode,
}: {
  point: BrainResponsePoint | null;
  mode: "hero" | "panel";
}) {
  const regions = deriveBrainRegionActivations(point?.hemisphereHeatmap);

  return (
    <div className="relative h-full w-full">
      {FALLBACK_DOTS.map((dot, index) => {
        const dotVisual = getFallbackDotVisual(dot, regions, point?.globalActivation ?? 0.24);

        return (
          <span
            key={`${index}-${dot.left}-${dot.top}`}
            data-testid="brain-dot"
            className="absolute block rounded-full"
            style={{
              top: formatMeasure(dot.top, "%", 3),
              left: formatMeasure(dot.left, "%", 3),
              width: formatMeasure(dot.size, "px", 2),
              height: formatMeasure(dot.size, "px", 2),
              transform: `translate(-50%, -50%) scale(${mode === "hero" ? 1 : 0.9})`,
              backgroundColor: dotVisual.color,
              opacity: roundToPrecision(dotVisual.opacity, 3),
              boxShadow: `0 0 ${formatMeasure(dotVisual.glow, "px", 2)} ${toRgba(dotVisual.color, mode === "hero" ? 0.18 : 0.12)}`,
            }}
          />
        );
      })}
      {regions.map((region) => (
        <FallbackRegionRow key={region.id} region={region} />
      ))}
    </div>
  );
}

function FallbackRegionRow({ region }: { region: BrainRegionActivation }) {
  const visual = REGION_VISUALS[region.id];

  return (
    <span
      className="absolute z-10 -translate-x-1/2 rounded-full border border-primary/25 bg-background/20 px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-primary/85 backdrop-blur-[2px]"
      style={{ top: `${visual.fallback.labelTop}%`, left: `${visual.fallback.labelLeft}%` }}
    >
      {region.label}
    </span>
  );
}

function findFirstMesh(root: THREE.Object3D): THREE.Mesh<THREE.BufferGeometry> | null {
  let match: THREE.Mesh<THREE.BufferGeometry> | null = null;

  root.traverse((child) => {
    if (
      match ||
      !(child instanceof THREE.Mesh) ||
      !(child.geometry instanceof THREE.BufferGeometry)
    ) {
      return;
    }

    match = child;
  });

  return match;
}

function checkWebGlSupport() {
  if (typeof window === "undefined") {
    return false;
  }

  if (/jsdom/i.test(window.navigator.userAgent)) {
    return false;
  }

  const canvas = document.createElement("canvas");

  if (typeof canvas.getContext !== "function") {
    return false;
  }

  return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function buildPointCloudColors(
  positions: Float32Array,
  regions: BrainRegionActivation[],
  globalActivation: number,
) {
  const colors = new Float32Array(positions.length);

  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index];
    const y = positions[index + 1];
    const z = positions[index + 2];
    const regionInfluence = get3dRegionInfluence(x, y, z, regions);
    const shimmer = (randomFromIndex(index * 19) - 0.5) * 0.04;
    const color = resolveActivationColor(
      clamp01(globalActivation * 0.14 + regionInfluence * 1.12 + shimmer),
    );

    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
  }

  return colors;
}

function get3dRegionInfluence(
  x: number,
  y: number,
  z: number,
  regions: BrainRegionActivation[],
) {
  let influence = 0;

  for (const region of regions) {
    const visual = REGION_VISUALS[region.id];
    influence = Math.max(
      influence,
      getWeightedDistance3d([x, y, z], visual.position) * region.left,
      getWeightedDistance3d([x, y, z], [-visual.position[0], visual.position[1], visual.position[2]]) *
        region.right,
    );
  }

  return clamp01(influence);
}

function getWeightedDistance3d(
  source: [number, number, number],
  target: [number, number, number],
) {
  const dx = (source[0] - target[0]) / 0.95;
  const dy = (source[1] - target[1]) / 0.78;
  const dz = (source[2] - target[2]) / 0.9;

  return Math.exp(-(dx * dx + dy * dy + dz * dz) * 1.7);
}

function buildFallbackDots() {
  const dots: Array<{ left: number; top: number; size: number }> = [];

  for (let row = 0; row < 30; row += 1) {
    for (let column = 0; column < 46; column += 1) {
      const normalizedX = column / 45 * 2 - 1;
      const normalizedY = row / 29 * 2 - 1;
      const lobeX = Math.abs(normalizedX) - 0.08;
      const outerCurve =
        Math.pow(Math.abs(lobeX) / 0.88, 2.25) + Math.pow(Math.abs((normalizedY + 0.08) / 0.92), 2.1);
      const lowerNotch = normalizedY > 0.68 && Math.abs(normalizedX) < 0.12;
      const lowerTrim = normalizedY > 0.6 && Math.abs(normalizedX) > 0.78;

      if (outerCurve > 1 || lowerNotch || lowerTrim) {
        continue;
      }

      const jitterX = (randomFromIndex(row * 43 + column * 11) - 0.5) * 0.026;
      const jitterY = (randomFromIndex(row * 67 + column * 17) - 0.5) * 0.026;
      const size = 1.7 + randomFromIndex(row * 79 + column * 23) * 1.25;

      dots.push({
        left: 50 + (normalizedX + jitterX) * 30,
        top: 50 + (normalizedY + jitterY) * 31,
        size,
      });
    }
  }

  return dots;
}

function getFallbackDotVisual(
  dot: { left: number; top: number; size: number },
  regions: BrainRegionActivation[],
  globalActivation: number,
) {
  const influence = get2dRegionInfluence(dot.left, dot.top, regions);
  const activationLevel = clamp01(globalActivation * 0.14 + influence * 1.12);
  const color = resolveActivationColor(activationLevel);

  return {
    color: `#${color.getHexString()}`,
    glow: 5 + activationLevel * 17,
    opacity: 0.28 + activationLevel * 0.7,
  };
}

function get2dRegionInfluence(left: number, top: number, regions: BrainRegionActivation[]) {
  let influence = 0;

  for (const region of regions) {
    const visual = REGION_VISUALS[region.id].fallback;
    influence = Math.max(
      influence,
      getWeightedDistance2d(left, top, visual.left, visual.top) * region.left,
      getWeightedDistance2d(left, top, 100 - visual.right, visual.top) * region.right,
    );
  }

  return clamp01(influence);
}

function getWeightedDistance2d(
  left: number,
  top: number,
  targetLeft: number,
  targetTop: number,
) {
  const dx = (left - targetLeft) / 16;
  const dy = (top - targetTop) / 12;

  return Math.exp(-(dx * dx + dy * dy) * 1.35);
}

function randomFromIndex(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;

  return value - Math.floor(value);
}

function resolveActivationColor(activationLevel: number) {
  const darkColor = new THREE.Color(DARK_GREEN);
  const activeColor = new THREE.Color(PRIMARY_GREEN);
  const accentColor = new THREE.Color(ACCENT_GREEN);
  const softColor = new THREE.Color(SOFT_GREEN);
  const primaryMix = Math.pow(clamp01(activationLevel), 0.74);
  const color = darkColor.clone().lerp(activeColor, primaryMix);

  if (activationLevel > 0.38) {
    color.lerp(accentColor, ((activationLevel - 0.38) / 0.62) * 0.78);
  }

  if (activationLevel > 0.72) {
    color.lerp(softColor, ((activationLevel - 0.72) / 0.28) * 0.55);
  }

  return color;
}

function formatMeasure(value: number, unit: "%" | "px", precision: number) {
  return `${value.toFixed(precision)}${unit}`;
}

function roundToPrecision(value: number, precision: number) {
  return Number(value.toFixed(precision));
}

function toRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : normalized;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
