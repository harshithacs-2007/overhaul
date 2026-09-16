import { spawn } from "node:child_process";

const port = process.env.PORT || "3100";
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["start"], {
  env: { ...process.env, PORT: port, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
  detached: process.platform !== "win32",
});

let output = "";
let stopped = false;
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

function stopServer() {
  if (stopped) return;
  stopped = true;
  if (process.platform !== "win32" && server.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch {}
  } else {
    try { server.kill("SIGTERM"); } catch {}
  }
}

function fail(message) {
  console.error(`SMOKE FAIL: ${message}`);
  if (output) console.error(output.slice(-6000));
  stopServer();
  process.exit(1);
}

process.on("exit", stopServer);
process.on("SIGINT", () => { stopServer(); process.exit(130); });
process.on("SIGTERM", () => { stopServer(); process.exit(143); });

async function fetchWithTimeout(url, init = {}) {
  return fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(15_000) });
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(`${base}/`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail("production server did not become ready within 60 seconds");
}

async function assertPage(path) {
  const response = await fetchWithTimeout(`${base}${path}`);
  if (!response.ok) fail(`${path} returned HTTP ${response.status}`);
  const body = await response.text();
  if (!/OVERHAUL/i.test(body)) fail(`${path} rendered without the OVERHAUL shell`);
  console.log(`SMOKE PASS: ${path} -> ${response.status}`);
}

async function main() {
  try {
    await waitForServer();
    for (const path of ["/", "/assessment", "/validation", "/report", "/results"]) await assertPage(path);

    const twinForm = new FormData();
    twinForm.set("scope", "equipment");
    twinForm.set("className", "Centrifugal Pump");
    twinForm.set("industry", "industrial");
    twinForm.set("title", "Smoke Test Pump");
    twinForm.set("extracted", JSON.stringify({ supplemental: { geometry_width_m: 1.1, geometry_depth_m: 0.7, geometry_height_m: 0.95 } }));
    const twinResponse = await fetchWithTimeout(`${base}/api/model/generate`, { method: "POST", body: twinForm });
    if (!twinResponse.ok) fail(`/api/model/generate deterministic path returned HTTP ${twinResponse.status}`);
    const twinPayload = await twinResponse.json();
    if (twinPayload.generated !== "parametric" || twinPayload.model?.geometryStatus !== "verified-metric") fail("deterministic parametric twin path did not return verified metric geometry");
    console.log("SMOKE PASS: deterministic twin generation");

    const missingEvidence = await fetchWithTimeout(`${base}/api/evidence/extract`, { method: "POST", body: new FormData() });
    if (missingEvidence.status !== 400) fail(`/api/evidence/extract invalid-input guard returned HTTP ${missingEvidence.status}, expected 400`);
    console.log("SMOKE PASS: evidence API invalid-input guard");

    console.log("SMOKE COMPLETE: production HTTP surface is responding");
  } finally {
    stopServer();
  }
}

main().catch((error) => fail(error instanceof Error ? error.message : "unknown smoke-test error"));
