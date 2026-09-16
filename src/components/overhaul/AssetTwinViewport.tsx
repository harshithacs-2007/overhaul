"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildAssetObj, buildDxfFootprint, buildInteropManifest, buildTwinDxf, buildTwinObj, type InteropAsset } from "@/lib/engineering/assetInteroperability";
import type { TwinModel } from "@/lib/engineering/twinModel";
import * as THREE from "three";

type Props = { scope: "building" | "facility" | "equipment"; title: string; assetClass: string; evidenceIds: string[]; values: Record<string, number | string | null | undefined>; twin?: TwinModel | null };

type ViewMode = "current" | "retrofit";

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function n(values: Props["values"], ...keys: string[]) {
  for (const key of keys) {
    const value = Number(values[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function semanticKind(assetClass: string) {
  const s = assetClass.toLowerCase();
  if (/pump/.test(s)) return "pump";
  if (/compressor|chiller|refrigeration/.test(s)) return "compressor";
  if (/fan|blower|ahu|air handling/.test(s)) return "fan";
  if (/motor|drive|vfd/.test(s)) return "motor";
  if (/boiler|tank|vessel/.test(s)) return "vessel";
  if (/panel|switchgear|electrical/.test(s)) return "panel";
  if (/duct|diffuser/.test(s)) return "duct";
  if (/window|glazing/.test(s)) return "window";
  if (/door/.test(s)) return "door";
  return "generic";
}

function addSemanticAsset(group: THREE.Group, kind: string, scale: THREE.Vector3, retrofit: boolean) {
  const material = new THREE.MeshStandardMaterial({ color: retrofit ? 0xd8a84e : 0x3fe0c9, roughness: 0.42, metalness: 0.38, transparent: true, opacity: 0.88 });
  const secondary = new THREE.MeshStandardMaterial({ color: retrofit ? 0xffd98a : 0xbdeee8, roughness: 0.3, metalness: 0.6 });
  const addBox = (sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material); mesh.position.set(x, y, z); group.add(mesh); return mesh; };
  const addCylinder = (r: number, h: number, x = 0, y = 0, z = 0, rotX = 0, rotZ = 0) => { const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 28), secondary); mesh.position.set(x, y, z); mesh.rotation.x = rotX; mesh.rotation.z = rotZ; group.add(mesh); return mesh; };

  if (kind === "pump") { addCylinder(0.36, 0.7, 0, 0.45, 0, Math.PI / 2); addBox(0.75, 0.5, 0.55, 0, 0.2, 0); addCylinder(0.1, 0.55, -0.48, 0.42, 0, 0, Math.PI / 2); return; }
  if (kind === "compressor") { addBox(1.0, 0.85, 0.8, 0, 0.48, 0); addCylinder(0.27, 0.9, 0.58, 0.48, 0, Math.PI / 2); addCylinder(0.08, 0.6, -0.55, 0.58, 0, Math.PI / 2); return; }
  if (kind === "fan") { addBox(1.5, 0.8, 1.0, 0, 0.45, 0); const fan = addCylinder(0.34, 0.12, 0, 0.45, 0.56, Math.PI / 2); for (let i = 0; i < 6; i += 1) { const blade = addBox(0.5, 0.035, 0.12); blade.position.set(Math.cos(i * Math.PI / 3) * 0.28, 0.45, 0.64 + Math.sin(i * Math.PI / 3) * 0.28); blade.rotation.y = i * Math.PI / 3; } void fan; return; }
  if (kind === "motor") { addCylinder(0.34, 1.0, 0, 0.5, 0, 0, Math.PI / 2); addBox(0.2, 0.25, 0.18, -0.05, 0.9, 0); return; }
  if (kind === "vessel") { addCylinder(0.5, 1.25, 0, 0.7, 0); addCylinder(0.55, 0.12, 0, 1.34, 0); return; }
  if (kind === "panel") { addBox(0.9, 1.55, 0.22, 0, 0.78, 0); for (let i = 0; i < 3; i += 1) addBox(0.08, 0.12, 0.04, -0.22 + i * 0.22, 0.95, 0.14); return; }
  if (kind === "duct") { addBox(1.8, 0.45, 0.55, 0, 1.15, 0); addBox(0.42, 0.25, 0.25, 0.72, 0.82, 0); return; }
  if (kind === "window") { const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.7, 1.5, 0.08)), new THREE.LineBasicMaterial({ color: retrofit ? 0xd8a84e : 0x3fe0c9 })); frame.position.y = 0.85; group.add(frame); return; }
  addBox(1.15, 0.9, 0.8, 0, 0.5, 0);
  if (retrofit) addBox(1.3, 0.08, 0.95, 0, 0.98, 0);
  group.scale.copy(scale);
}

function TwinCanvas({ assetClass, width, depth, height, retrofit, mode }: { assetClass: string; width: number; depth: number; height: number; retrofit: number; mode: ViewMode }) {
  const host = useRef<HTMLDivElement>(null);
  const [fps, setFps] = useState(0);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040707);
    const camera = new THREE.PerspectiveCamera(42, Math.max(element.clientWidth, 1) / Math.max(element.clientHeight, 1), 0.01, 100);
    camera.position.set(Math.max(width, 2) * 1.35, Math.max(height, 2) * 1.1, Math.max(depth, 2) * 1.55);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(element.clientWidth, element.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.replaceChildren(renderer.domElement);

    const root = new THREE.Group();
    scene.add(root);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, depth), new THREE.MeshStandardMaterial({ color: 0x101817, roughness: 0.9 }));
    floor.position.y = -0.03;
    root.add(floor);
    const grid = new THREE.GridHelper(Math.max(width, depth) * 1.35, 24, 0x23413d, 0x102522);
    grid.position.y = 0.01;
    root.add(grid);

    const building = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)), new THREE.LineBasicMaterial({ color: 0x6aaea5, transparent: true, opacity: 0.35 }));
    building.position.y = height / 2;
    root.add(building);

    const kind = semanticKind(assetClass);
    const asset = new THREE.Group();
    const assetScale = new THREE.Vector3(Math.max(width / 5, 0.35), Math.max(height / 3, 0.35), Math.max(depth / 5, 0.35));
    addSemanticAsset(asset, kind, assetScale, mode === "retrofit");
    asset.position.set(0, 0, 0);
    root.add(asset);

    const retrofitLevel = Math.max(0, Math.min(100, retrofit));
    if (mode === "retrofit" && retrofitLevel > 0) {
      const layer = new THREE.Mesh(new THREE.BoxGeometry(width * 0.985, height * 0.985, depth * 0.985), new THREE.MeshBasicMaterial({ color: 0xd8a84e, wireframe: true, transparent: true, opacity: 0.08 + retrofitLevel / 900 }));
      layer.position.y = height / 2;
      root.add(layer);
      const marker = new THREE.Mesh(new THREE.TorusGeometry(Math.max(width, depth) * 0.17, 0.025, 10, 48), new THREE.MeshBasicMaterial({ color: 0xd8a84e, transparent: true, opacity: 0.75 }));
      marker.rotation.x = Math.PI / 2;
      marker.position.y = 0.04;
      root.add(marker);
    }

    const ambient = new THREE.HemisphereLight(0xbbeee8, 0x07100f, 1.7);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(4, 7, 5);
    scene.add(key);
    const rim = new THREE.PointLight(mode === "retrofit" ? 0xd8a84e : 0x3fe0c9, 3.2, 18);
    rim.position.set(-3, 3, -4);
    scene.add(rim);

    let raf = 0;
    let dragging = false;
    let px = 0;
    let py = 0;
    let theta = 0.55;
    let phi = 0.85;
    let radius = Math.max(width, depth, height) * 2.5;
    let frames = 0;
    let last = performance.now();
    const updateCamera = () => {
      const target = new THREE.Vector3(0, height * 0.38, 0);
      camera.position.set(target.x + Math.sin(theta) * Math.cos(phi) * radius, target.y + Math.sin(phi) * radius, target.z + Math.cos(theta) * Math.cos(phi) * radius);
      camera.lookAt(target);
    };
    updateCamera();
    const down = (event: PointerEvent) => { dragging = true; px = event.clientX; py = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); };
    const move = (event: PointerEvent) => { if (!dragging) return; theta -= (event.clientX - px) * 0.008; phi = Math.max(0.15, Math.min(1.35, phi + (event.clientY - py) * 0.006)); px = event.clientX; py = event.clientY; updateCamera(); };
    const up = () => { dragging = false; };
    const wheel = (event: WheelEvent) => { event.preventDefault(); radius = Math.max(Math.max(width, depth, height) * 1.2, Math.min(Math.max(width, depth, height) * 5.5, radius * (1 + event.deltaY * 0.0009))); updateCamera(); };
    renderer.domElement.addEventListener("pointerdown", down); renderer.domElement.addEventListener("pointermove", move); renderer.domElement.addEventListener("pointerup", up); renderer.domElement.addEventListener("pointercancel", up); renderer.domElement.addEventListener("wheel", wheel, { passive: false });
    const resize = () => { if (!host.current) return; camera.aspect = Math.max(host.current.clientWidth, 1) / Math.max(host.current.clientHeight, 1); camera.updateProjectionMatrix(); renderer.setSize(host.current.clientWidth, host.current.clientHeight); };
    window.addEventListener("resize", resize);
    const animate = (now: number) => { frames += 1; if (now - last > 1000) { setFps(Math.round(frames * 1000 / (now - last))); frames = 0; last = now; } renderer.render(scene, camera); raf = requestAnimationFrame(animate); };
    raf = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); renderer.domElement.removeEventListener("pointerdown", down); renderer.domElement.removeEventListener("pointermove", move); renderer.domElement.removeEventListener("pointerup", up); renderer.domElement.removeEventListener("pointercancel", up); renderer.domElement.removeEventListener("wheel", wheel); renderer.dispose(); element.replaceChildren(); };
  }, [assetClass, depth, height, mode, retrofit, width]);

  return <div ref={host} className="relative h-[430px] w-full overflow-hidden"><div className="pointer-events-none absolute left-4 top-4 z-10 flex gap-2 font-mono text-[7px] uppercase tracking-[.13em]"><span className="border border-teal/25 bg-black/55 px-2 py-1 text-teal">WebGL semantic twin</span><span className="border border-steel/20 bg-black/55 px-2 py-1 text-steel">{fps || "—"} FPS</span></div><div className="pointer-events-none absolute bottom-4 left-4 z-10 font-mono text-[7px] uppercase tracking-[.12em] text-steel">drag to orbit · wheel to zoom · {mode === "retrofit" ? `${retrofit}% retrofit counterfactual` : "observed state"}</div></div>;
}

export default function AssetTwinViewport({ scope, title, assetClass, evidenceIds, values, twin }: Props) {
  const [tab, setTab] = useState<"model" | "evidence">("model");
  const [mode, setMode] = useState<ViewMode>("current");
  const [retrofit, setRetrofit] = useState(45);
  const width = twin?.overall.widthM ?? n(values, "geometry_width_m", "width_m") ?? 4;
  const depth = twin?.overall.depthM ?? n(values, "geometry_depth_m", "depth_m") ?? 3;
  const height = twin?.overall.heightM ?? n(values, "geometry_height_m", "height_m") ?? 2.4;
  const asset: InteropAsset = useMemo(() => ({ id: "asset-core", name: title, scope, className: assetClass, widthM: width, depthM: depth, heightM: height, capacityKW: n(values, "capacity_kw"), powerKW: n(values, "power_kw"), evidenceIds }), [assetClass, depth, evidenceIds, height, scope, title, values, width]);
  const manifest = useMemo(() => buildInteropManifest(asset, values, twin), [asset, twin, values]);
  const safeName = title.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "overhaul-twin";
  const generated = Boolean(twin);
  const floorPlan = twin ? { rooms: twin.rooms, walls: twin.walls, assets: twin.assets } : { rooms: [], walls: [], assets: [] };

  return <section className="overflow-hidden border border-teal/20 bg-[#070b0b] shadow-[0_24px_100px_rgba(0,0,0,.22)]">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-steel/10 px-5 py-4"><div><p className="font-mono text-[8px] uppercase tracking-[.16em] text-teal">Reconstructed twin · semantic CAD bridge</p><h2 className="mt-1 font-display text-3xl">Evidence → geometry → retrofit counterfactual.</h2><p className="mt-1 max-w-3xl text-[10px] leading-5 text-steel">The viewport is now a live WebGL engineering representation. Geometry class changes with the detected asset instead of rendering every object as a generic box.</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={!generated} onClick={() => downloadText(`${safeName}.obj`, buildTwinObj(twin!), "text/plain;charset=utf-8")} className="border border-teal/30 px-3 py-2 font-mono text-[8px] uppercase text-teal disabled:opacity-30">Export OBJ</button><button type="button" disabled={!generated} onClick={() => downloadText(`${safeName}.dxf`, buildTwinDxf(twin!), "application/dxf")} className="border border-steel/25 px-3 py-2 font-mono text-[8px] uppercase text-paper disabled:opacity-30">Export DXF</button><button type="button" onClick={() => downloadText(`${safeName}.overhaul.json`, JSON.stringify(manifest, null, 2), "application/json")} className="border border-steel/25 px-3 py-2 font-mono text-[8px] uppercase text-paper">Twin manifest</button></div></div>
    <div className="grid gap-0 xl:grid-cols-[1fr_.75fr]"><div className="relative min-h-[430px] border-b border-steel/10 bg-[#040707] xl:border-b-0 xl:border-r"><TwinCanvas assetClass={assetClass} width={width} depth={depth} height={height} retrofit={retrofit} mode={mode} /></div>
      <aside className="p-5"><div className="grid grid-cols-2 gap-1 border border-steel/15 bg-black/20 p-1"><button type="button" onClick={() => setMode("current")} className={`px-3 py-2 font-mono text-[8px] uppercase ${mode === "current" ? "bg-teal text-navy" : "text-steel"}`}>Observed state</button><button type="button" onClick={() => setMode("retrofit")} className={`px-3 py-2 font-mono text-[8px] uppercase ${mode === "retrofit" ? "bg-clay text-navy" : "text-steel"}`}>Retrofit what-if</button></div>
        {mode === "retrofit" ? <div className="mt-4 border border-clay/20 bg-clay/5 p-3"><div className="flex justify-between font-mono text-[8px] uppercase text-steel"><span>Intervention intensity</span><span className="text-clay">{retrofit}%</span></div><input aria-label="Retrofit intensity" type="range" min="5" max="100" value={retrofit} onChange={(event) => setRetrofit(Number(event.target.value))} className="mt-3 w-full accent-[#d8a84e]"/><p className="mt-2 text-[8px] leading-4 text-steel">Visual counterfactual only. Engineering values remain governed by the evidence and physics pipeline.</p></div> : null}
        <div className="mt-4 flex border border-steel/15 bg-black/20 p-1"><button type="button" onClick={() => setTab("model")} className={`flex-1 px-3 py-2 font-mono text-[8px] uppercase ${tab === "model" ? "bg-teal text-navy" : "text-steel"}`}>Model telemetry</button><button type="button" onClick={() => setTab("evidence")} className={`flex-1 px-3 py-2 font-mono text-[8px] uppercase ${tab === "evidence" ? "bg-teal text-navy" : "text-steel"}`}>Evidence links</button></div>
        {tab === "model" ? <div className="mt-4 space-y-3"><Data label="Semantic class" value={`${semanticKind(assetClass)} · ${assetClass}`} /><Data label="Overall" value={`${width.toFixed(2)} × ${depth.toFixed(2)} × ${height.toFixed(2)} m`} /><Data label="Geometry basis" value={generated ? twin!.geometryBasis : "parametric evidence fallback"} /><Data label="Twin confidence" value={generated ? `${Math.round(twin!.confidence * 100)}%` : "pending reconstruction"} /><Data label="Topology" value={`${floorPlan.rooms.length} rooms · ${floorPlan.walls.length} walls · ${floorPlan.assets.length} assets`} />{twin?.warnings?.length ? <div className="border border-amber-200/20 bg-amber-200/[.025] p-3 text-[9px] leading-4 text-amber-100">{twin.warnings.slice(0, 4).map((warning, index) => <p key={index}>› {warning}</p>)}</div> : null}</div> : <div className="mt-4 space-y-2">{evidenceIds.map((id) => <div key={id} className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-teal">linked evidence</p><p className="mt-1 break-all text-[9px] text-paper">{id}</p></div>)}<p className="mt-4 text-[9px] leading-5 text-steel">Every promoted dimension remains traceable. Unknown measurements are not silently converted into precision claims.</p></div>}</aside></div>
    <div className="grid grid-cols-2 border-t border-steel/10 sm:grid-cols-4"><Data label="Representation" value="3D semantic" /><Data label="State pair" value="Observed ↔ What-if" /><Data label="Interaction" value="Orbit + zoom" /><Data label="Interop" value="OBJ · DXF · JSON" /></div>
  </section>;
}

function Data({ label, value }: { label: string; value: string }) { return <div className="border border-steel/10 p-3"><p className="font-mono text-[7px] uppercase text-steel">{label}</p><p className="mt-1 text-sm text-paper">{value}</p></div>; }
