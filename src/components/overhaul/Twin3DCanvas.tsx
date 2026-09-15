"use client";

import { useEffect, useRef } from "react";
import type { Group, Material, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";

type Scope = "building" | "facility" | "equipment";

type Props = {
  scope: Scope;
  mode: "observed" | "retrofit";
  widthM: number | null;
  depthM: number | null;
  heightM: number | null;
  capacityKW: number | null;
  loadKW: number | null;
  powerKW: number | null;
  currentLoadKW: number | null;
  proposedLoadKW: number | null;
  currentPowerKW: number | null;
  proposedPowerKW: number | null;
  currentUtilization: number | null;
  proposedUtilization: number | null;
  savingPercent: number | null;
  title: string;
};

const pos = (v: number | null) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export default function Twin3DCanvas(props: Props) {
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

      const showFallback = (message: string) => {
        host.replaceChildren();
        const fallback = document.createElement("div");
        fallback.className = "grid h-full min-h-[520px] place-items-center border border-steel/10 bg-[#050808] p-8 text-center";
        fallback.innerHTML = `<div><div style="font-family:monospace;font-size:8px;letter-spacing:.14em;text-transform:uppercase;color:#8a9ba8">3D viewport</div><div style="margin-top:8px;color:#eef5f3;font-size:14px">${message}</div><div style="margin-top:8px;color:#8a9ba8;font-size:9px;line-height:1.5">The engineering calculations remain available; this only removes the interactive renderer.</div></div>`;
        host.appendChild(fallback);
      };

      let scene: Scene;
      let camera: PerspectiveCamera;
      let renderer: WebGLRenderer;
      try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050808);
        scene.fog = new THREE.Fog(0x050808, 18, 36);
        camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      } catch {
        showFallback("Interactive 3D is unavailable in this browser.");
        return;
      }

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      host.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xd7fff8, 0x0a1111, 1.9));
      const key = new THREE.DirectionalLight(0xffffff, 3);
      key.position.set(7, 10, 6);
      key.castShadow = true;
      scene.add(key);
      const rim = new THREE.PointLight(0x24dfca, 10, 26);
      rim.position.set(-5, 4, -5);
      scene.add(rim);
      const amberRim = new THREE.PointLight(0xe4b860, 5, 20);
      amberRim.position.set(5, 3, 4);
      scene.add(amberRim);
      scene.add(new THREE.GridHelper(24, 24, 0x164b46, 0x0b2523));

      const root = new THREE.Group();
      scene.add(root);
      const field = new THREE.Group();
      scene.add(field);

      const teal = new THREE.MeshStandardMaterial({ color: 0x2ce0ca, metalness: 0.55, roughness: 0.3 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x103f3b, metalness: 0.74, roughness: 0.36 });
      const glass = new THREE.MeshStandardMaterial({ color: 0xc7dbd9, metalness: 0.1, roughness: 0.42, transparent: true, opacity: 0.24 });
      const amber = new THREE.MeshStandardMaterial({ color: 0xe4b860, metalness: 0.45, roughness: 0.35 });
      const wire = new THREE.MeshBasicMaterial({ color: 0xe4b860, wireframe: true, transparent: true, opacity: 0.25 });
      const ghost = new THREE.MeshBasicMaterial({ color: 0x2ce0ca, wireframe: true, transparent: true, opacity: 0.12 });

      const box = (w: number, h: number, d: number, mat: Material, group = root, x = 0, y = 0, z = 0) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y + h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        return mesh;
      };
      const ring = (rx: number, ry: number, rz: number, mat: Material, y: number) => {
        const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.015, 8, 64), mat);
        mesh.scale.set(rx, rz, ry);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = y;
        field.add(mesh);
        return mesh;
      };

      const width = pos(props.widthM) ?? (props.scope === "equipment" ? 2.4 : 10);
      const depth = pos(props.depthM) ?? (props.scope === "equipment" ? 1.5 : 8);
      const height = pos(props.heightM) ?? (props.scope === "equipment" ? 1.8 : 3.2);

      let flow: Group | undefined;
      let rotor: Group | undefined;
      let currentGhost: Mesh | undefined;
      let proposedGhost: Mesh | undefined;

      if (props.scope === "equipment") {
        const w = Math.min(width, 6);
        const d = Math.min(depth, 4);
        const h = Math.min(height, 4);
        box(w, h, d, dark);
        box(w * 0.72, h * 0.46, d * 0.12, glass, root, 0, h * 0.27, d * 0.55);
        const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(w * 0.13, 0.18), Math.max(w * 0.13, 0.18), d * 0.5, 32), amber);
        cylinder.rotation.x = Math.PI / 2;
        cylinder.position.set(-w * 0.12, h * 0.72, 0);
        root.add(cylinder);
        rotor = new THREE.Group();
        rotor.position.set(w * 0.18, h * 0.57, 0);
        root.add(rotor);
        for (let i = 0; i < 6; i += 1) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(w * 0.11, 0.035, d * 0.42), teal);
          const a = (i / 6) * Math.PI * 2;
          blade.rotation.y = a;
          blade.position.set(Math.cos(a) * w * 0.16, 0, Math.sin(a) * d * 0.16);
          rotor.add(blade);
        }
        box(w * 1.08, 0.12, d * 1.08, glass, root, 0, 0, 0);
        if (props.currentPowerKW != null && props.proposedPowerKW != null) {
          currentGhost = box(w * 1.03, h * 1.03, d * 1.03, ghost, field, 0, 0.16, 0);
          proposedGhost = box(w * 1.07, h * 1.07, d * 1.07, wire, field, 0, 0.16, 0);
        }
      } else {
        const w = Math.min(width, 15);
        const d = Math.min(depth, 12);
        const h = Math.min(height, 6);
        box(w, 0.12, d, glass);
        box(w, 0.08, 0.14, teal, root, 0, h, -d / 2);
        box(0.08, h, d, glass, root, -w / 2, 0, 0);
        box(0.08, h, d, glass, root, w / 2, 0, 0);
        box(w, 0.08, 0.14, glass, root, 0, h, d / 2);
        box(Math.min(w * 0.17, 2.2), Math.min(h * 0.18, 0.8), Math.min(d * 0.14, 1.35), dark, root, -w * 0.24, h * 0.79, -d * 0.24);
        box(Math.min(w * 0.12, 1.6), Math.min(h * 0.15, 0.62), Math.min(d * 0.11, 1.05), amber, root, w * 0.23, h * 0.83, -d * 0.23);
        const duct = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(d * 0.05, 0.24), Math.min(d * 0.05, 0.24), w * 0.44, 24), teal);
        duct.rotation.z = Math.PI / 2;
        duct.position.set(0, h * 0.86, 0);
        root.add(duct);
        flow = new THREE.Group();
        flow.position.set(0, h * 0.52, 0);
        root.add(flow);
        for (let i = 0; i < 7; i += 1) {
          const segment = new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, 0.025, 0.025), teal);
          segment.position.x = -w * 0.34 + i * w * 0.11;
          segment.position.z = Math.sin(i * 1.3) * d * 0.08;
          flow.add(segment);
        }
        if (props.currentLoadKW != null && props.proposedLoadKW != null) {
          currentGhost = box(w, h * 1.005, d, ghost, field, 0, 0.02, 0);
          proposedGhost = box(w, h * 1.01, d, wire, field, 0, 0.02, 0);
        }
      }

      const currentUtil = props.currentUtilization ?? (props.capacityKW && props.loadKW ? props.loadKW / props.capacityKW : null);
      const proposedUtil = props.proposedUtilization ?? currentUtil;
      const util = clamp01((props.mode === "retrofit" ? proposedUtil : currentUtil) ?? 0.35);
      const saving = props.savingPercent == null ? null : Math.max(-100, Math.min(100, props.savingPercent));
      const fieldScale = 1 + util * 0.55;
      const r1 = ring(Math.max(width * 0.22, 1.4) * fieldScale, Math.max(depth * 0.22, 1.2) * fieldScale, 1.2, teal, Math.max(height * 0.18, 0.25));
      const r2 = ring(Math.max(width * 0.3, 1.8) * fieldScale, Math.max(depth * 0.3, 1.6) * fieldScale, 1.2, amber, Math.max(height * 0.58, 0.55));
      const r3 = ring(Math.max(width * 0.38, 2.2) * fieldScale, Math.max(depth * 0.38, 1.9) * fieldScale, 1.2, wire, Math.max(height * 0.94, 0.9));
      [r1, r2, r3].forEach((r, i) => { r.rotation.z = i * 0.8; });

      const target: Vector3 = new THREE.Vector3(0, props.scope === "equipment" ? height * 0.52 : height * 0.5, 0);
      let yaw = 0.72;
      let pitch = 0.95;
      let radius = props.scope === "equipment" ? 7 : 13;
      let drag = false;
      let lastX = 0;
      let lastY = 0;

      const cameraUpdate = () => {
        const x = Math.sin(pitch) * Math.cos(yaw) * radius;
        const z = Math.sin(pitch) * Math.sin(yaw) * radius;
        const y = Math.cos(pitch) * radius + 2;
        camera.position.set(x, y, z);
        camera.lookAt(target);
      };
      cameraUpdate();

      const onDown = (e: PointerEvent) => { drag = true; lastX = e.clientX; lastY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); };
      const onMove = (e: PointerEvent) => {
        if (!drag) return;
        yaw -= (e.clientX - lastX) * 0.008;
        pitch = Math.max(0.48, Math.min(1.34, pitch + (e.clientY - lastY) * 0.005));
        lastX = e.clientX; lastY = e.clientY;
        cameraUpdate();
      };
      const onUp = () => { drag = false; };
      const onWheel = (e: WheelEvent) => { e.preventDefault(); radius = Math.max(4, Math.min(24, radius + e.deltaY * 0.012)); cameraUpdate(); };
      renderer.domElement.addEventListener("pointerdown", onDown);
      renderer.domElement.addEventListener("pointermove", onMove);
      renderer.domElement.addEventListener("pointerup", onUp);
      renderer.domElement.addEventListener("pointercancel", onUp);
      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

      const resize = () => {
        const rect = host.getBoundingClientRect();
        renderer.setSize(Math.max(rect.width, 1), Math.max(rect.height, 1), false);
        camera.aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      resize();

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const clock = new THREE.Clock();
      const animate = () => {
        if (dead) return;
        const t = clock.getElapsedTime();
        if (!reducedMotion) {
          if (rotor) rotor.rotation.y = t * (0.45 + util * 2.1);
          if (flow) {
            flow.position.x = Math.sin(t * 0.9) * 0.08;
            flow.scale.x = 1 + Math.sin(t * 2.1) * 0.05;
          }
          field.rotation.y = t * 0.055;
          r1.rotation.z += 0.0015;
          r2.rotation.z -= 0.0011;
          r3.rotation.z += 0.0008;
        }
        const pulse = reducedMotion ? 1 : 0.94 + Math.sin(t * 2.4) * (0.025 + util * 0.03);
        field.scale.setScalar(pulse);
        if (currentGhost && proposedGhost) {
          const contrast = saving == null ? 0.12 : Math.min(0.34, 0.08 + Math.abs(saving) / 100);
          currentGhost.material.opacity = props.mode === "observed" ? 0.1 : contrast;
          proposedGhost.material.opacity = props.mode === "retrofit" ? 0.18 : 0.07;
          proposedGhost.scale.setScalar(1 + (Math.abs(saving ?? 0) / 100) * 0.08);
        }
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      };
      animate();

      dispose = () => {
        cancelAnimationFrame(frame);
        ro.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("pointercancel", onUp);
        renderer.domElement.removeEventListener("wheel", onWheel);
        scene.traverse((child: Object3D) => {
          const mesh = child as Mesh;
          mesh.geometry?.dispose?.();
          const material = mesh.material as Material | Material[] | undefined;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material?.dispose?.();
        });
        renderer.dispose();
        host.replaceChildren();
      };
    };

    void mount();
    return () => { dead = true; dispose?.(); };
  }, [props.scope, props.mode, props.widthM, props.depthM, props.heightM, props.capacityKW, props.loadKW, props.powerKW, props.currentLoadKW, props.proposedLoadKW, props.currentPowerKW, props.proposedPowerKW, props.currentUtilization, props.proposedUtilization, props.savingPercent]);

  return <div ref={hostRef} className="h-full min-h-[520px] w-full touch-none" aria-label={`${props.title} interactive 3D engineering twin`} />;
}
