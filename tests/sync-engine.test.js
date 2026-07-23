"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    estimarDuracaoFala,
    terminaComPontuacaoFinal,
    prepararTextoParaSintese,
    removerSobreposicaoInicial,
    calcularAjusteAdaptativo,
    calcularTaxaParaIntervalo
} = require("../sync-engine.js");

test("estima uma duração mínima para textos curtos", () => {
    assert.equal(estimarDuracaoFala("Oi"), 0.6);
});

test("considera palavras e pontuação na duração", () => {
    const semPausa = estimarDuracaoFala("uma frase com quatro palavras");
    const comPausa = estimarDuracaoFala("uma frase, com quatro palavras.");
    assert.ok(comPausa > semPausa);
});

test("distingue continuação de encerramento por pontuação", () => {
    assert.equal(terminaComPontuacaoFinal("esta frase continua"), false);
    assert.equal(terminaComPontuacaoFinal("esta frase terminou."), true);
    assert.equal(terminaComPontuacaoFinal("terminou?”"), true);
});

test("marca fragmentos sem pontuação como continuação prosódica", () => {
    assert.equal(prepararTextoParaSintese("a frase continua"), "a frase continua,");
    assert.equal(prepararTextoParaSintese("uma pausa,"), "uma pausa,");
    assert.equal(prepararTextoParaSintese("a frase terminou."), "a frase terminou.");
});

test("remove palavras repetidas entre o fim da fala e a nova cue", () => {
    assert.equal(
        removerSobreposicaoInicial(
            "Um erro pode ser um valor negativo ou um ponto de dados",
            "ou um ponto de dados que simplesmente não faz sentido."
        ),
        "que simplesmente não faz sentido."
    );
});

test("descarta uma cue totalmente repetida", () => {
    assert.equal(
        removerSobreposicaoInicial(
            "Os dados podem ser usados para análises preditivas.",
            "para análises preditivas."
        ),
        ""
    );
});

test("distribui a fala antecipada pelo intervalo completo da sentença", () => {
    const taxa = calcularTaxaParaIntervalo({
        texto: "Esta sentença deve ocupar aproximadamente todo o intervalo disponível.",
        taxaBase: 1,
        taxaMinima: 0.75,
        taxaMaxima: 3.5,
        taxaVideo: 1,
        segundosMidia: 8
    });
    assert.ok(taxa >= 0.75);
    assert.ok(taxa < 1);
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
