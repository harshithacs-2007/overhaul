"use client";

import { useEffect, useRef } from "react";

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
  title: string;
};

const pos = (v: number | null) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

export default function Twin3DCanvas(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    let dispose: (() => void) | undefined;

    const mount = async () => {
      const THREE = await import("three");
      if (dead || !hostRef.current) return;
      const host = hostRef.current;
      host.replaceChildren();

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050808);
      scene.fog = new THREE.Fog(0x050808, 18, 36);
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      host.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xd7fff8, 0x0a1111, 1.9));
      const key = new THREE.DirectionalLight(0xffffff, 3);
      key.position.set(7, 10, 6);
      key.castShadow = true;
      scene.add(key);
      const rim = new THREE.PointLight(0x24dfca, 12, 26);
      rim.position.set(-5, 4, -5);
      scene.add(rim);
      scene.add(new THREE.GridHelper(24, 24, 0x164b46, 0x0b2523));

      const root = new THREE.Group();
      scene.add(root);
      const animated = new THREE.Group();
      scene.add(animated);
      const teal = new THREE.MeshStandardMaterial({ color: 0x2ce0ca, metalness: 0.55, roughness: 0.3 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x103f3b, metalness: 0.74, roughness: 0.36 });
      const glass = new THREE.MeshStandardMaterial({ color: 0xc7dbd9, metalness: 0.1, roughness: 0.42, transparent: true, opacity: 0.27 });
      const amber = new THREE.MeshStandardMaterial({ color: 0xe4b860, metalness: 0.45, roughness: 0.35 });
      const fault = new THREE.MeshStandardMaterial({ color: 0xc87566, metalness: 0.35, roughness: 0.5 });

      const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(x, y + h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        root.add(mesh);
        return mesh;
      };
      const cylinder = (r: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, rotX = 0) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), mat);
        mesh.position.set(x, y + h / 2, z);
        mesh.rotation.x = rotX;
        mesh.castShadow = true;
        root.add(mesh);
        return mesh;
      };

      const width = pos(props.widthM) ?? (props.scope === "equipment" ? 2.4 : 10);
      const depth = pos(props.depthM) ?? (props.scope === "equipment" ? 1.5 : 8);
      const height = pos(props.heightM) ?? (props.scope === "equipment" ? 1.8 : 3.2);
      const stateScale = props.mode === "retrofit" ? 1.055 : 1;

      if (props.scope === "equipment") {
        const w = Math.min(width * stateScale, 6);
        const d = Math.min(depth * stateScale, 4);
        const h = Math.min(height * stateScale, 4);
        box(w, h, d, dark, 0, 0.16, 0);
        box(w * 0.72, h * 0.46, d * 0.12, glass, 0, h * 0.27, d * 0.55);
        cylinder(Math.max(w * 0.13, 0.18), d * 0.5, amber, -w * 0.12, h * 0.57, 0, Math.PI / 2);
        const rotor = new THREE.Group();
        rotor.position.set(w * 0.18, h * 0.57, 0);
        root.add(rotor);
        for (let i = 0; i < 6; i += 1) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(w * 0.11, 0.035, d * 0.42), teal);
          const a = (i / 6) * Math.PI * 2;
          blade.rotation.y = a;
          blade.position.set(Math.cos(a) * w * 0.16, 0, Math.sin(a) * d * 0.16);
          rotor.add(blade);
        }
        animated.userData.rotor = rotor;
        box(w * 1.08, 0.12, d * 1.08, glass, 0, 0, 0);
      } else {
        const w = Math.min(width * stateScale, 15);
        const d = Math.min(depth * stateScale, 12);
        const h = Math.min(height * stateScale, 6);
        box(w, 0.12, d, glass, 0, 0, 0);
        box(w, 0.08, 0.14, teal, 0, h, -d / 2);
        box(0.08, h, d, glass, -w / 2, 0, 0);
        box(0.08, h, d, glass, w / 2, 0, 0);
        box(w, 0.08, 0.14, glass, 0, h, d / 2);
        box(Math.min(w * 0.17, 2.2), Math.min(h * 0.18, 0.8), Math.min(d * 0.14, 1.35), dark, -w * 0.24, h * 0.79, -d * 0.24);
        box(Math.min(w * 0.12, 1.6), Math.min(h * 0.15, 0.62), Math.min(d * 0.11, 1.05), amber, w * 0.23, h * 0.83, -d * 0.23);
        const duct = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(d * 0.05, 0.24), Math.min(d * 0.05, 0.24), w * 0.44, 24), teal);
        duct.rotation.z = Math.PI / 2;
        duct.position.set(0, h * 0.86, 0);
        duct.castShadow = true;
        root.add(duct);
        const flow = new THREE.Group();
        flow.position.set(0, h * 0.52, 0);
        root.add(flow);
        for (let i = 0; i < 5; i += 1) {
          const segment = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 0.025, 0.025), teal);
          segment.rotation.y = (i / 5) * Math.PI * 2;
          flow.add(segment);
        }
        animated.userData.flow = flow;
      }

      const target = new THREE.Vector3(0, props.scope === "equipment" ? height * 0.52 : height * 0.5, 0);
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

      const clock = new THREE.Clock();
      const power = pos(props.powerKW) ?? pos(props.loadKW) ?? 1;
      const capacity = pos(props.capacityKW) ?? power;
      const utilization = Math.min(1.6, Math.max(0.1, power / Math.max(capacity, 0.01)));
      const animate = () => {
        if (dead) return;
        const t = clock.getElapsedTime();
        const rotor = animated.userData.rotor as THREE.Group | undefined;
        if (rotor) rotor.rotation.y = t * (0.5 + utilization * 1.5);
        const flow = animated.userData.flow as THREE.Group | undefined;
        if (flow) {
          flow.rotation.y = t * (props.mode === "retrofit" ? 0.9 : 0.62) * Math.min(utilization, 1.3);
          flow.scale.setScalar(1 + Math.sin(t * 2.2) * 0.035);
        }
        root.rotation.y = Math.sin(t * 0.15) * 0.025;
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      };
      animate();

      dispose = () => {
        ro.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onDown);
        renderer.domElement.removeEventListener("pointermove", onMove);
        renderer.domElement.removeEventListener("pointerup", onUp);
        renderer.domElement.removeEventListener("pointercancel", onUp);
        renderer.domElement.removeEventListener("wheel", onWheel);
        renderer.dispose();
        host.replaceChildren();
      };
    };

    void mount();
    return () => { dead = true; dispose?.(); };
  }, [props.scope, props.mode, props.widthM, props.depthM, props.heightM, props.capacityKW, props.loadKW, props.powerKW, props.title]);

  return <div ref={hostRef} className="h-full min-h-[460px] w-full touch-none" aria-label={`${props.title} interactive 3D model`} />;
}
