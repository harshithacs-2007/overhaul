"use client";

import { useEffect, useRef } from "react";
import type { Material, Mesh, Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { TwinModel } from "@/lib/engineering/twinModel";

type Scope = "building" | "facility" | "equipment";
type Props = { scope: Scope; mode: "observed" | "retrofit"; model: TwinModel | null; widthM: number | null; depthM: number | null; heightM: number | null; capacityKW: number | null; loadKW: number | null; powerKW: number | null; currentLoadKW: number | null; proposedLoadKW: number | null; currentPowerKW: number | null; proposedPowerKW: number | null; currentUtilization: number | null; proposedUtilization: number | null; savingPercent: number | null; title: string };

export default function Twin3DCanvas({ model, mode, title }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    let frame = 0;
    let dispose: (() => void) | undefined;
    const mount = async () => {
      const THREE = await import("three");
      if (dead || !hostRef.current) return;
      const host = hostRef.current;
      host.replaceChildren();
      const fail = (message: string) => {
        host.replaceChildren();
        const box = document.createElement("div");
        box.className = "grid h-full min-h-[600px] place-items-center border border-amber-200/15 bg-[#050808] p-8 text-center font-mono text-[9px] uppercase tracking-[.1em] text-amber-200";
        box.textContent = message;
        host.appendChild(box);
      };
      if (!model) { fail("3D twin blocked · no verified geometry evidence"); return; }
      let scene: Scene, camera: PerspectiveCamera, renderer: WebGLRenderer;
      try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050808);
        scene.fog = new THREE.Fog(0x050808, 30, 80);
        camera = new THREE.PerspectiveCamera(42, 1, 0.01, 500);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      } catch { fail("Interactive 3D is unavailable in this browser"); return; }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      host.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xd7fff8, 0x0a1111, 1.8));
      const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(12, 18, 10); key.castShadow = true; scene.add(key);
      const rim = new THREE.PointLight(0x24dfca, 10, 60); rim.position.set(-10, 8, -12); scene.add(rim);
      scene.add(new THREE.GridHelper(Math.max(model.overall.widthM, model.overall.depthM) * 3, 60, 0x164b46, 0x0b2523));

      const root = new THREE.Group();
      scene.add(root);
      const materials = {
        wall: new THREE.MeshStandardMaterial({ color: 0x164b46, metalness: 0.55, roughness: 0.38, transparent: true, opacity: 0.86 }),
        floor: new THREE.MeshStandardMaterial({ color: 0x103a36, metalness: 0.28, roughness: 0.7, transparent: true, opacity: 0.5 }),
        asset: new THREE.MeshStandardMaterial({ color: 0xe4b860, metalness: 0.55, roughness: 0.3 }),
        inferred: new THREE.MeshStandardMaterial({ color: 0x5d7773, metalness: 0.2, roughness: 0.8, transparent: true, opacity: 0.28 }),
        wire: new THREE.MeshBasicMaterial({ color: 0x2ce0ca, wireframe: true, transparent: true, opacity: 0.35 }),
        opening: new THREE.MeshBasicMaterial({ color: 0xe4b860 }),
      } as const;
      const box = (w: number, h: number, d: number, material: Material, x: number, y: number, z: number) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y + h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
        return mesh;
      };

      for (const room of model.rooms) {
        box(room.widthM, 0.03, room.depthM, materials.floor, room.x + room.widthM / 2, 0, room.y + room.depthM / 2);
        const roof = box(room.widthM, 0.015, room.depthM, materials.wire, room.x + room.widthM / 2, room.heightM, room.y + room.depthM / 2);
        roof.userData.type = "room-roof";
      }
      for (const wall of model.walls) {
        const dx = wall.b.x - wall.a.x;
        const dz = wall.b.y - wall.a.y;
        const length = Math.hypot(dx, dz);
        if (!(length > 0)) continue;
        const mesh = box(length, wall.heightM, wall.thicknessM, wall.source === "inferred" ? materials.inferred : materials.wall, (wall.a.x + wall.b.x) / 2, 0, (wall.a.y + wall.b.y) / 2);
        mesh.rotation.y = Math.atan2(dz, dx);
      }
      for (const opening of model.openings) {
        const marker = new THREE.Mesh(new THREE.BoxGeometry(opening.widthM, 0.06, Math.max(model.overall.widthM, model.overall.depthM) * 0.012), materials.opening);
        marker.position.set(opening.x, 0.03, opening.y);
        root.add(marker);
      }
      for (const asset of model.assets) {
        const group = new THREE.Group();
        group.position.set(asset.x, 0, asset.y);
        group.rotation.y = THREE.MathUtils.degToRad(asset.rotationDeg);
        root.add(group);
        const body = new THREE.Mesh(new THREE.BoxGeometry(asset.widthM, asset.heightM, asset.depthM), asset.source === "inferred" ? materials.inferred : materials.asset);
        body.position.y = asset.heightM / 2;
        body.castShadow = true;
        body.userData.label = asset.label;
        group.add(body);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(asset.widthM * 1.03, asset.heightM * 1.03, asset.depthM * 1.03), materials.wire);
        frame.position.y = asset.heightM / 2;
        group.add(frame);
      }

      const observedShell = new THREE.Group();
      const retrofitShell = new THREE.Group();
      if (mode === "retrofit") {
        const shell = box(model.overall.widthM, Math.max(model.overall.heightM, 0.05), model.overall.depthM, materials.wire, 0, 0.02, 0);
        retrofitShell.add(shell);
        root.remove(shell);
        scene.add(retrofitShell);
      }
      scene.add(observedShell);

      const maxDim = Math.max(model.overall.widthM, model.overall.depthM, model.overall.heightM);
      const target: Vector3 = new THREE.Vector3(model.overall.widthM / 2, model.overall.heightM * 0.42, model.overall.depthM / 2);
      let yaw = 0.72, pitch = 1.0, radius = Math.max(maxDim * 1.9, 3), dragging = false, lastX = 0, lastY = 0;
      const updateCamera = () => {
        const x = target.x + Math.sin(pitch) * Math.cos(yaw) * radius;
        const z = target.z + Math.sin(pitch) * Math.sin(yaw) * radius;
        const y = target.y + Math.cos(pitch) * radius;
        camera.position.set(x, y, z); camera.lookAt(target);
      };
      updateCamera();
      const down = (event: PointerEvent) => { dragging = true; lastX = event.clientX; lastY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); };
      const move = (event: PointerEvent) => { if (!dragging) return; yaw -= (event.clientX - lastX) * 0.008; pitch = Math.max(0.35, Math.min(1.42, pitch + (event.clientY - lastY) * 0.005)); lastX = event.clientX; lastY = event.clientY; updateCamera(); };
      const up = () => { dragging = false; };
      const wheel = (event: WheelEvent) => { event.preventDefault(); radius = Math.max(Math.max(maxDim * 0.8, 1), Math.min(500, radius + event.deltaY * 0.015)); updateCamera(); };
      renderer.domElement.addEventListener("pointerdown", down);
      renderer.domElement.addEventListener("pointermove", move);
      renderer.domElement.addEventListener("pointerup", up);
      renderer.domElement.addEventListener("pointercancel", up);
      renderer.domElement.addEventListener("wheel", wheel, { passive: false });
      const resize = () => { const rect = host.getBoundingClientRect(); renderer.setSize(Math.max(rect.width, 1), Math.max(rect.height, 1), false); camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1); camera.updateProjectionMatrix(); };
      const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize();
      const clock = new THREE.Clock();
      const animate = () => { if (dead) return; const t = clock.getElapsedTime(); retrofitShell.visible = mode === "retrofit"; retrofitShell.rotation.y = Math.sin(t * 0.15) * 0.01; renderer.render(scene, camera); frame = requestAnimationFrame(animate); };
      animate();
      const badge = document.createElement("div");
      badge.className = "pointer-events-none absolute left-4 bottom-4 border border-steel/15 bg-black/70 px-3 py-2 font-mono text-[7px] uppercase tracking-[.1em] text-steel backdrop-blur";
      badge.textContent = model.units === "m" ? `${title} · verified metric · ${model.geometryBasis}` : `${title} · relative scene · ${model.geometryBasis}`;
      host.appendChild(badge);
      dispose = () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("pointerup", up); renderer.domElement.removeEventListener("pointercancel", up); renderer.domElement.removeEventListener("wheel", wheel); scene.traverse((child: Object3D) => { const mesh = child as Mesh; mesh.geometry?.dispose?.(); const material = mesh.material as Material | Material[] | undefined; if (Array.isArray(material)) material.forEach((item) => item.dispose()); else material?.dispose?.(); }); renderer.dispose(); host.replaceChildren(); };
    };
    void mount();
    return () => { dead = true; dispose?.(); };
  }, [model, mode, title]);

  return <div ref={hostRef} className="relative h-full min-h-[600px] w-full touch-none" aria-label={`${title} actual generated 3D twin`} />;
}
