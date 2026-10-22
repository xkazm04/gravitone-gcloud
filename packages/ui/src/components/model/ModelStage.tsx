"use client";

// THE 3D STAGE - the only module in @gt/ui that imports three. ./ModelViewer.tsx lazy-imports it
// (its default export) after mount, so the bundler splits three, @react-three/fiber, the glTF
// loader and the orbit controls into a chunk only a model's detail or zoom fetches.
//
// The glb is loaded with three's GLTFLoader outside the render tree, so a failure is the loader's
// own sentence, handed up verbatim (`onLoad({kind: "failed"})`) rather than thrown into a boundary.
// The camera frames the model's bounding sphere from a three-quarter view; the operator orbits
// (drag), zooms (wheel) and pans (right-drag) with three's OrbitControls. The frame loop is on
// demand: a still model draws nothing until it is moved.

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box3, Mesh, PerspectiveCamera, SkeletonHelper, Sphere, Vector3, type LineBasicMaterial, type Material, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { inkOf, type ModelLoad, type StageInk } from "./model.ts";
import s from "./ModelViewer.module.css";

export type ModelStageProps = {
  readonly src: string;
  readonly wireframe: boolean;
  readonly bones: boolean;
  readonly onLoad: (l: ModelLoad) => void;
  readonly label: string;
};

/** Triangles and bones of a loaded scene: what the file draws, counted from its geometry. */
export function countScene(root: Object3D): { readonly tris: number; readonly bones: number } {
  let tris = 0;
  const bones = new Set<string>();
  root.traverse((o) => {
    if (o instanceof Mesh) {
      const g = o.geometry;
      const n = g.index !== null ? g.index.count : (g.getAttribute("position")?.count ?? 0);
      tris += Math.floor(n / 3);
    }
    if ((o as { isBone?: boolean }).isBone === true) bones.add(o.uuid);
  });
  return { tris, bones: bones.size };
}

const materials = (root: Object3D): Material[] => {
  const out: Material[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) out.push(...(Array.isArray(o.material) ? o.material : [o.material]));
  });
  return out;
};

function Controls({ target, radius }: { readonly target: Vector3; readonly radius: number }) {
  // The live store, read inside the effect: the camera is three's object to move, not React state.
  const get = useThree((st) => st.get);
  // Framed again when the canvas changes shape: a lens laid out after the stage mounted starts at 0 x 0.
  const { width, height } = useThree((st) => st.size);
  useEffect(() => {
    const { camera, gl, invalidate } = get();
    // Far enough that the bounding sphere fits the NARROWER of the two fields of view: a tall
    // lens (the Board's zoom on a phone) is limited by its width, a wide pane by its height.
    const v = camera instanceof PerspectiveCamera ? (camera.fov * Math.PI) / 360 : Math.PI / 8;
    const wide = camera instanceof PerspectiveCamera ? Math.atan(Math.tan(v) * (height > 0 ? width / height : 1)) : v;
    const h = Number.isFinite(wide) && wide > 0 ? wide : v;
    const dir = new Vector3(0.9, 0.55, 1.3).normalize();
    camera.position.copy(target).addScaledVector(dir, (radius / Math.sin(Math.min(v, h))) * 1.08);
    camera.near = radius / 100;
    camera.far = radius * 100;
    camera.updateProjectionMatrix();
    const c = new OrbitControls(camera, gl.domElement);
    c.target.copy(target);
    c.update();
    const redraw = (): void => invalidate();
    c.addEventListener("change", redraw);
    invalidate();
    return () => {
      c.removeEventListener("change", redraw);
      c.dispose();
    };
  }, [get, target, radius, width, height]);
  return null;
}

function Scene({ root, wireframe, bones, ink }: { readonly root: Object3D; readonly wireframe: boolean; readonly bones: boolean; readonly ink: StageInk }) {
  const { invalidate } = useThree();
  const frame = useMemo(() => {
    const sphere = new Box3().setFromObject(root).getBoundingSphere(new Sphere());
    return { target: sphere.center.clone(), radius: Math.max(sphere.radius, 0.01) };
  }, [root]);
  const helper = useMemo(() => {
    const h = new SkeletonHelper(root);
    const m = h.material as LineBasicMaterial;
    m.depthTest = false;
    if (ink.bone !== "") {
      m.vertexColors = false;
      m.color.set(ink.bone);
    }
    return h;
  }, [root, ink.bone]);
  useEffect(() => {
    for (const m of materials(root)) {
      (m as Material & { wireframe?: boolean }).wireframe = wireframe;
      m.needsUpdate = true;
    }
    invalidate();
  }, [root, wireframe, invalidate]);
  useEffect(() => invalidate(), [bones, invalidate]);
  // An unread token leaves three's own default (white light) rather than a colour typed here.
  const light = ink.light === "" ? undefined : ink.light;
  return (
    <>
      <hemisphereLight args={[light, ink.ground === "" ? undefined : ink.ground, 1.1]} />
      <directionalLight position={[3, 5, 4]} intensity={1.3} {...(light === undefined ? {} : { color: light })} />
      <primitive object={root} />
      {bones && helper.bones.length > 0 && <primitive object={helper} />}
      <Controls target={frame.target} radius={frame.radius} />
    </>
  );
}

/** One stage per glb: the viewer keys it by `src`, so a new model is a fresh stage, never a stale scene. */
export default function ModelStage({ src, wireframe, bones, onLoad, label }: ModelStageProps) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [scene, setScene] = useState<{ readonly root: Object3D; readonly ink: StageInk } | null>(null);
  useEffect(() => {
    let live = true;
    new GLTFLoader().load(
      src,
      (gltf) => {
        if (!live) return;
        setScene({ root: gltf.scene, ink: wrap.current === null ? { bone: "", light: "", ground: "" } : inkOf(wrap.current) });
        onLoad({ kind: "ready", ...countScene(gltf.scene) });
      },
      undefined,
      (e) => {
        if (live) onLoad({ kind: "failed", message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [src, onLoad]);
  return (
    <div ref={wrap} className={s.canvas} role="img" aria-label={label}>
      {scene !== null && (
        <Canvas frameloop="demand" dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ fov: 35 }}>
          <Scene root={scene.root} wireframe={wireframe} bones={bones} ink={scene.ink} />
        </Canvas>
      )}
    </div>
  );
}
