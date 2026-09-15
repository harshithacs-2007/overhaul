"use client";

import { useEffect, useRef } from "react";
import type { Scope } from "./Twin3DTypes";

type Twin3DCanvasProps = {
  scope: Scope;
  mode: "observed" | "retrofit";
  widthM: number | null;
  depthM: number | null;
  heightM: number | null;
  capacityKW: number | null;
  loadKW: number | null;
  powerKW: number | null;
  efficiency: number | null;
  title: string;
};

function finitePositive(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export default function Twin3DCanvas(props: Twin3DCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;

    const run = async () => {
      const THREE = await import("three");
      if (disposed || !hostRef.current) return;

      const host = hostRef.current;
      host.innerHTML = "";

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050808);
      scene.fog = new THREE.Fog(0x050808, 16, 34);

      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      camera.position.set(8, 6.2, 9.5);
      camera.lookAt(0, 1.2, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      host.appendChild(renderer.domElement);

      const ambient = new THREE.HemisphereLight(0xc8fff8, 0x101515, 1.9);
      scene.add(ambient);
      const key = new THREE.DirectionalLight(0xffffff, 3.1);
      key.position.set(6, 10, 4);
      key.castShadow = true;
      scene.add(key);
      const rim = new THREE.PointLight(0x31e6cb, 14, 24);
      rim.position.set(-5, 4, -4);
      scene.add(rim);

      const grid = new THREE.GridHelper(22, 22, 0x164642, 0x0c2927);
      grid.position.y = 0;
      scene.add(grid);

      const root = new THREE.Group();
      scene.add(root);
      const moving = new THREE.Group();
      scene.add(moving);

      const teal = new THREE.MeshStandardMaterial({ color: 0x2ce0ca, metalness: 0.5, roughness: 0.32, transparent: true, opacity: 0.74 });
      const tealDark = new THREE.MeshStandardMaterial({ color: 0x0b4b45, metalness: 0.72, roughness: 0.38 });
      const paper = new THREE.MeshStandardMaterial({ color: 0xc8d7d5, metalness: 0.15, roughness: 0.55, transparent: true, opacity: 0.42 });
      const amber = new THREE.MeshStandardMaterial({ color: 0xe6bc68, metalness: 0.45, roughness: 0.38, transparent: true, opacity: 0.78 });
      const clay = new THREE.MeshStandardMaterial({ color: 0xc77666, metalness: 0.35, roughness: 0.5, transparent: true, opacity: 0.72 });

      const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y + h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
        return mesh;
      };

      const cyl = (radius: number, height: number, mat: THREE.Material, x = 0, y = 0, z = 0, rotX = 0, rotZ = 0) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 32), mat);
        mesh.position.set(x, y + height / 2, z);
        mesh.rotation.x = rotX;
        mesh.rotation.z = rotZ;
        mesh.castShadow = true;
        root.add(mesh);
        return mesh;
      };

      const width = finitePositive(props.widthM) ?? (props.scope === "equipment" ? 2.4 : 10);
      const depth = finitePositive(props.depthM) ?? (props.scope === "equipment" ? 1.5 : 8);
      const height = finitePositive(props.heightM) ?? (props.scope === "equipment" ? 1.8 : 3.2);
      const currentScale = props.mode === "retrofit" ? 1.04 : 1;

      if (props.scope === "equipment") {
        const bodyW = Math.min(width * currentScale, 6);
        const bodyD = Math.min(depth * currentScale, 4);
        const bodyH = Math.min(height * currentScale, 3.8);
        box(bodyW, bodyH, bodyD, tealDark, 0, 0.15, 0);
        box(bodyW * 0.74, bodyH * 0.46, bodyD * 0.12, paper, 0, bodyH * 0.25, bodyD * 0.54);
        cyl(Math.max(bodyW * 0.14, 0.18), bodyD * 0.5, amber, -bodyW * 0.12, bodyH * 0.55, 0, Math.PI / 2, 0);
        const shaft = cyl(Math.max(bodyW * 0.055, 0.08), bodyD * 0.9, paper, bodyW * 0.18, bodyH * 0.55, 0, Math.PI / 2, 0);
        const rotor = new THREE.Group();
        rotor.position.set(bodyW * 0.18, bodyH * 0.55 + 0.02, 0);
        root.add(rotor);
        for (let i = 0; i < 6; i += 1) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(bodyW * 0.12, bodyH * 0.025, bodyD * 0.42), teal);
          blade.rotation.y = (i / 6) * Math.PI * 2;
          blade.position.x = Math.cos(blade.rotation.y) * bodyW * 0.16;
          blade.position.z = Math.sin(blade.rotation.y) * bodyD * 0.16;
          rotor.add(blade);
        }
        moving.userData.rotor = rotor;
        moving.userData.shaft = shaft;
        const base = box(bodyW * 1.08, 0.12, bodyD * 1.08, paper, 0, 0, 0);
        base.material = paper;
      } else {
        const roomW = Math.min(width * currentScale, 14);
        const roomD = Math.min(depth * currentScale, 12);
        const roomH = Math.min(height * currentScale, 5.6);
        const floor = new THREE.Mesh(new THREE.BoxGeometry(roomW, 0.12, roomD), paper);
        floor.position.y = 0.06;
        floor.receiveShadow = true;
        root.add(floor);
        box(roomW, 0.08, 0.16, teal, 0, roomH, -roomD / 2);
        box(0.08, roomH, roomD, paper, -roomW / 2, 0, 0);
        box(0.08, roomH, roomD, paper, roomW / 2, 0, 0);
        box(roomW, 0.08, 0.16, paper, 0, roomH, roomD / 2);
        box(Math.min(roomW * 0.16, 2.2), Math.min(roomH * 0.18, 0.8), Math.min(roomD * 0.16, 1.4), tealDark, -roomW * 0.24, roomH * 0.78, -roomD * 0.25);
        box(Math.min(roomW * 0.12, 1.7), Math.min(roomH * 0.14, 0.65), Math.min(roomD * 0.12, 1.1), amber, roomW * 0.24, roomH * 0.84, -roomD * 0.24);
        const duct = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(roomD * 0.055, 0.24), Math.min(roomD * 0.055, 0.24), roomW * 0.42, 24), teal);
        duct.rotation.z = Math.PI / 2;
        duct.position.set(0, roomH * 0.86, 0);
        duct.castShadow = true;
        root.add(duct);
        const fanGroup = new THREE.Group();
        fanGroup.position.set(0, roomH * 0.5, 0);
        root.add(fanGroup);
        for (let i = 0; i < 5; i += 1) {
          const line = new THREE.Mesh(new THREE.BoxGeometry(roomW * 0.32, 0.018, 0.018), teal);
          line.rotation.y = (i / 5) * Math.PI * 2;
          fanGroup.add(line);
        }
        moving.userData.flow = fanGroup;
      }

      const target = new THREE.Vector3(0, props.scope === "equipment" ? height * 0.45 : height * 0.48, 0);
      camera.lookAt(target);

      let dragging = false;
      let lastX = 0;
      let lastY = 0;
      let theta = 0.68;
      let phi = 0.96;
      let radius = 12;

      const updateCamera = () => {
        const x = Math.sin(phi) * Math.cos(theta) * radius;
        const z = Math.sin(phi) * Math.sin(theta) * radius;
        const y = Math.cos(phi) * radius + 2.2;
        camera.position.set(x, y, z);
        camera.lookAt(target);
      };
      updateCamera();

      const onPointerDown = (event: PointerEvent) => { dragging = true; lastX = event.clientX; lastY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); };
      const onPointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        theta -= (event.clientX - lastX) * 0.008;
        phi = Math.max(0.48, Math.min(1.35, phi + (event.clientY - lastY) * 0.005));
        lastX = event.clientX;
        lastY = event.clientY;
        updateCamera();
      };
      const onPointerUp = () => { dragging = false; };
      const onWheel = (event: WheelEvent) => { event.preventDefault(); radius = Math.max(6, Math.min(22, radius + event.deltaY * 0.01)); updateCamera(); };
      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointercancel", onPointerUp);
      renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

      const resize = () => {
        const rect = host.getBoundingClientRect();
        renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
        camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();

      const clock = new THREE.Clock();
      const power = finitePositive(props.powerKW) ?? finitePositive(props.loadKW) ?? 1;
      const capacity = finitePositive(props.capacityKW) ?? power;
      const loadFactor = Math.max(0.15, Math.min(1.6, power / Math.max(capacity, 0.01)));

      const animate = () => {
        if (disposed) return;
        const elapsed = clock.getElapsedTime();
        const speed = 0.55 + loadFactor * 1.4;
        const rotor = moving.userData.rotor as THREE.Group | undefined;
        if (rotor) rotor.rotation.y = elapsed * speed;
        const flow = moving.userData.flow as THREE.Group | undefined;
        if (flow) {
          flow.rotation.y = elapsed * (props.mode === "retrofit" ? 0.72 : 0.55) * Math.min(1.35, loadFactor);
          flow.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.03);
        }
        root.rotation.y = Math.sin(elapsed * 0.12) * 0.035;
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      };
      animate();

      cleanup = () => {
        observer.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointercancel", onPointerUp);
        renderer.domElement.removeEventListener("wheel", onWheel);
        renderer.dispose();
        host.innerHTML = "";
      };
    };

    void run();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [props.scope, props.mode, props.widthM, props.depthM, props.heightM, props.capacityKW, props.loadKW, props.powerKW, props.efficiency, props.title]);

  return <div ref={hostRef} className="h-full min-h-[460px] w-full touch-none" aria-label={`${props.title} interactive 3D digital twin`} />;
}
