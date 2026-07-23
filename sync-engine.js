((root, factory) => {
    const api = factory();
    root.SiaSyncEngine = api;
    if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
    "use strict";

    function limitar(valor, minimo, maximo) {
        return Math.min(maximo, Math.max(minimo, valor));
    }

    function estimarDuracaoFala(texto, opcoes = {}) {
        const palavrasPorSegundo = Number(opcoes.palavrasPorSegundo) || 2.7;
        const segundosPorPausa = Number(opcoes.segundosPorPausa) || 0.12;
        const duracaoMinima = Number(opcoes.duracaoMinima) || 0.6;
        const normalizado = String(texto || "").trim();
        const palavras = normalizado ? normalizado.split(/\s+/).length : 0;
        const pausas = (normalizado.match(/[,.!?;:]/g) || []).length;
        return Math.max(duracaoMinima, palavras / palavrasPorSegundo + pausas * segundosPorPausa);
    }

    function terminaComPontuacaoFinal(texto) {
        return /[.!?…]["'”’)\]]*\s*$/u.test(String(texto || "").trim());
    }

    function prepararTextoParaSintese(texto) {
        const valor = String(texto || "").trim();
        if (
            terminaComPontuacaoFinal(valor)
            || /[,;:]["'”’)\]]*\s*$/u.test(valor)
        ) {
            return valor;
        }
        return `${valor},`;
    }

    function removerSobreposicaoInicial(textoAnterior, textoNovo) {
        const anterior = String(textoAnterior || "").trim();
        const novo = String(textoNovo || "").trim();
        if (!anterior || !novo) return novo;

        const palavrasAnteriores = anterior.split(/\s+/);
        const palavrasNovas = novo.split(/\s+/);
        const normalizarPalavra = palavra => palavra
            .toLocaleLowerCase()
            .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
        const anterioresNormalizadas = palavrasAnteriores.map(normalizarPalavra);
        const novasNormalizadas = palavrasNovas.map(normalizarPalavra);
        const limite = Math.min(palavrasAnteriores.length, palavrasNovas.length);

        for (let tamanho = limite; tamanho > 0; tamanho--) {
            const finalAnterior = anterioresNormalizadas.slice(-tamanho);
            const inicioNovo = novasNormalizadas.slice(0, tamanho);
            if (finalAnterior.every((palavra, indice) => palavra === inicioNovo[indice])) {
                return palavrasNovas.slice(tamanho).join(" ").trim();
            }
        }

        return novo;
    }

    function calcularAjusteAdaptativo(entrada) {
        const taxaBase = limitar(Number(entrada.taxaBase) || 1.2, 0.1, 10);
        const taxaMaxima = limitar(Number(entrada.taxaMaxima) || 3.5, taxaBase, 10);
        const taxaVideo = limitar(Number(entrada.taxaVideo) || 1, 0.1, 16);
        const taxaVideoMinima = limitar(Number(entrada.taxaVideoMinima) || 0.55, 0.1, taxaVideo);
        const segundosMidia = Math.max(0, Number(entrada.segundosMidia) || 0);
        const duracaoTaxaUm = estimarDuracaoFala(entrada.texto, entrada);
        const segundosReaisDisponiveis = segundosMidia > 0
            ? segundosMidia / taxaVideo
            : 0;

        const resultado = {
            taxaFala: taxaBase,
            taxaVideo,
            ajustarVideo: false,
            duracaoTaxaUm,
            segundosReaisDisponiveis
        };

        if (!segundosMidia || !segundosReaisDisponiveis) return resultado;

        if (entrada.modo === "accelerate_voice") {
            resultado.taxaFala = limitar(
                Math.max(taxaBase, duracaoTaxaUm / segundosReaisDisponiveis),
                taxaBase,
                taxaMaxima
            );
            return resultado;
        }

        const duracaoNaTaxaBase = duracaoTaxaUm / taxaBase;
        if (duracaoNaTaxaBase <= segundosReaisDisponiveis) return resultado;

        resultado.taxaVideo = limitar(
            segundosMidia / duracaoNaTaxaBase,
            taxaVideoMinima,
            taxaVideo
        );
        resultado.ajustarVideo = resultado.taxaVideo < taxaVideo - 0.01;
        return resultado;
    }

    function calcularTaxaParaIntervalo(entrada) {
        const taxaBase = limitar(Number(entrada.taxaBase) || 1.2, 0.1, 10);
        const taxaMinima = limitar(
            Number(entrada.taxaMinima) || taxaBase * 0.75,
            0.1,
            taxaBase
        );
        const taxaMaxima = limitar(Number(entrada.taxaMaxima) || 3.5, taxaBase, 10);
        const taxaVideo = limitar(Number(entrada.taxaVideo) || 1, 0.1, 16);
        const segundosMidia = Math.max(0, Number(entrada.segundosMidia) || 0);
        if (!segundosMidia) return taxaBase;

        const duracaoTaxaUm = estimarDuracaoFala(entrada.texto, entrada);
        const segundosReais = segundosMidia / taxaVideo;
        return limitar(duracaoTaxaUm / segundosReais, taxaMinima, taxaMaxima);
    }

    return Object.freeze({
        estimarDuracaoFala,
        terminaComPontuacaoFinal,
        prepararTextoParaSintese,
        removerSobreposicaoInicial,
        calcularAjusteAdaptativo,
        calcularTaxaParaIntervalo
    });
});
