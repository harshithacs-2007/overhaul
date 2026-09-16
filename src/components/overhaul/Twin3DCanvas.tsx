"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Material, Mesh, Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { TwinModel } from "@/lib/engineering/twinModel";

type Scope = "building" | "facility" | "equipment";
type Props = { scope: Scope; mode: "observed" | "retrofit"; model: TwinModel | null; widthM: number | null; depthM: number | null; heightM: number | null; capacityKW: number | null; loadKW: number | null; powerKW: number | null; currentLoadKW: number | null; proposedLoadKW: number | null; currentPowerKW: number | null; proposedPowerKW: number | null; currentUtilization: number | null; proposedUtilization: number | null; savingPercent: number | null; title: string };

export default function Twin3DCanvas({ model, title }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelSnapshot = useMemo(() => model, [model]);

  useEffect(() => {
    let dead = false;
    let frame = 0;
    let dispose: (() => void) | undefined;
    const mount = async () => {
      const THREE = await import("three");
      if (dead || !hostRef.current) return;
      const host = hostRef.current;
      host.replaceChildren();
      const fail = (message: string) => { host.replaceChildren(); const box = document.createElement("div"); box.className = "grid h-full min-h-[600px] place-items-center border border-amber-200/15 bg-[#050808] p-8 text-center font-mono text-[9px] uppercase tracking-[.1em] text-amber-200"; box.textContent = message; host.appendChild(box); };
      if (!modelSnapshot) { fail("3D twin blocked · no geometry evidence"); return; }
      const twin = modelSnapshot;
      let scene: Scene, camera: PerspectiveCamera, renderer: WebGLRenderer;
      try { scene = new THREE.Scene(); scene.background = new THREE.Color(0x050808); scene.fog = new THREE.Fog(0x050808, 30, 90); camera = new THREE.PerspectiveCamera(42, 1, 0.01, 500); renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" }); } catch { fail("Interactive 3D is unavailable in this browser"); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; host.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xd7fff8, 0x0a1111, 1.8)); const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(12, 18, 10); key.castShadow = true; scene.add(key); const rim = new THREE.PointLight(0x24dfca, 10, 60); rim.position.set(-10, 8, -12); scene.add(rim); scene.add(new THREE.GridHelper(Math.max(twin.overall.widthM, twin.overall.depthM) * 3, 60, 0x164b46, 0x0b2523));
      const root = new THREE.Group(); scene.add(root);
      const materials = { wall: new THREE.MeshStandardMaterial({ color: 0x164b46, metalness: .55, roughness: .38, transparent: true, opacity: .86 }), floor: new THREE.MeshStandardMaterial({ color: 0x103a36, metalness: .28, roughness: .7, transparent: true, opacity: .5 }), asset: new THREE.MeshStandardMaterial({ color: 0xe4b860, metalness: .55, roughness: .3 }), inferred: new THREE.MeshStandardMaterial({ color: 0x5d7773, metalness: .2, roughness: .8, transparent: true, opacity: .28 }), retrofit: new THREE.MeshStandardMaterial({ color: 0x9b7cff, metalness: .48, roughness: .3, emissive: 0x2a174e, emissiveIntensity: .6 }), wire: new THREE.MeshBasicMaterial({ color: 0x2ce0ca, wireframe: true, transparent: true, opacity: .35 }), retrofitWire: new THREE.MeshBasicMaterial({ color: 0x9b7cff, wireframe: true, transparent: true, opacity: .82 }), opening: new THREE.MeshBasicMaterial({ color: 0xe4b860 }), dark: new THREE.MeshStandardMaterial({ color: 0x071312, metalness: .7, roughness: .28 }), glow: new THREE.MeshBasicMaterial({ color: 0x2ce0ca }) } as const;
      const addMesh = (geometry: THREE.BufferGeometry, material: Material, group: THREE.Group, y = 0) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh; };
      const box = (w: number, h: number, d: number, material: Material, x: number, y: number, z: number, parent = root) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); mesh.position.set(x, y + h / 2, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

      for (const room of twin.rooms) { box(room.widthM, .03, room.depthM, materials.floor, room.x + room.widthM / 2, 0, room.y + room.depthM / 2); const roof = box(room.widthM, .015, room.depthM, materials.wire, room.x + room.widthM / 2, room.heightM, room.y + room.depthM / 2); roof.userData.type = "room-roof"; }
      for (const wall of twin.walls) { const dx = wall.b.x - wall.a.x; const dz = wall.b.y - wall.a.y; const length = Math.hypot(dx, dz); if (!(length > 0)) continue; const mesh = box(length, wall.heightM, wall.thicknessM, wall.source === "inferred" ? materials.inferred : materials.wall, (wall.a.x + wall.b.x) / 2, 0, (wall.a.y + wall.b.y) / 2); mesh.rotation.y = Math.atan2(dz, dx); }
      for (const opening of twin.openings) { const marker = new THREE.Mesh(new THREE.BoxGeometry(opening.widthM, .06, Math.max(twin.overall.widthM, twin.overall.depthM) * .012), materials.opening); marker.position.set(opening.x, .03, opening.y); root.add(marker); }

      const classKey = (asset: TwinModel["assets"][number]) => `${asset.className} ${asset.label}`.toLowerCase();
      const semanticAsset = (asset: TwinModel["assets"][number], material: Material, wire: Material) => {
        const group = new THREE.Group(); group.position.set(asset.x, 0, asset.y); group.rotation.y = THREE.MathUtils.degToRad(asset.rotationDeg); root.add(group);
        const key = classKey(asset); const w = asset.widthM; const h = asset.heightM; const d = asset.depthM;
        if (/pump/.test(key)) {
          addMesh(new THREE.CylinderGeometry(Math.min(w, d) * .34, Math.min(w, d) * .34, h * .55, 24), material, group, h * .28);
          const motor = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * .24, Math.min(w, d) * .24, h * .45, 20), materials.dark); motor.rotation.z = Math.PI / 2; motor.position.set(-w * .18, h * .42, 0); group.add(motor);
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * .07, Math.min(w, d) * .07, w * .7, 16), materials.glow); pipe.rotation.z = Math.PI / 2; pipe.position.set(w * .2, h * .55, 0); group.add(pipe);
        } else if (/motor|compressor/.test(key)) {
          const body = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * .36, Math.min(w, d) * .36, Math.max(h * .65, .05), 28), material); body.rotation.z = Math.PI / 2; body.position.y = h * .42; group.add(body);
          addMesh(new THREE.BoxGeometry(w * .25, h * .55, d * .55), materials.dark, group, h * .15).position.x = -w * .22;
        } else if (/fan|blower/.test(key)) {
          const housing = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * .45, Math.min(w, d) * .45, Math.max(d * .25, .03), 28), material); housing.rotation.x = Math.PI / 2; housing.position.y = h * .5; group.add(housing);
          for (let i = 0; i < 5; i++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(w * .38, .025, d * .07), materials.glow); blade.position.y = h * .5; blade.rotation.y = i * (Math.PI * 2 / 5); group.add(blade); }
        } else if (/ahu|air handling|chiller|boiler|refrigeration/.test(key)) {
          addMesh(new THREE.BoxGeometry(w, h * .82, d), material, group, h * .09);
          for (let i = 1; i < 4; i++) { const panel = new THREE.Mesh(new THREE.BoxGeometry(w * .82, h * .012, d * .92), materials.dark); panel.position.set(0, h * (.18 + i * .18), d * .501); group.add(panel); }
          const service = new THREE.Mesh(new THREE.BoxGeometry(w * .58, h * .42, .025), wire); service.position.set(0, h * .55, d * .52); group.add(service);
        } else if (/electrical panel|panel|switchboard|mcc|vfd/.test(key)) {
          addMesh(new THREE.BoxGeometry(w, h, Math.max(d, .08)), material, group);
          for (let i = 0; i < 3; i++) { const line = new THREE.Mesh(new THREE.BoxGeometry(w * .62, h * .025, .018), materials.glow); line.position.set(0, h * (.28 + i * .18), d * .52); group.add(line); }
        } else if (/duct|diffuser|grille/.test(key)) {
          addMesh(new THREE.BoxGeometry(w, h * .35, d), material, group, h * .1);
          const collar = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * .18, Math.min(w, d) * .18, h * .65, 16), materials.dark); collar.position.set(0, h * .55, 0); group.add(collar);
        } else if (/window|door/.test(key)) {
          const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, Math.max(d, .035)), wire); frame.position.y = h / 2; group.add(frame);
        } else {
          addMesh(new THREE.BoxGeometry(w, h, d), material, group);
        }
        const frame = new THREE.Mesh(new THREE.BoxGeometry(w * 1.035, h * 1.035, d * 1.035), wire); frame.position.y = h / 2; group.add(frame);
        return group;
      };

      for (const asset of twin.assets) {
        const isRetrofit = /RETROFIT TARGET|CONTROL \/ RUNTIME TARGET|retrofit-envelope-marker/i.test(`${asset.observedState || ""} ${asset.className}`);
        const material = isRetrofit ? materials.retrofit : asset.source === "inferred" ? materials.inferred : materials.asset;
        semanticAsset(asset, material, isRetrofit ? materials.retrofitWire : materials.wire);
      }

      const maxDim = Math.max(twin.overall.widthM, twin.overall.depthM, twin.overall.heightM); const target: Vector3 = new THREE.Vector3(twin.overall.widthM / 2, twin.overall.heightM * .42, twin.overall.depthM / 2); let yaw = .72, pitch = 1, radius = Math.max(maxDim * 1.9, 3), dragging = false, lastX = 0, lastY = 0;
      const updateCamera = () => { const x = target.x + Math.sin(pitch) * Math.cos(yaw) * radius; const z = target.z + Math.sin(pitch) * Math.sin(yaw) * radius; const y = target.y + Math.cos(pitch) * radius; camera.position.set(x, y, z); camera.lookAt(target); };
      updateCamera();
      const down = (event: PointerEvent) => { dragging = true; lastX = event.clientX; lastY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); };
      const move = (event: PointerEvent) => { if (!dragging) return; yaw -= (event.clientX - lastX) * .008; pitch = Math.max(.35, Math.min(1.42, pitch + (event.clientY - lastY) * .005)); lastX = event.clientX; lastY = event.clientY; updateCamera(); };
      const up = () => { dragging = false; };
      const wheel = (event: WheelEvent) => { event.preventDefault(); radius = Math.max(Math.max(maxDim * .8, 1), Math.min(500, radius + event.deltaY * .015)); updateCamera(); };
      renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointermove", move); renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("pointercancel", up); renderer.domElement.addEventListener("wheel", wheel, { passive: false });
      const resize = () => { const rect = host.getBoundingClientRect(); renderer.setSize(Math.max(rect.width, 1), Math.max(rect.height, 1), false); camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1); camera.updateProjectionMatrix(); };
      const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize();
      const animate = () => { if (dead) return; root.rotation.y += .0009; renderer.render(scene, camera); frame = requestAnimationFrame(animate); }; animate();
      const badge = document.createElement("div"); badge.className = "pointer-events-none absolute left-4 bottom-4 border border-steel/15 bg-black/70 px-3 py-2 font-mono text-[7px] uppercase tracking-[.1em] text-steel backdrop-blur"; badge.textContent = twin.units === "m" ? `${title} · verified metric · semantic asset geometry` : `${title} · relative scene · semantic asset geometry`; host.appendChild(badge);
      dispose = () => { cancelAnimationFrame(frame); resizeObserver.disconnect(); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("pointerup", up); renderer.domElement.removeEventListener("pointercancel", up); renderer.domElement.removeEventListener("wheel", wheel); scene.traverse((child: Object3D) => { const mesh = child as Mesh; mesh.geometry?.dispose?.(); const material = mesh.material as Material | Material[] | undefined; if (Array.isArray(material)) material.forEach((item) => item.dispose()); else material?.dispose?.(); }); renderer.dispose(); host.replaceChildren(); };
    };
    void mount();
    return () => { dead = true; dispose?.(); };
  }, [modelSnapshot, title]);

  return <div ref={hostRef} className="relative h-full min-h-[600px] w-full touch-none" aria-label={`${title} semantic generated 3D twin`} />;
}
