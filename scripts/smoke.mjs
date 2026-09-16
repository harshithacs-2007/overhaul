import { spawn } from "node:child_process";

const port = process.env.PORT || "3100";
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["start"], {
  env: { ...process.env, PORT: port, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });

function fail(message) {
  console.error(`SMOKE FAIL: ${message}`);
  if (output) console.error(output.slice(-6000));
  server.kill("SIGTERM");
  process.exit(1);
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail("production server did not become ready within 60 seconds");
}

async function assertPage(path) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) fail(`${path} returned HTTP ${response.status}`);
  const body = await response.text();
  if (!/OVERHAUL/i.test(body)) fail(`${path} rendered without the OVERHAUL shell`);
  console.log(`SMOKE PASS: ${path} -> ${response.status}`);
}

async function main() {
  await waitForServer();
  for (const path of ["/", "/assessment", "/validation", "/report", "/results"]) await assertPage(path);

  const twinForm = new FormData();
  twinForm.set("scope", "equipment");
  twinForm.set("className", "Centrifugal Pump");
  twinForm.set("industry", "industrial");
  twinForm.set("title", "Smoke Test Pump");
  twinForm.set("extracted", JSON.stringify({ supplemental: { geometry_width_m: 1.1, geometry_depth_m: 0.7, geometry_height_m: 0.95 } }));
  const twinResponse = await fetch(`${base}/api/model/generate`, { method: "POST", body: twinForm });
  if (!twinResponse.ok) fail(`/api/model/generate deterministic path returned HTTP ${twinResponse.status}`);
  const twinPayload = await twinResponse.json();
  if (twinPayload.generated !== "parametric" || twinPayload.model?.geometryStatus !== "verified-metric") fail("deterministic parametric twin path did not return verified metric geometry");
  console.log("SMOKE PASS: deterministic twin generation");

  const missingEvidence = await fetch(`${base}/api/evidence/extract`, { method: "POST", body: new FormData() });
  if (missingEvidence.status !== 400) fail(`/api/evidence/extract invalid-input guard returned HTTP ${missingEvidence.status}, expected 400`);
  console.log("SMOKE PASS: evidence API invalid-input guard");
}

main().catch((error) => fail(error instanceof Error ? error.message : "unknown smoke-test error"));
