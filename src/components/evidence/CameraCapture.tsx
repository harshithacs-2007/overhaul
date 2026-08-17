"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import type { EvidenceCategory, EvidenceItem } from "@/lib/evidence/types";

type CamState =
  | "idle"
  | "requesting"
  | "live"
  | "denied"
  | "unavailable"
  | "error"
  | "captured";

async function uploadBlob(
  blob: Blob,
  filename: string,
  category: EvidenceCategory,
  source: "camera"
): Promise<EvidenceItem> {
  const form = new FormData();
  form.append("file", blob, filename);
  form.append("category", category);
  form.append("source", source);
  const res = await fetch("/api/evidence/upload", { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.message || json.error || "Upload failed");
  }
  return json.evidence as EvidenceItem;
}

export function CameraCapture({ onClose }: { onClose: () => void }) {
  const { addEvidence, setStatus, setCenterMode } = useWorkspace();
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camState, setCamState] = useState<CamState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [canSwitch, setCanSwitch] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [snapshotBlob, setSnapshotBlob] = useState<Blob | null>(null);
  const [category, setCategory] = useState<EvidenceCategory>("exterior");
  const [accepting, setAccepting] = useState(false);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopTracks();
    setCamState("requesting");
    setErrorMsg(null);
    setSnapshot(null);
    setSnapshotBlob(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("unavailable");
      setErrorMsg("Camera API is not available in this browser.");
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videos = devices.filter((d) => d.kind === "videoinput");
      setCanSwitch(videos.length > 1);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCamState("live");
      setStatus("Camera live");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setCamState("denied");
        setErrorMsg(
          "Camera permission was denied. Allow camera access or upload a file instead."
        );
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setCamState("unavailable");
        setErrorMsg(
          "No usable camera was found. Try again or upload a file instead."
        );
      } else {
        setCamState("error");
        setErrorMsg(err instanceof Error ? err.message : "Camera failed to start");
      }
    }
  }, [facingMode, setStatus, stopTracks]);

  // Camera must request media on mount and when facingMode changes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await startCamera();
    })();
    return () => {
      cancelled = true;
      stopTracks();
    };
  }, [startCamera, stopTracks]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || camState !== "live") return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrorMsg("Capture failed");
          return;
        }
        setSnapshotBlob(blob);
        setSnapshot(URL.createObjectURL(blob));
        setCamState("captured");
        setStatus("Frame captured — review before accepting");
      },
      "image/jpeg",
      0.92
    );
  };

  const retake = () => {
    if (snapshot) URL.revokeObjectURL(snapshot);
    setSnapshot(null);
    setSnapshotBlob(null);
    setCamState("live");
  };

  const accept = async () => {
    if (!snapshotBlob) return;
    setAccepting(true);
    try {
      const item = await uploadBlob(
        snapshotBlob,
        `capture_${Date.now()}.jpg`,
        category,
        "camera"
      );
      addEvidence(item);
      stopTracks();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Accept upload failed");
    } finally {
      setAccepting(false);
    }
  };

  const switchCamera = () => {
    setFacingMode((f) => (f === "environment" ? "user" : "environment"));
  };

  const close = () => {
    stopTracks();
    if (snapshot) URL.revokeObjectURL(snapshot);
    onClose();
  };

  return (
    <motion.div
      className="flex h-full flex-col"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduce ? undefined : { opacity: 0 }}
    >
      <div className="flex items-center justify-between border-b border-steel/20 px-4 py-3">
        <div>
          <h2 className="font-display text-xl text-paper">Scan with camera</h2>
          <p className="text-xs text-steel">Live capture enters the Evidence model</p>
        </div>
        <button
          type="button"
          onClick={close}
          className="border border-steel/30 px-3 py-1.5 text-xs text-steel hover:border-paper hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
        >
          Close
        </button>
      </div>

      <div className="relative flex-1 bg-black/40">
        <AnimatePresence mode="wait">
          {camState === "captured" && snapshot ? (
            <motion.img
              key="snap"
              src={snapshot}
              alt="Captured evidence frame"
              className="h-full w-full object-contain"
              initial={reduce ? false : { scale: 1.02, opacity: 0.6 }}
              animate={{ scale: 1, opacity: 1 }}
            />
          ) : (
            <video
              key="live"
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-contain"
              aria-label="Live camera preview"
            />
          )}
        </AnimatePresence>

        {(camState === "requesting" ||
          camState === "denied" ||
          camState === "unavailable" ||
          camState === "error") && (
          <div className="absolute inset-0 flex items-center justify-center bg-navy/80 p-6 text-center">
            <div className="max-w-sm space-y-3">
              <p className="font-display text-lg text-paper">
                {camState === "requesting" && "Requesting camera…"}
                {camState === "denied" && "Permission denied"}
                {camState === "unavailable" && "Camera unavailable"}
                {camState === "error" && "Camera error"}
              </p>
              {errorMsg ? <p className="text-sm text-steel">{errorMsg}</p> : null}
              {(camState === "denied" ||
                camState === "unavailable" ||
                camState === "error") && (
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => void startCamera()}
                    className="border border-teal px-4 py-2 text-sm text-teal hover:bg-teal/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopTracks();
                      setCenterMode("upload");
                    }}
                    className="border border-steel/40 px-4 py-2 text-sm text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                  >
                    Upload instead
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-steel/20 px-4 py-4">
        {errorMsg && camState === "captured" ? (
          <p className="text-xs text-clay" role="alert">
            {errorMsg}
          </p>
        ) : null}

        <label className="flex items-center gap-3 text-xs text-steel">
          <span className="uppercase tracking-[0.12em]">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as EvidenceCategory)}
            className="flex-1 border border-steel/30 bg-navy px-2 py-1.5 text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
          >
            {(
              [
                "exterior",
                "interior",
                "window",
                "roof",
                "hvac",
                "floor_plan",
                "energy_bill",
                "other",
              ] as EvidenceCategory[]
            ).map((c) => (
              <option key={c} value={c}>
                {c.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          {camState === "live" ? (
            <>
              <button
                type="button"
                onClick={capture}
                className="border border-gold bg-gold/10 px-5 py-2.5 text-sm text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              >
                Capture
              </button>
              {canSwitch ? (
                <button
                  type="button"
                  onClick={switchCamera}
                  className="border border-steel/30 px-4 py-2.5 text-sm text-steel hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
                >
                  Switch camera
                </button>
              ) : null}
            </>
          ) : null}
          {camState === "captured" ? (
            <>
              <button
                type="button"
                onClick={retake}
                className="border border-steel/40 px-4 py-2.5 text-sm text-steel focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              >
                Retake
              </button>
              <button
                type="button"
                disabled={accepting}
                onClick={() => void accept()}
                className="border border-teal bg-teal/10 px-5 py-2.5 text-sm text-teal disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
              >
                {accepting ? "Saving…" : "Accept"}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
