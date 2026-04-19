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
    };
  }
> = {
  frontal: {
    color: "#86d89e",
    position: [-0.92, 0.72, 0.74],
    rotation: [0.14, 0.42, -0.08],
    fallback: { top: 24, left: 24, right: 24, labelTop: 15 },
  },
  parietal: {
    color: "#35b85f",
    position: [-0.88, 1.02, -0.04],
    rotation: [-0.08, 0.38, 0.04],
    fallback: { top: 35, left: 30, right: 30, labelTop: 26 },
  },
  temporal: {
    color: "#f0a35b",
    position: [-1.08, -0.2, 0.14],
    rotation: [0.02, 0.2, -0.16],
    fallback: { top: 56, left: 17, right: 17, labelTop: 47 },
  },
  occipital: {
    color: "#6bd6ff",
    position: [-0.78, 0.44, -0.86],
    rotation: [0.08, -0.1, 0.12],
    fallback: { top: 42, left: 37, right: 37, labelTop: 33 },
  },
};

export function Brain3DViewport({
  point,
  mode = "panel",
  className,
}: Brain3DViewportProps) {
  const [supportsWebGl, setSupportsWebGl] = useState(false);

  useEffect(() => {
    setSupportsWebGl(checkWebGlSupport());
  }, []);

  return (
    <div
      data-testid="brain-viewport"
      className={cn(
        "relative aspect-[7/5] w-full overflow-hidden rounded-[1.7rem]",
        mode === "panel"
          ? "border border-border/55 bg-[radial-gradient(circle_at_top,rgba(53,184,95,0.12),transparent_44%),linear-gradient(180deg,rgba(8,14,10,0.92),rgba(7,9,8,0.98))]"
          : "bg-transparent",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(134,216,158,0.12),transparent_42%)]" />
      <div className="absolute inset-x-[18%] bottom-8 h-16 rounded-full bg-black/45 blur-2xl" />
      {supportsWebGl ? (
        <Canvas
          className="h-full w-full"
          camera={{ fov: mode === "hero" ? 28 : 30, position: [0, 0.2, 8.4] }}
          dpr={[1, 1.75]}
          gl={{ alpha: true, antialias: true }}
        >
          <color attach="background" args={["#000000"]} />
          <fog attach="fog" args={["#020302", 10, 18]} />
          <ambientLight intensity={1.1} color="#f3fff5" />
          <directionalLight position={[5, 6, 7]} intensity={1.6} color="#e6ffee" />
          <pointLight position={[-4, 2, 4]} intensity={0.85} color="#86d89e" />
          <pointLight position={[4, -2, 3]} intensity={0.72} color="#35b85f" />
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
  const brainStemGeometry = useMemo(() => new THREE.CapsuleGeometry(0.16, 0.76, 6, 16), []);
  const regions = deriveBrainRegionActivations(point?.hemisphereHeatmap);
  const brainGeometry = useMemo(() => {
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
    geometry.computeVertexNormals();

    return geometry;
  }, [model.scene]);

  useEffect(() => {
    return () => {
      brainGeometry?.dispose();
      brainStemGeometry.dispose();
    };
  }, [brainGeometry, brainStemGeometry]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const group = groupRef.current;

    if (!group) {
      return;
    }

    group.rotation.x = 0.18 + Math.sin(t * 0.22) * 0.05;
    group.rotation.y = -0.4 + Math.sin(t * 0.3) * (hero ? 0.46 : 0.32);
    group.rotation.z = Math.sin(t * 0.14) * 0.04;
    group.position.y = Math.sin(t * 0.36) * 0.08;
  });

  if (!brainGeometry) {
    return null;
  }

  const globalActivation = clamp01(point?.globalActivation ?? 0.18);

  return (
    <group ref={groupRef} scale={hero ? 1.16 : 1} position={[0, hero ? -0.24 : -0.08, 0]}>
      <mesh position={[0, -2.15, -0.7]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.55, 48]} />
        <meshBasicMaterial color="#000000" opacity={0.35} transparent />
      </mesh>

      <mesh geometry={brainGeometry}>
        <meshPhysicalMaterial
          color="#1b241f"
          roughness={0.82}
          metalness={0.08}
          clearcoat={0.18}
          emissive="#102516"
          emissiveIntensity={0.14 + globalActivation * 0.28}
        />
      </mesh>

      <mesh geometry={brainGeometry} scale={[1.015, 1.015, 1.015]}>
        <meshPhysicalMaterial
          color="#e7fff1"
          transparent
          opacity={0.04 + globalActivation * 0.04}
          roughness={0.3}
          metalness={0.03}
          clearcoat={0.36}
        />
      </mesh>

      <mesh position={[0, -1.9, -0.18]} rotation={[0.38, 0, 0]} geometry={brainStemGeometry}>
        <meshStandardMaterial color="#162018" roughness={0.92} metalness={0.02} />
      </mesh>

      {regions.map((region) => (
        <RegionPair key={region.id} region={region} hero={hero} />
      ))}
    </group>
  );
}

function RegionPair({
  region,
  hero,
}: {
  region: BrainRegionActivation;
  hero: boolean;
}) {
  const visual = REGION_VISUALS[region.id];

  return (
    <>
      <ActivationRegion
        position={visual.position}
        rotation={visual.rotation}
        intensity={region.left}
        color={visual.color}
        hero={hero}
      />
      <ActivationRegion
        position={[-visual.position[0], visual.position[1], visual.position[2]]}
        rotation={[visual.rotation[0], -visual.rotation[1], -visual.rotation[2]]}
        intensity={region.right}
        color={visual.color}
        hero={hero}
      />
    </>
  );
}

function ActivationRegion({
  position,
  rotation,
  intensity,
  color,
  hero,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
  intensity: number;
  color: string;
  hero: boolean;
}) {
  const scaleBoost = hero ? 1.08 : 1;
  const pulse = 0.18 + intensity * 1.1;

  return (
    <group position={position} rotation={rotation}>
      <mesh
        scale={[
          (0.28 + intensity * 0.28) * scaleBoost,
          (0.18 + intensity * 0.1) * scaleBoost,
          (0.22 + intensity * 0.18) * scaleBoost,
        ]}
      >
        <sphereGeometry args={[1, 28, 28]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.16 + intensity * 1.65}
          transparent
          opacity={0.12 + intensity * 0.62}
          roughness={0.34}
          metalness={0.04}
        />
      </mesh>
      <mesh scale={[0.14 + intensity * 0.09, 0.14 + intensity * 0.09, 0.14 + intensity * 0.09]}>
        <sphereGeometry args={[1, 20, 20]} />
        <meshStandardMaterial
          color="#f7fff9"
          emissive={color}
          emissiveIntensity={0.28 + intensity * 2.1}
          transparent
          opacity={0.18 + intensity * 0.34}
        />
      </mesh>
      <pointLight color={color} intensity={pulse} distance={1.15 + intensity * 0.8} />
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
      <div
        className={cn(
          "absolute inset-x-[12%] inset-y-[14%] rounded-[48%] border border-primary/35 bg-card/35",
          mode === "hero" ? "shadow-[0_24px_80px_rgba(0,0,0,0.45)]" : "",
        )}
      />
      <div className="absolute inset-y-[18%] left-[19%] w-[28%] rounded-[50%] border border-primary/45 bg-card/45" />
      <div className="absolute inset-y-[18%] right-[19%] w-[28%] rounded-[50%] border border-accent/55 bg-card/45" />
      <div className="absolute left-1/2 top-[18%] bottom-[18%] w-px -translate-x-1/2 border-l border-dashed border-border/75" />
      {regions.map((region) => (
        <FallbackRegionRow key={region.id} region={region} />
      ))}
    </div>
  );
}

function FallbackRegionRow({ region }: { region: BrainRegionActivation }) {
  const visual = REGION_VISUALS[region.id];

  return (
    <>
      <span
        className="absolute left-1/2 z-10 -translate-x-1/2 rounded-full border border-border/70 bg-card/90 px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-foreground"
        style={{ top: `${visual.fallback.labelTop}%` }}
      >
        {region.label}
      </span>
      <FallbackRegionGlow
        anchor="left"
        color={visual.color}
        intensity={region.left}
        offset={visual.fallback.left}
        top={visual.fallback.top}
      />
      <FallbackRegionGlow
        anchor="right"
        color={visual.color}
        intensity={region.right}
        offset={visual.fallback.right}
        top={visual.fallback.top}
      />
    </>
  );
}

function FallbackRegionGlow({
  anchor,
  color,
  intensity,
  offset,
  top,
}: {
  anchor: "left" | "right";
  color: string;
  intensity: number;
  offset: number;
  top: number;
}) {
  const size = 16 + intensity * 30;
  const shadow = `0 0 ${10 + intensity * 18}px ${toRgba(color, 0.55)}`;

  return (
    <span
      className="absolute block rounded-full blur-[2px]"
      style={{
        top: `${top}%`,
        [anchor]: `${offset}%`,
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        opacity: 0.2 + intensity * 0.72,
        boxShadow: shadow,
      }}
    />
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
