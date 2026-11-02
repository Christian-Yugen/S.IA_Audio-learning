import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = fs.readFileSync(new URL("../../platform-selection.js", import.meta.url), "utf8");

function loadSelection() {
  const context = vm.createContext({ console, URL });
  context.globalThis = context;
  vm.runInContext(source, context);
  return context.SiaPlatformSelection;
}

test("normaliza domínios de Coursera, Udemy e YouTube por site", () => {
  const selection = loadSelection();
  assert.equal(selection.hostKeyFromUrl("https://www.coursera.org/learn/test"), "coursera.org");
  assert.equal(selection.hostKeyFromUrl("https://sub.udemy.com/course/test"), "udemy.com");
  assert.equal(selection.hostKeyFromUrl("https://m.youtube.com/watch?v=abc"), "youtube.com");
  assert.equal(selection.platformForHost("www.youtube.com"), "youtube");
  assert.equal(selection.platformForHost("example.com"), "");
});

test("mantém o YouTube desligado por padrão e preserva o automático no Coursera/Udemy", () => {
  const selection = loadSelection();
  assert.equal(selection.defaultModeForUrl("https://www.youtube.com/watch?v=abc"), "off");
  assert.equal(selection.defaultModeForUrl("https://www.coursera.org/learn/test"), "auto");
  assert.equal(selection.defaultModeForUrl("https://www.udemy.com/course/a/learn/lecture/1"), "auto");
});

test("aceita a seleção manual quando o domínio corresponde", () => {
  const selection = loadSelection();
  const result = selection.describeSelection("https://www.youtube.com/watch?v=abc", "youtube");
  assert.equal(result.compatible, true);
  assert.equal(result.state, "manual");
  assert.equal(result.detected, "youtube");
});

test("bloqueia seleção manual incompatível sem tentar forçar outro adaptador", () => {
  const selection = loadSelection();
  const result = selection.describeSelection("https://www.coursera.org/learn/test", "youtube");
  assert.equal(result.compatible, false);
  assert.equal(result.state, "mismatch");
  assert.match(result.message, /YouTube.*Coursera/);
});

test("bloqueia rotas YouTube que não são páginas watch", () => {
  const selection = loadSelection();
  assert.equal(selection.isCompatible("https://www.youtube.com/shorts/abc123", "youtube"), false);
  assert.equal(selection.isCompatible("https://www.youtube.com/channel/abc", "youtube"), false);
  assert.equal(selection.isCompatible("https://www.youtube.com/watch?v=abc123", "youtube"), true);
});

test("modo automático reconhece somente plataformas suportadas", () => {
  const selection = loadSelection();
  assert.equal(selection.isCompatible("https://www.udemy.com/course/a/learn/lecture/1", "auto"), true);
  assert.equal(selection.isCompatible("https://example.com/course", "auto"), false);
});

test("modo desativado é compatível, mas informa que a S·IA não deve operar", () => {
  const selection = loadSelection();
  const result = selection.describeSelection("https://www.youtube.com/watch?v=abc", "off");
  assert.equal(result.compatible, true);
  assert.equal(result.state, "disabled");
  assert.equal(result.requested, "off");
});

test("valores desconhecidos não ativam uma plataforma arbitrária", () => {
  const selection = loadSelection();
  assert.equal(selection.normalizePlatform("hack"), "auto");
  assert.equal(selection.isCompatible("https://www.youtube.com/watch?v=abc", "hack"), true);
});


test("AI Guru tem seleção própria e automática sem ampliar acesso a outros domínios", () => {
  const s = loadSelection();
  const url = "https://www.ai-guru-academy.com/pt-br/fundamentos/how-to-read-this-catalog/?track=first-steps";
  assert.equal(s.platformForHost("www.ai-guru-academy.com"), "ai-guru");
  assert.equal(s.defaultModeForUrl(url), "auto");
  assert.equal(s.describeSelection(url, "ai-guru").compatible, true);
  assert.equal(s.isCompatible(url.replace("https:", "http:"), "ai-guru"), false);
  assert.equal(s.isCompatible(url.replace(".com/", ".com.evil/"), "ai-guru"), false);
  assert.equal(s.isCompatible("https://www.youtube.com/watch?v=test", "ai-guru"), false);
  assert.equal(s.isCompatible("https://www.ai-guru-academy.com/pt-br/trilhas/", "ai-guru"), false);
});
