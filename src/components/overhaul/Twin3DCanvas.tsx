"use client";

import { useEffect, useRef } from "react";
import type { Group, Material, Mesh, Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from "three";
import type { TwinModel } from "@/lib/engineering/twinModel";

type Scope = "building" | "facility" | "equipment";
type Props = { scope: Scope; mode: "observed" | "retrofit"; model: TwinModel | null; widthM: number | null; depthM: number | null; heightM: number | null; capacityKW: number | null; loadKW: number | null; powerKW: number | null; currentLoadKW: number | null; proposedLoadKW: number | null; currentPowerKW: number | null; proposedPowerKW: number | null; currentUtilization: number | null; proposedUtilization: number | null; savingPercent: number | null; title: string };
const pos = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export default function Twin3DCanvas(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false; let frame = 0; let dispose: (() => void) | undefined;
    const mount = async () => {
      const THREE = await import("three"); if (dead || !hostRef.current) return; const host = hostRef.current; host.replaceChildren();
      const fallback = (message: string) => { host.replaceChildren(); const box = document.createElement("div"); box.className = "grid h-full min-h-[560px] place-items-center border border-steel/10 bg-[#050808] p-8 text-center"; box.textContent = message; host.appendChild(box); };
      let scene: Scene, camera: PerspectiveCamera, renderer: WebGLRenderer;
      try { scene = new THREE.Scene(); scene.background = new THREE.Color(0x050808); scene.fog = new THREE.Fog(0x050808, 30, 70); camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200); renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" }); } catch { fallback("Interactive 3D is unavailable in this browser."); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; host.appendChild(renderer.domElement);
      scene.add(new THREE.HemisphereLight(0xd7fff8, 0x0a1111, 1.8)); const key = new THREE.DirectionalLight(0xffffff, 2.8); key.position.set(10, 16, 8); key.castShadow = true; scene.add(key); const rim = new THREE.PointLight(0x24dfca, 9, 38); rim.position.set(-8, 7, -8); scene.add(rim); const amberRim = new THREE.PointLight(0xe4b860, 5, 30); amberRim.position.set(8, 5, 6); scene.add(amberRim);
      scene.add(new THREE.GridHelper(50, 50, 0x164b46, 0x0b2523));
      const root = new THREE.Group(); const field = new THREE.Group(); scene.add(root, field);
      const teal = new THREE.MeshStandardMaterial({ color: 0x2ce0ca, metalness: 0.48, roughness: 0.28 }); const dark = new THREE.MeshStandardMaterial({ color: 0x103f3b, metalness: 0.72, roughness: 0.35 }); const glass = new THREE.MeshStandardMaterial({ color: 0xc7dbd9, metalness: 0.05, roughness: 0.42, transparent: true, opacity: 0.22 }); const amber = new THREE.MeshStandardMaterial({ color: 0xe4b860, metalness: 0.42, roughness: 0.32 }); const roomMat = new THREE.MeshStandardMaterial({ color: 0x123d39, transparent: true, opacity: 0.12, roughness: 0.7 }); const wire = new THREE.MeshBasicMaterial({ color: 0xe4b860, wireframe: true, transparent: true, opacity: 0.25 }); const retrofitWire = new THREE.MeshBasicMaterial({ color: 0x2ce0ca, wireframe: true, transparent: true, opacity: 0.18 });
      const box = (w: number, h: number, d: number, material: Material, group = root, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.05), Math.max(h, 0.05), Math.max(d, 0.05)), material); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };
      const wall = (a: {x:number;y:number}, b: {x:number;y:number}, thickness: number, height: number, material: Material) => { const dx = b.x - a.x, dz = b.y - a.y, len = Math.hypot(dx, dz); const m = box(len, height, thickness, material, root, (a.x + b.x) / 2, 0, (a.y + b.y) / 2); m.rotation.y = Math.atan2(dz, dx); return m; };
      const ring = (radius: number, y: number, material: Material) => { const m = new THREE.Mesh(new THREE.TorusGeometry(radius, Math.max(radius * 0.008, 0.025), 8, 96), material); m.rotation.x = Math.PI / 2; m.position.y = y; field.add(m); return m; };
      const overall = props.model?.overall || { widthM: pos(props.widthM) || (props.scope === "equipment" ? 2.4 : 10), depthM: pos(props.depthM) || (props.scope === "equipment" ? 1.5 : 8), heightM: pos(props.heightM) || (props.scope === "equipment" ? 1.8 : 3.2) };
      const width = overall.widthM, depth = overall.depthM, height = overall.heightM;
      const fit = Math.max(width, depth, height); let pulses: Mesh[] = [];
      if (props.model && props.scope !== "equipment" && props.model.walls.length) {
        for (const w of props.model.walls) wall(w.a, w.b, w.thicknessM, Math.min(w.heightM, Math.max(height, 2.5)), w.source === "floorplan" ? glass : dark);
        for (const room of props.model.rooms) { const floor = box(room.widthM, 0.025, room.depthM, roomMat, root, room.x + room.widthM / 2, 0.02, room.y + room.depthM / 2); floor.userData.roomId = room.id; }
        for (const opening of props.model.openings) { const marker = new THREE.Mesh(new THREE.BoxGeometry(opening.widthM, 0.05, 0.08), opening.type === "window" ? teal : amber); marker.position.set(opening.x, 0.04, opening.y); root.add(marker); }
      } else {
        box(width, 0.12, depth, glass); if (props.scope !== "equipment") { box(width, 0.06, 0.12, teal, root, 0, height, -depth / 2); box(0.06, height, depth, glass, root, -width / 2, 0, 0); box(0.06, height, depth, glass, root, width / 2, 0, 0); } else { box(width, height, depth, dark); }
      }
      const assets = props.model?.assets || [];
      if (assets.length) {
        for (const asset of assets) {
          const group = new THREE.Group(); group.position.set(asset.x, 0, asset.y); group.rotation.y = THREE.MathUtils.degToRad(asset.rotationDeg); group.userData.assetId = asset.id; root.add(group);
          const body = box(Math.min(asset.widthM, width * 0.5), Math.min(asset.heightM, height * 1.2), Math.min(asset.depthM, depth * 0.5), asset.source === "photo" ? amber : dark, group, 0, 0, 0); body.scale.set(0.01, 0.01, 0.01); body.userData.assetLabel = asset.label;
          const accent = box(Math.max(asset.widthM * 0.55, 0.08), Math.max(asset.heightM * 0.08, 0.03), Math.max(asset.depthM * 0.07, 0.03), teal, group, 0, Math.max(asset.heightM * 0.75, 0.2), Math.max(asset.depthM * 0.48, 0.04)); accent.userData.assetLabel = asset.label;
          group.userData.growBody = body; group.userData.growAccent = accent;
        }
      } else if (props.scope === "equipment") {
        const w = Math.min(width, 6), d = Math.min(depth, 4), h = Math.min(height, 4); box(w, h, d, dark); const rotor = new THREE.Group(); rotor.position.set(w * .16, h * .55, 0); root.add(rotor); for (let i=0;i<6;i+=1) { const blade = new THREE.Mesh(new THREE.BoxGeometry(w*.1,.04,d*.38), teal); blade.rotation.y=(i/6)*Math.PI*2; blade.position.x=Math.cos(blade.rotation.y)*w*.15; blade.position.z=Math.sin(blade.rotation.y)*d*.15; rotor.add(blade); } root.userData.rotor = rotor;
      }
      if (props.scope !== "equipment" && !props.model) { box(Math.min(width*.14,1.7), Math.min(height*.16,.7), Math.min(depth*.12,1.2), dark, root, -width*.24, height*.78, -depth*.22); box(Math.min(width*.11,1.4), Math.min(height*.14,.6), Math.min(depth*.1,1.0), amber, root, width*.23, height*.82, -depth*.22); }
      const currentUtil = props.currentUtilization ?? (props.capacityKW && props.loadKW ? props.loadKW / props.capacityKW : null); const proposedUtil = props.proposedUtilization ?? currentUtil; const util = clamp01((props.mode === "retrofit" ? proposedUtil : currentUtil) ?? .35); const saving = props.savingPercent == null ? null : Math.max(-100, Math.min(100, props.savingPercent)); const baseRadius = Math.max(fit * .65, 2.2); pulses = [ring(baseRadius * (.72 + util*.2), Math.max(height*.08,.16), teal), ring(baseRadius * (.98 + util*.28), Math.max(height*.48,.45), amber), ring(baseRadius * (1.25 + util*.36), Math.max(height*.88,.8), wire)];
      const retrofitGroup = new THREE.Group(); scene.add(retrofitGroup); if (props.mode === "retrofit" && props.currentPowerKW != null && props.proposedPowerKW != null) { const scale = saving == null ? 1 : 1 + Math.min(.16, Math.abs(saving)/100*.16); const shell = box(width*scale, Math.min(height*scale, height*1.25), depth*scale, retrofitWire, retrofitGroup, 0, 0.04, 0); shell.position.y = Math.min(height*.12, .4); }
      const target: Vector3 = new THREE.Vector3(width/2, Math.max(height*.45,.8), depth/2); let yaw=.72,pitch=1.0,radius=Math.max(fit*1.7,8),dragging=false,lastX=0,lastY=0;
      const updateCamera=()=>{const x=target.x+Math.sin(pitch)*Math.cos(yaw)*radius,z=target.z+Math.sin(pitch)*Math.sin(yaw)*radius,y=target.y+Math.cos(pitch)*radius;camera.position.set(x,y,z);camera.lookAt(target)};updateCamera();
      const down=(e:PointerEvent)=>{dragging=true;lastX=e.clientX;lastY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)};const move=(e:PointerEvent)=>{if(!dragging)return;yaw-=(e.clientX-lastX)*.008;pitch=Math.max(.45,Math.min(1.42,pitch+(e.clientY-lastY)*.005));lastX=e.clientX;lastY=e.clientY;updateCamera()};const up=()=>{dragging=false};const wheel=(e:WheelEvent)=>{e.preventDefault();radius=Math.max(Math.max(fit*.9,4),Math.min(80,radius+e.deltaY*.015));updateCamera()};renderer.domElement.addEventListener("pointerdown",down);renderer.domElement.addEventListener("pointermove",move);renderer.domElement.addEventListener("pointerup",up);renderer.domElement.addEventListener("pointercancel",up);renderer.domElement.addEventListener("wheel",wheel,{passive:false});
      const resize=()=>{const rect=host.getBoundingClientRect();renderer.setSize(Math.max(rect.width,1),Math.max(rect.height,1),false);camera.aspect=Math.max(rect.width,1)/Math.max(rect.height,1);camera.updateProjectionMatrix()};const ro=new ResizeObserver(resize);ro.observe(host);resize();
      const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;const clock=new THREE.Clock();const fieldPulse=(rings:Mesh[],t:number)=>rings.forEach((r,i)=>{r.scale.setScalar(.96+Math.sin(t*(1.1+i*.2)+i)*.035);r.rotation.z=t*(i%2?.04:-.03)});const animate=()=>{if(dead)return;const t=clock.getElapsedTime();if(!reduced){const rotor=root.userData.rotor as Group|undefined;if(rotor)rotor.rotation.y=t*(.6+util*2);fieldPulse(pulses,t);root.traverse((child:Object3D)=>{const item=child as Object3D&{userData:Record<string,unknown>};const body=item.userData.growBody as Mesh|undefined;if(body)body.scale.setScalar(Math.min(1,Math.max(.01,(t-.15)*1.2)));});}renderer.render(scene,camera);frame=requestAnimationFrame(animate)};animate();
      dispose=()=>{cancelAnimationFrame(frame);ro.disconnect();renderer.domElement.removeEventListener("pointerdown",down);renderer.domElement.removeEventListener("pointermove",move);renderer.domElement.removeEventListener("pointerup",up);renderer.domElement.removeEventListener("pointercancel",up);renderer.domElement.removeEventListener("wheel",wheel);scene.traverse((child:Object3D)=>{const mesh=child as Mesh;mesh.geometry?.dispose?.();const material=mesh.material as Material|Material[]|undefined;if(Array.isArray(material))material.forEach((m)=>m.dispose());else material?.dispose?.()});renderer.dispose();host.replaceChildren()};
    };
    void mount();return()=>{dead=true;dispose?.()};
  },[props.scope,props.mode,props.model,props.widthM,props.depthM,props.heightM,props.capacityKW,props.loadKW,props.powerKW,props.currentLoadKW,props.proposedLoadKW,props.currentPowerKW,props.proposedPowerKW,props.currentUtilization,props.proposedUtilization,props.savingPercent]);
  return <div ref={hostRef} className="h-full min-h-[560px] w-full touch-none" aria-label={`${props.title} interactive generated 3D twin`}/>;
}
