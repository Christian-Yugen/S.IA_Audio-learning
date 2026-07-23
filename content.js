(() => {
    "use strict";

    const CONFIG = Object.freeze({
        intervaloMonitoramentoMs: 75,
        estabilidadeDomMs: 50,
        tamanhoMinimo: 4,
        idioma: "pt-BR",
        velocidadeMinima: 0.6,
        velocidadeMaxima: 3.5,
        velocidadeVideoMinima: 0.55,
        palavrasPorSegundo: 2.7
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
    let extensaoAtiva = true;
    let idiomaFala = CONFIG.idioma;
    let tomFala = 1;
    let volumeFala = 1;
    let vozSelecionada = "";
    let comportamentoSincronia = "accelerate_voice";
    let textoEmFala = "";
    let ultimoTextoDetectado = "";
    let textoCandidato = "";
    let candidatoDesde = 0;
    let geracaoDaFala = 0;
    let falaAtual = null;
    let textoPendente = null;
    let videoMonitorado = null;
    let taxaFalaEfetiva = velocidadeFala;
    let videoComVelocidadeAjustada = null;
    let velocidadeOriginalVideo = null;

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
        if (!video.textTracks) return null;

        const partes = [];
        let fimCue = 0;
        for (const track of video.textTracks) {
            if (track.kind !== "subtitles" && track.kind !== "captions") continue;

            const cues = track.activeCues;
            if (!cues) continue;

            for (const cue of cues) {
                const texto = normalizarTexto(cue.text);
                if (textoValidoDeLegenda(texto)) {
                    partes.push(texto);
                    fimCue = Math.max(fimCue, Number(cue.endTime) || 0);
                }
            }
        }

        const texto = normalizarTexto([...new Set(partes)].join(" "));
        return texto ? { texto, fimCue, video } : null;
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
            return { ...textoTrack, origem: "track" };
        }

        return { texto: obterLegendasDoDom(video), origem: "dom", video };
    }

    function estimarDuracaoFala(texto) {
        const palavras = normalizarTexto(texto).split(/\s+/).filter(Boolean).length;
        const pausas = (texto.match(/[,.!?;:]/g) || []).length;
        return Math.max(0.6, palavras / CONFIG.palavrasPorSegundo + pausas * 0.12);
    }

    function restaurarVelocidadeVideo() {
        if (videoComVelocidadeAjustada && velocidadeOriginalVideo !== null) {
            if (videoComVelocidadeAjustada.isConnected) {
                videoComVelocidadeAjustada.playbackRate = velocidadeOriginalVideo;
            }
        }
        videoComVelocidadeAjustada = null;
        velocidadeOriginalVideo = null;
    }

    function calcularAjusteSincronia(texto, contexto) {
        taxaFalaEfetiva = velocidadeFala;
        const video = contexto?.video;
        const fimCue = Number(contexto?.fimCue);
        if (!video || !fimCue || fimCue <= video.currentTime) return;

        const segundosDeMidia = Math.max(0.1, fimCue - video.currentTime);
        const duracaoNaTaxaUm = estimarDuracaoFala(texto);
        const taxaAtualVideo = video.playbackRate || 1;
        const segundosReaisDisponiveis = segundosDeMidia / taxaAtualVideo;

        if (comportamentoSincronia === "accelerate_voice") {
            const taxaNecessaria = duracaoNaTaxaUm / segundosReaisDisponiveis;
            taxaFalaEfetiva = Math.min(
                CONFIG.velocidadeMaxima,
                Math.max(velocidadeFala, taxaNecessaria)
            );
            return;
        }

        const duracaoFala = duracaoNaTaxaUm / velocidadeFala;
        if (duracaoFala <= segundosReaisDisponiveis) return;

        velocidadeOriginalVideo = taxaAtualVideo;
        videoComVelocidadeAjustada = video;
        video.playbackRate = Math.min(
            taxaAtualVideo,
            Math.max(CONFIG.velocidadeVideoMinima, segundosDeMidia / duracaoFala)
        );
    }

    function falar(texto, contexto = {}) {
        const valor = normalizarTexto(texto);
        if (!valor || !extensaoAtiva) return;

        // Não interrompe uma frase em andamento. Mantém apenas a legenda mais
        // recente na fila para evitar tanto cortes quanto atrasos acumulados.
        if (falaAtual || speechSynthesis.speaking || speechSynthesis.pending) {
            if (valor !== textoEmFala) textoPendente = { texto: valor, contexto };
            return;
        }

        restaurarVelocidadeVideo();
        calcularAjusteSincronia(valor, contexto);
        const minhaGeracao = ++geracaoDaFala;

        const utterance = new SpeechSynthesisUtterance(valor);
        utterance.lang = idiomaFala;
        utterance.rate = taxaFalaEfetiva;
        utterance.pitch = tomFala;
        utterance.volume = volumeFala;

        if (vozSelecionada) {
            const voz = speechSynthesis.getVoices().find(
                item => item.voiceURI === vozSelecionada || item.name === vozSelecionada
            );
            if (voz) utterance.voice = voz;
        }
        utterance.onend = utterance.onerror = () => {
            if (minhaGeracao !== geracaoDaFala) return;

            falaAtual = null;
            textoEmFala = "";
            restaurarVelocidadeVideo();

            const proximaLegenda = textoPendente;
            textoPendente = null;
            if (proximaLegenda) falar(proximaLegenda.texto, proximaLegenda.contexto);
        };

        falaAtual = utterance;
        textoEmFala = valor;
        speechSynthesis.speak(utterance);
    }

    function interromperFala() {
        geracaoDaFala++;
        falaAtual = null;
        textoEmFala = "";
        textoPendente = null;
        restaurarVelocidadeVideo();
        if (speechSynthesis.speaking || speechSynthesis.pending) {
            speechSynthesis.cancel();
        }
    }

    function observarLegenda() {
        if (!extensaoAtiva) return;

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
            interromperFala();
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
            falar(textoAtual, legenda);
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
        falar(textoAtual, legenda);
    }

    function aplicarConfiguracao(chave, valor) {
        switch (chave) {
            case "sia_enabled":
                extensaoAtiva = Boolean(valor);
                if (!extensaoAtiva) interromperFala();
                break;
            case "sia_voice":
                vozSelecionada = String(valor || "");
                break;
            case "sia_lang":
                idiomaFala = String(valor || CONFIG.idioma);
                break;
            case "sia_speed":
                velocidadeFala = Math.min(
                    CONFIG.velocidadeMaxima,
                    Math.max(CONFIG.velocidadeMinima, Number(valor) || 1.2)
                );
                break;
            case "sia_pitch":
                tomFala = Math.min(1.5, Math.max(0.5, Number(valor) || 1));
                break;
            case "sia_volume":
                volumeFala = Math.min(1, Math.max(0, Number(valor) / 100));
                break;
            case "sia_sync":
                comportamentoSincronia = String(valor || "accelerate_voice");
                if (comportamentoSincronia !== "slow_video") restaurarVelocidadeVideo();
                break;
        }
    }

    function conectarConfiguracoes() {
        const chaves = [
            "sia_enabled",
            "sia_voice",
            "sia_lang",
            "sia_speed",
            "sia_pitch",
            "sia_volume",
            "sia_sync"
        ];

        chrome.storage.local.get(chaves, configuracoes => {
            Object.entries(configuracoes).forEach(([chave, valor]) => {
                aplicarConfiguracao(chave, valor);
            });
        });

        chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
            if (mensagem?.type === "SIA_CONFIG_UPDATE") {
                aplicarConfiguracao(mensagem.key, mensagem.value);
                responder({ ok: true });
                return;
            }

            if (mensagem?.type === "SIA_GET_STATUS") {
                const video = document.querySelector("video");
                responder({
                    enabled: extensaoAtiva,
                    videoFound: Boolean(video),
                    paused: video?.paused ?? false,
                    ended: video?.ended ?? false,
                    captionActive: Boolean(ultimoTextoDetectado || textoEmFala),
                    syncMode: comportamentoSincronia,
                    effectiveSpeechRate: Number(taxaFalaEfetiva.toFixed(2)),
                    videoRate: Number((video?.playbackRate || 1).toFixed(2)),
                    videoRateAdjusted: video === videoComVelocidadeAjustada
                });
            }
        });
    }

    function iniciarSia() {
        conectarConfiguracoes();
        setInterval(observarLegenda, CONFIG.intervaloMonitoramentoMs);
        console.info("S.ia: leitor de legendas do Coursera ativo.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciarSia, { once: true });
    } else {
        iniciarSia();
    }
})();
