"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const manifest = require("../manifest.json");

test("recursos acessíveis usam somente origem e caminho /* exigido pelo Chrome", () => {
  for (const entry of manifest.web_accessible_resources) {
    for (const pattern of entry.matches || []) {
      assert.match(pattern, /^https?:\/\/[^/]+\/\*$/, pattern);
    }
  }
});

test("injeção AI Guru continua restrita às páginas pt-br", () => {
  const entry = manifest.content_scripts.find(e => e.js.includes("platform-adapters/ai-guru/ai-guru-host.js"));
  assert.deepEqual(entry.matches, [
    "https://www.ai-guru-academy.com/pt-br/*",
    "https://ai-guru-academy.com/pt-br/*"
  ]);
});
