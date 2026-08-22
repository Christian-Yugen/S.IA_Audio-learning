import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const extension = join(root, "extension");
const requiredFiles = [
  "manifest.json",
  "content.js",
  "sync-engine.js",
  "dom-fallback.js",
  "popup.html",
  "popup.js",
  "service-worker.js",
  "offscreen.html",
  "offscreen.js",
  "neural-tts/piper-bridge.js",
  "neural-tts/piper-worker.js",
  "neural-tts/runtime/sherpa-onnx-wasm-main-tts.wasm",
  "tests/sync-engine.test.js",
  "tests/piper-bridge.test.js",
  "tests/offscreen.test.js",
  "platform-adapters/udemy/shaka-caption-bridge.js",
  "platform-adapters/udemy/udemy-host.js",
  "platform-adapters/udemy/udemy-adapter.js",
  "platform-adapters/udemy/udemy-adapter-contract.js"
];

function fail(message) {
  console.error(`REPOSITORY_CHECK_FAIL: ${message}`);
  process.exitCode = 1;
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

const manifest = JSON.parse(read("extension/manifest.json"));
if (!/^\d+\.\d+\.\d+$/.test(String(manifest.version || ""))) {
  fail(`versão semver inválida: ${manifest.version}`);
}
if (!manifest.permissions?.includes("offscreen")) fail("permissão offscreen ausente");
if (!manifest.content_security_policy?.extension_pages?.includes("wasm-unsafe-eval")) {
  fail("CSP sem wasm-unsafe-eval");
}
if (!manifest.content_scripts?.some((entry) => entry.js?.includes("neural-tts/piper-bridge.js"))) {
  fail("piper-bridge.js ausente do content script");
}
if (!manifest.web_accessible_resources?.some((entry) => entry.resources?.includes("neural-tts/piper-worker.js"))) {
  fail("Worker neural ausente dos recursos acessíveis");
}
if (!manifest.content_scripts?.some((entry) => entry.world === "MAIN" && entry.js?.includes("platform-adapters/udemy/shaka-caption-bridge.js"))) {
  fail("bridge H7 MAIN ausente do manifesto");
}

for (const file of requiredFiles) {
  if (!existsSync(join(root, "extension", file))) fail(`arquivo obrigatório ausente: extension/${file}`);
}

if (read("extension/popup.html").includes("piper-bridge.js")) {
  fail("popup.html não pode carregar piper-bridge.js");
}

const syncHash = createHash("sha256").update(read("extension/sync-engine.js")).digest("hex");
const expectedSyncHash = "8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a";
if (syncHash !== expectedSyncHash) fail(`hash inesperado no sync-engine.js: ${syncHash}`);

const forbiddenNames = new Set([".venv", "artifacts", "real-fixture", "dist", "profiles", "user-data"]);
const fixtureRoots = new Set(["fixtures/g7-udemy"]);
function scan(directory) {
  for (const name of readdirSync(directory)) {
    if (name === ".git") continue;
    const path = join(directory, name);
    const rel = relative(root, path);
    if (fixtureRoots.has(rel)) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (forbiddenNames.has(name)) fail(`diretório proibido presente: ${rel}`);
      else scan(path);
    } else if (/\.(zip|crx|mp4|webm|mov|wav|mp3|key|pem)$/.test(name)) {
      fail(`artefato proibido presente: ${rel}`);
    }
  }
}
scan(root);

if (process.exitCode) process.exit();
console.log("REPOSITORY_CHECK_OK");
console.log(`version=${manifest.version}`);
console.log(`sync-engine-sha256=${syncHash}`);
console.log("protected-architecture=ok");
