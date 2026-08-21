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
  "tests/piper-bridge.test.js"
];

function fail(message) {
  console.error(`REPOSITORY_CHECK_FAIL: ${message}`);
  process.exitCode = 1;
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

const manifest = JSON.parse(read("extension/manifest.json"));
if (manifest.version !== "1.8.5") fail(`versão inesperada: ${manifest.version}`);
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
function scan(directory) {
  for (const name of readdirSync(directory)) {
    if (name === ".git") continue;
    const path = join(directory, name);
    const rel = relative(root, path);
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
