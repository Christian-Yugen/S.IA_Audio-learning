import test from "node:test";
import assert from "node:assert/strict";
import "../../learning/learning-engine.js";

const {
  TYPES,
  RATINGS,
  questionForType,
  createBookmark,
  createRecallCard,
  reviewCard,
  dueCards,
  progress,
} = globalThis.SiaLearningEngine;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 7, 26, 12, 0, 0);

function bookmark(overrides = {}) {
  return createBookmark({
    id: "mark-fixed",
    cue: {
      text: "Uma função transforma uma entrada em uma saída.",
      startTime: 135.4,
      endTime: 140.8,
    },
    platformId: "youtube",
    videoId: "abc123",
    url: "https://www.youtube.com/watch?v=abc123",
    title: "Aula de funções",
    course: "curso-teste",
    now: NOW,
    ...overrides,
  });
}

test("cria marcação temporal local com tipo e nota", () => {
  const value = bookmark({ type: TYPES.CONCEPT, note: "Revisar composição." });
  assert.equal(value.id, "mark-fixed");
  assert.equal(value.texto, "Uma função transforma uma entrada em uma saída.");
  assert.equal(value.inicio, 135.4);
  assert.equal(value.fim, 140.8);
  assert.equal(value.tipo, TYPES.CONCEPT);
  assert.equal(value.nota, "Revisar composição.");
  assert.equal(value.platformId, "youtube");
});

test("descarta marcação sem texto ou sem intervalo temporal", () => {
  assert.equal(bookmark({ cue: { text: "", startTime: 1, endTime: 2 } }), null);
  assert.equal(bookmark({ cue: { text: "texto", startTime: 2, endTime: 2 } }), null);
});

test("gera pergunta determinística por tipo de marcação", () => {
  assert.equal(questionForType(TYPES.IMPORTANT), "Qual é a ideia principal deste trecho?");
  assert.equal(questionForType(TYPES.NOT_UNDERSTOOD), "O que ainda não está claro neste trecho?");
  assert.equal(questionForType(TYPES.APPLY), "Como você usaria esta ideia em outro caso?");
});

test("cria cartão de recuperação vinculado ao timestamp", () => {
  const card = createRecallCard(bookmark({ type: TYPES.APPLY }), { now: NOW, id: "card-fixed" });
  assert.equal(card.id, "card-fixed");
  assert.equal(card.bookmarkId, "mark-fixed");
  assert.equal(card.pergunta, "Como você usaria esta ideia em outro caso?");
  assert.equal(card.proximaRevisaoEm, NOW);
  assert.equal(card.revisoes, 0);
});

test("primeira lembrança agenda revisão para o dia seguinte", () => {
  const card = createRecallCard(bookmark(), { now: NOW, id: "card-1" });
  const reviewed = reviewCard(card, RATINGS.REMEMBERED, { now: NOW });
  assert.equal(reviewed.ultimaAvaliacao, RATINGS.REMEMBERED);
  assert.equal(reviewed.repeticoes, 1);
  assert.equal(reviewed.intervaloDias, 1);
  assert.equal(reviewed.proximaRevisaoEm, NOW + DAY);
});

test("lembrança consecutiva amplia o intervalo de revisão", () => {
  const card = createRecallCard(bookmark(), { now: NOW, id: "card-2" });
  const first = reviewCard(card, RATINGS.REMEMBERED, { now: NOW });
  const second = reviewCard(first, RATINGS.REMEMBERED, { now: NOW + DAY });
  assert.equal(second.repeticoes, 2);
  assert.equal(second.intervaloDias, 3);
  assert.equal(second.proximaRevisaoEm, NOW + DAY + (3 * DAY));
});

test("esquecimento retorna a revisão para amanhã e registra lapso", () => {
  const card = createRecallCard(bookmark(), { now: NOW, id: "card-3" });
  const reviewed = reviewCard(card, RATINGS.FORGOT, { now: NOW + 5 * DAY });
  assert.equal(reviewed.repeticoes, 0);
  assert.equal(reviewed.lapsos, 1);
  assert.equal(reviewed.intervaloDias, 1);
  assert.equal(reviewed.proximaRevisaoEm, NOW + 6 * DAY);
});

test("lista cartões vencidos por data e respeita limite", () => {
  const first = createRecallCard(bookmark({ id: "mark-a" }), { now: NOW, id: "card-a" });
  const second = createRecallCard(bookmark({ id: "mark-b" }), { now: NOW + DAY, id: "card-b" });
  const future = createRecallCard(bookmark({ id: "mark-c" }), { now: NOW + 10 * DAY, id: "card-c" });
  const due = dueCards([future, second, first], { now: NOW + 2 * DAY, limit: 1 });
  assert.equal(due.length, 1);
  assert.equal(due[0].id, "card-a");
});

test("calcula evolução sem confundir tempo assistido com domínio", () => {
  const first = createRecallCard(bookmark({ id: "mark-a" }), { now: NOW, id: "card-a" });
  const second = createRecallCard(bookmark({ id: "mark-b" }), { now: NOW, id: "card-b" });
  const remembered = reviewCard(first, RATINGS.REMEMBERED, { now: NOW });
  const forgot = reviewCard(second, RATINGS.FORGOT, { now: NOW });
  const result = progress([remembered, forgot], { now: NOW + DAY });
  assert.deepEqual(result, {
    total: 2,
    revisados: 2,
    pendentes: 2,
    lembrados: 1,
    lapsos: 1,
    retencao: 0.5,
  });
});
