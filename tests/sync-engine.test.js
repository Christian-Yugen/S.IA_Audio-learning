"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    estimarDuracaoFala,
    calcularAjusteAdaptativo
} = require("../sync-engine.js");

test("estima uma duração mínima para textos curtos", () => {
    assert.equal(estimarDuracaoFala("Oi"), 0.6);
});

test("considera palavras e pontuação na duração", () => {
    const semPausa = estimarDuracaoFala("uma frase com quatro palavras");
    const comPausa = estimarDuracaoFala("uma frase, com quatro palavras.");
    assert.ok(comPausa > semPausa);
});

test("mantém a taxa base quando a cue tem tempo suficiente", () => {
    const resultado = calcularAjusteAdaptativo({
        texto: "Esta é uma legenda curta.",
        modo: "accelerate_voice",
        taxaBase: 1.2,
        taxaMaxima: 3.5,
        taxaVideo: 1,
        segundosMidia: 8
    });
    assert.equal(resultado.taxaFala, 1.2);
    assert.equal(resultado.ajustarVideo, false);
});

test("acelera a voz sem ultrapassar o limite configurado", () => {
    const resultado = calcularAjusteAdaptativo({
        texto: "Esta legenda contém muitas palavras e precisa ser pronunciada em pouquíssimo tempo.",
        modo: "accelerate_voice",
        taxaBase: 1.2,
        taxaMaxima: 3.5,
        taxaVideo: 1,
        segundosMidia: 0.5
    });
    assert.equal(resultado.taxaFala, 3.5);
});

test("reduz o vídeo e respeita o limite mínimo", () => {
    const resultado = calcularAjusteAdaptativo({
        texto: "Esta legenda contém muitas palavras e precisa de bastante tempo para ser pronunciada.",
        modo: "slow_video",
        taxaBase: 1,
        taxaVideo: 1,
        taxaVideoMinima: 0.55,
        segundosMidia: 0.5
    });
    assert.equal(resultado.taxaVideo, 0.55);
    assert.equal(resultado.ajustarVideo, true);
});

test("preserva uma velocidade personalizada quando não há atraso", () => {
    const resultado = calcularAjusteAdaptativo({
        texto: "Legenda curta.",
        modo: "slow_video",
        taxaBase: 1.5,
        taxaVideo: 1.25,
        taxaVideoMinima: 0.55,
        segundosMidia: 10
    });
    assert.equal(resultado.taxaVideo, 1.25);
    assert.equal(resultado.ajustarVideo, false);
});
