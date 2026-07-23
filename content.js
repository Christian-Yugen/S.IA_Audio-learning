(() => {
    "use strict";

    const CONFIG = Object.freeze({
        intervaloMonitoramentoMs: 75,
        estabilidadeDomMs: 50,
        tamanhoMinimo: 4,
        idioma: "pt-BR",
        velocidadeMinima: 0.6,
        velocidadeMaxima: 3.5,
        passoVelocidade: 0.2
    });

    const SELETORES_LEGENDA = [
        '[data-testid="video-captions"]',
        '[data-testid*="caption" i]',
        '[aria-live="polite"][class*="caption" i]',
        '.rc-VideoCaptions',
        '[class*="VideoCaptions"]',
        '[class*="caption-display" i]',
        '[class*="captions-container" i]',
        '[class*="subtitle-container" i]',
        '.shaka-text-container',
        '.vjs-text-track-display'
    ].join(",");

    const SELETORES_CONTROLE = [
        'button',
        '[role="button"]',
        '[role="slider"]',
        '[class*="control" i]',
        '[class*="progress" i]',
        '[class*="scrubber" i]',
        '[class*="seek" i]',
        '[class*="time-display" i]',
        '[data-testid*="control" i]'
    ].join(",");

    let velocidadeFala = 1.2;
    let textoEmFala = "";
    let ultimoTextoDetectado = "";
    let textoCandidato = "";
    let candidatoDesde = 0;
    let geracaoDaFala = 0;
    let falaAtual = null;
    let textoPendente = "";
    let videoMonitorado = null;
    let usuarioTestandoVoz = false;

    function normalizarTexto(valor) {
        return String(valor || "")
            .replace(/\u200B/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function pareceMarcacaoDeTempo(texto) {
        const valor = normalizarTexto(texto);

        // Exemplos rejeitados: 0:14, 0:14 / 2:21, 01:02:03 e -0:14.
        return /^-?\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*\/\s*-?\d{1,2}:\d{2}(?::\d{2})?)?\s*$/.test(valor)
            || (/^\s*[\d:./\s-]+\s*$/.test(valor) && valor.includes(":"));
    }

    function textoValidoDeLegenda(texto) {
        const valor = normalizarTexto(texto);
        if (valor.length < CONFIG.tamanhoMinimo || pareceMarcacaoDeTempo(valor)) {
            return false;
        }

        // Exige pelo menos duas letras Unicode; números e pontuação sozinhos não passam.
        const letras = valor.match(/\p{L}/gu);
        if (!letras || letras.length < 2) {
            return false;
        }

        // Evita textos típicos dos controles que eventualmente apareçam em aria-live.
        return !/^(play|pause|reproduzir|pausar|volume|mute|mudo|fullscreen|tela cheia)$/iu.test(valor);
    }

    function elementoVisivel(elemento) {
        if (!(elemento instanceof HTMLElement)) return false;
        const estilo = getComputedStyle(elemento);
        const retangulo = elemento.getBoundingClientRect();
        return estilo.display !== "none"
            && estilo.visibility !== "hidden"
            && Number(estilo.opacity) !== 0
            && retangulo.width > 0
            && retangulo.height > 0;
    }

    function obterLegendasDaTextTrack(video) {
        if (!video.textTracks) return "";

        const partes = [];
        for (const track of video.textTracks) {
            if (track.kind !== "subtitles" && track.kind !== "captions") continue;

            const cues = track.activeCues;
            if (!cues) continue;

            for (const cue of cues) {
                const texto = normalizarTexto(cue.text);
                if (textoValidoDeLegenda(texto)) partes.push(texto);
            }
        }

        return normalizarTexto([...new Set(partes)].join(" "));
    }

    function obterRaizDoPlayer(video) {
        return video.closest(
            '[data-testid*="video-player" i], [class*="video-player" i], ' +
            '[class*="videoPlayer"], .video-js, .shaka-video-container'
        ) || video.parentElement;
    }

    function obterLegendasDoDom(video) {
        const raiz = obterRaizDoPlayer(video);
        if (!raiz) return "";

        const candidatos = [...raiz.querySelectorAll(SELETORES_LEGENDA)]
            .filter(elemento => elementoVisivel(elemento))
            .filter(elemento => !elemento.closest(SELETORES_CONTROLE));

        const textos = [];
        for (const elemento of candidatos) {
            // Se há containers de legenda aninhados, usa somente o mais interno para
            // não repetir o mesmo diálogo duas ou três vezes.
            if (candidatos.some(outro => outro !== elemento && elemento.contains(outro))) {
                continue;
            }

            const texto = normalizarTexto(elemento.innerText || elemento.textContent);
            if (textoValidoDeLegenda(texto)) textos.push(texto);
        }

        return normalizarTexto([...new Set(textos)].join(" "));
    }

    function obterTextoAtual(video) {
        // activeCues não contém botões nem o relógio do player e tem prioridade.
        const textoTrack = obterLegendasDaTextTrack(video);
        if (textoTrack) {
            return { texto: textoTrack, origem: "track" };
        }

        return { texto: obterLegendasDoDom(video), origem: "dom" };
    }

    function falar(texto, opcoes = {}) {
        const valor = normalizarTexto(texto);
        if (!valor) return;

        // Não interrompe uma frase em andamento. Mantém apenas a legenda mais
        // recente na fila para evitar tanto cortes quanto atrasos acumulados.
        if (!opcoes.teste && (falaAtual || speechSynthesis.speaking || speechSynthesis.pending)) {
            if (valor !== textoEmFala) textoPendente = valor;
            return;
        }

        const minhaGeracao = ++geracaoDaFala;

        const utterance = new SpeechSynthesisUtterance(valor);
        utterance.lang = CONFIG.idioma;
        utterance.rate = velocidadeFala;
        utterance.onend = utterance.onerror = () => {
            if (minhaGeracao !== geracaoDaFala) return;

            falaAtual = null;
            textoEmFala = "";
            usuarioTestandoVoz = false;

            const proximoTexto = textoPendente;
            textoPendente = "";
            if (proximoTexto) falar(proximoTexto);
        };

        falaAtual = utterance;
        textoEmFala = opcoes.teste ? "" : valor;
        speechSynthesis.speak(utterance);
    }

    function interromperFala() {
        geracaoDaFala++;
        falaAtual = null;
        textoEmFala = "";
        textoPendente = "";
        usuarioTestandoVoz = false;
        if (speechSynthesis.speaking || speechSynthesis.pending) {
            speechSynthesis.cancel();
        }
    }

    function observarLegenda() {
        const video = document.querySelector("video");

        if (!video) {
            if (videoMonitorado) interromperFala();
            videoMonitorado = null;
            ultimoTextoDetectado = "";
            textoCandidato = "";
            return;
        }

        if (video !== videoMonitorado) {
            interromperFala();
            videoMonitorado = video;
            ultimoTextoDetectado = "";
            textoCandidato = "";
        }

        if (video.paused || video.ended) {
            if (!usuarioTestandoVoz) interromperFala();
            textoCandidato = "";
            return;
        }

        const legenda = obterTextoAtual(video);
        const textoAtual = legenda.texto;

        if (!textoAtual) {
            // O desaparecimento da cue não interrompe uma frase já iniciada.
            ultimoTextoDetectado = "";
            textoCandidato = "";
            return;
        }

        if (textoAtual === ultimoTextoDetectado) return;

        // TextTrack.activeCues já é uma fonte estável e pode ser falada no mesmo
        // ciclo. O DOM recebe apenas uma proteção mínima contra mutações parciais.
        if (legenda.origem === "track") {
            ultimoTextoDetectado = textoAtual;
            textoCandidato = "";
            falar(textoAtual);
            return;
        }

        const agora = performance.now();
        if (textoAtual !== textoCandidato) {
            textoCandidato = textoAtual;
            candidatoDesde = agora;
            return;
        }

        if (agora - candidatoDesde < CONFIG.estabilidadeDomMs) return;

        ultimoTextoDetectado = textoAtual;
        textoCandidato = "";
        falar(textoAtual);
    }

    function atualizarRotuloVelocidade() {
        const rotulo = document.getElementById("lectio-speed-label");
        if (rotulo) rotulo.textContent = velocidadeFala.toFixed(1);
    }

    function criarBotao(id, texto, titulo) {
        const botao = document.createElement("button");
        botao.id = id;
        botao.type = "button";
        botao.textContent = texto;
        botao.title = titulo;
        botao.style.cssText = [
            "background:#444",
            "color:#fff",
            "border:0",
            "padding:5px 9px",
            "border-radius:4px",
            "cursor:pointer",
            "font:inherit"
        ].join(";");
        return botao;
    }

    function criarPainelControle() {
        if (!document.body || document.getElementById("lectio-control-panel")) return;

        const painel = document.createElement("div");
        painel.id = "lectio-control-panel";
        painel.setAttribute("aria-label", "Controles do Lectio");
        painel.style.cssText = [
            "position:fixed",
            "right:20px",
            "bottom:20px",
            "z-index:2147483647",
            "display:flex",
            "align-items:center",
            "gap:9px",
            "padding:12px 14px",
            "border-radius:8px",
            "background:rgba(28,28,28,.95)",
            "box-shadow:0 4px 12px rgba(0,0,0,.4)",
            "color:#fff",
            "font:14px Arial,sans-serif"
        ].join(";");

        const titulo = document.createElement("span");
        titulo.append("Lectio (");
        const rotulo = document.createElement("span");
        rotulo.id = "lectio-speed-label";
        titulo.append(rotulo, "x)");

        const menos = criarBotao("lectio-menos", "−", "Diminuir velocidade");
        const mais = criarBotao("lectio-mais", "+", "Aumentar velocidade");
        const testar = criarBotao("lectio-testar", "Testar voz", "Testar sintetizador de voz");
        testar.style.background = "#e74c3c";
        testar.style.fontWeight = "bold";

        painel.append(titulo, menos, mais, testar);
        document.body.appendChild(painel);
        atualizarRotuloVelocidade();

        menos.addEventListener("click", () => {
            velocidadeFala = Math.max(
                CONFIG.velocidadeMinima,
                Number((velocidadeFala - CONFIG.passoVelocidade).toFixed(1))
            );
            atualizarRotuloVelocidade();
        });

        mais.addEventListener("click", () => {
            velocidadeFala = Math.min(
                CONFIG.velocidadeMaxima,
                Number((velocidadeFala + CONFIG.passoVelocidade).toFixed(1))
            );
            atualizarRotuloVelocidade();
        });

        testar.addEventListener("click", () => {
            interromperFala();
            usuarioTestandoVoz = true;
            falar("Lectio conectado às legendas do player do Coursera.", { teste: true });
        });
    }

    function iniciar() {
        criarPainelControle();
        setInterval(observarLegenda, CONFIG.intervaloMonitoramentoMs);
        console.info("Lectio TTS: leitor de legendas do Coursera ativo.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
