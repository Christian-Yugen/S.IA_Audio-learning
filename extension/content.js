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
        palavrasPorSegundo: 2.7,
        maximoCaracteresSemPonto: 280,
        maximoSegundosSemPonto: 3.0,
        maximoSegundosAntecipacao: 12,
        maximoCuesAntecipadas: 6,
        passoMaximoTaxaAdaptativa: 0.3,
        toleranciaTaxaAdaptativa: 0.15,
        pesoCalibracaoVoz: 0.2,
        janelaDeduplicacaoConcluidaMs: 5000,
        maximoHistoricoFrases: 60,
        maximoTranscricaoFrases: 10000
    });
    const MOTOR_SINCRONIA = globalThis.SiaSyncEngine;
    const MOTOR_APRENDIZAGEM = globalThis.SiaLearningEngine || null;
    const MOTOR_TRADUCAO = globalThis.SiaTranslationEngine?.create?.() || null;
    const PLATAFORMA_EXTERNA = ["www.udemy.com", "www.youtube.com", "m.youtube.com", "youtube.com"].includes(location.hostname.toLowerCase());
    const PLATAFORMA_EXTERNA_ID = location.hostname.toLowerCase().includes("youtube") ? "youtube" : "udemy";
    const PLATAFORMA_APRENDIZAGEM_ID = PLATAFORMA_EXTERNA ? PLATAFORMA_EXTERNA_ID : "coursera";
    let plataformaAtiva = true;
    let traducaoInglesAtiva = false;
    let geracaoTraducao = 0;
    let ultimoErroTraducao = "";
    let ultimaPreTraducaoEm = 0;
    let filaEntregaTraducao = Promise.resolve();
    let ultimoIdEntregaTraducao = 0;
    let videoEstavaPausado = false;
    let duckingAtivo = true;
    let duckingNivel = 0.0;
    let volumeBaseVideo = null;
    let duckingAnimId = null;
    let duckingHoldTimer = null;
    let duckingEmAndamento = false;

    const requestAnimFrame = typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : callback => setTimeout(() => callback(performance.now()), 16);
    const cancelAnimFrame = typeof cancelAnimationFrame === "function"
        ? cancelAnimationFrame
        : clearTimeout;

    function rampaVolumeVideo(video, volumeDestino, duracaoMs, aoConcluir = null) {
        if (!video || !Number.isFinite(video.volume)) return;
        if (duckingAnimId) {
            cancelAnimFrame(duckingAnimId);
            duckingAnimId = null;
        }
        const volumeInicial = video.volume;
        if (Math.abs(volumeInicial - volumeDestino) < 0.01 || duracaoMs <= 0) {
            video.volume = Math.max(0, Math.min(1, volumeDestino));
            aoConcluir?.();
            return;
        }
        const inicio = performance.now();
        let framesSemAvanco = 0;
        function frame(agora) {
            const decorrido = agora - inicio;
            if (decorrido <= 0) {
                framesSemAvanco++;
                if (framesSemAvanco > 2) {
                    video.volume = Math.max(0, Math.min(1, volumeDestino));
                    duckingAnimId = null;
                    aoConcluir?.();
                    return;
                }
            }
            const progresso = Math.min(1, Math.max(0, decorrido / duracaoMs));
            const fator = progresso * progresso * (3 - 2 * progresso);
            const atual = volumeInicial + (volumeDestino - volumeInicial) * fator;
            video.volume = Math.max(0, Math.min(1, atual));
            if (progresso < 1) {
                duckingAnimId = requestAnimFrame(frame);
            } else {
                duckingAnimId = null;
                aoConcluir?.();
            }
        }
        duckingAnimId = requestAnimFrame(frame);
    }

    function obterVideoParaDucking() {
        if (videoMonitorado) {
            if (typeof videoMonitorado.isConnected !== "boolean" || videoMonitorado.isConnected) {
                return videoMonitorado;
            }
        }
        if (typeof document !== "undefined" && typeof document.querySelector === "function") {
            const video = document.querySelector("video");
            if (video) {
                videoMonitorado = video;
                return video;
            }
        }
        return videoMonitorado;
    }

    function iniciarDucking() {
        if (!duckingAtivo) return;
        const video = obterVideoParaDucking();
        if (!video || !Number.isFinite(video.volume)) return;
        if (duckingHoldTimer) {
            clearTimeout(duckingHoldTimer);
            duckingHoldTimer = null;
        }
        duckingEmAndamento = true;
        if (volumeBaseVideo === null) {
            volumeBaseVideo = video.volume;
        }
        if (typeof video.addEventListener === "function") {
            video.addEventListener("pause", restaurarDuckingImediato);
            video.addEventListener("ended", restaurarDuckingImediato);
            video.addEventListener("seeking", restaurarDuckingImediato);
        }
        const volumeAlvo = Math.max(0, Math.min(volumeBaseVideo, volumeBaseVideo * duckingNivel));
        rampaVolumeVideo(video, volumeAlvo, volumeAlvo === 0 ? 40 : 100);
    }

    function agendarRestauracaoDucking() {
        if (!duckingAtivo) return;
        const video = obterVideoParaDucking();
        if (!video || volumeBaseVideo === null) return;
        duckingEmAndamento = false;
        if (duckingHoldTimer) {
            clearTimeout(duckingHoldTimer);
            duckingHoldTimer = null;
        }
        duckingHoldTimer = setTimeout(() => {
            duckingHoldTimer = null;
            if (duckingEmAndamento || volumeBaseVideo === null) return;
            const alvo = volumeBaseVideo;
            const videoAtual = obterVideoParaDucking();
            if (!videoAtual || !Number.isFinite(videoAtual.volume)) {
                volumeBaseVideo = null;
                return;
            }
            rampaVolumeVideo(videoAtual, alvo, 300, () => {
                if (!duckingEmAndamento) {
                    if (typeof videoAtual.removeEventListener === "function") {
                        videoAtual.removeEventListener("pause", restaurarDuckingImediato);
                        videoAtual.removeEventListener("ended", restaurarDuckingImediato);
                        videoAtual.removeEventListener("seeking", restaurarDuckingImediato);
                    }
                    volumeBaseVideo = null;
                }
            });
        }, 280);
    }

    function restaurarDuckingImediato() {
        duckingEmAndamento = false;
        if (duckingHoldTimer) {
            clearTimeout(duckingHoldTimer);
            duckingHoldTimer = null;
        }
        if (duckingAnimId) {
            cancelAnimFrame(duckingAnimId);
            duckingAnimId = null;
        }
        const video = obterVideoParaDucking();
        if (video) {
            if (typeof video.removeEventListener === "function") {
                video.removeEventListener("pause", restaurarDuckingImediato);
                video.removeEventListener("ended", restaurarDuckingImediato);
                video.removeEventListener("seeking", restaurarDuckingImediato);
            }
            if (volumeBaseVideo !== null && Number.isFinite(video.volume)) {
                video.volume = Math.max(0, Math.min(1, volumeBaseVideo));
            }
        }
        volumeBaseVideo = null;
    }

    function continuaSemPontuacaoFinal(texto) {
        const valor = String(texto || "").trim();
        return Boolean(valor) && !/[.!?,;:…]["'”’)\]]*\s*$/u.test(valor);
    }
    let removerEntradaDeCaption = () => {};

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
    let falaEnfileirada = null;
    let legendaReserva = null;
    let videoMonitorado = null;
    let taxaFalaEfetiva = velocidadeFala;
    let videoComVelocidadeAjustada = null;
    let velocidadeOriginalVideo = null;
    let velocidadeAplicadaVideo = null;
    let ultimoErroSintese = "";
    let sinteseBloqueada = false;
    let coberturaLegendaAte = 0;
    let ultimaPosicaoVideo = 0;
    let sentencaAntecipadaAtiva = false;
    let previsaoFimFilaEm = 0;
    let ultimaTaxaPlanejada = velocidadeFala;
    let fatorDuracaoVoz = 1;
    let atrasoFilaEstimado = 0;
    let erroInicioFila = 0;
    let ultimoTextoConcluido = "";
    let ultimoTextoConcluidoEm = 0;
    let legendaNeuralPrecarregada = null;
    let testeNeuralEmAndamento = false;
    let historicoFrases = [];
    let transcricaoFrases = [];
    let transcricaoCortada = false;
    let replayTranscricaoAtivo = null;
    const chaveHistorico = `sia_history_${location.pathname
        .replace(/[^a-z0-9]+/gi, "_")
        .slice(0, 120)}`;
    const chaveTranscricao = `${chaveHistorico}_transcript`;
    const chaveEstudo = `sia_learning_${PLATAFORMA_APRENDIZAGEM_ID}_${(
        new URL(location.href).searchParams.get("v") || location.pathname
    ).replace(/[^a-z0-9]+/gi, "_").slice(0, 140)}`;
    const chaveCartoesEstudo = `${chaveEstudo}_cards`;
    let marcacoesEstudo = [];
    let cartoesEstudo = [];
    let cueEstudoAtual = null;
    let estadoAprendizagemPronto = Promise.resolve();
    let bufferSentenca = {
        texto: "",
        inicioVideo: null,
        fragmentos: 0
    };

    function contextoExtensaoInvalidado(error) {
        return /extension context invalidated|context invalidated/i.test(
            String(error?.message || error || "")
        );
    }

    async function salvarStorageLocalSeguro(chave, valor) {
        try {
            await chrome.storage.local.set({ [chave]: valor });
            return true;
        } catch (error) {
            if (contextoExtensaoInvalidado(error)) {
                console.info("[S·IA] Aba antiga detectada; reabra o Coursera após atualizar a extensão.");
            } else {
                console.warn("[S·IA] Não foi possível salvar dados locais.", error);
            }
            return false;
        }
    }

    async function removerStorageLocalSeguro(chave) {
        try {
            await chrome.storage.local.remove(chave);
            return true;
        } catch (error) {
            if (contextoExtensaoInvalidado(error)) {
                console.info("[S·IA] Aba antiga detectada; reabra o Coursera após atualizar a extensão.");
            } else {
                console.warn("[S·IA] Não foi possível remover dados locais.", error);
            }
            return false;
        }
    }

    async function salvarEstadoAprendizagem() {
        if (!MOTOR_APRENDIZAGEM) return false;
        const okMarks = await salvarStorageLocalSeguro(chaveEstudo, marcacoesEstudo);
        const okCards = await salvarStorageLocalSeguro(chaveCartoesEstudo, cartoesEstudo);
        return okMarks && okCards;
    }

    async function carregarEstadoAprendizagem() {
        if (!MOTOR_APRENDIZAGEM) return;
        try {
            const resultado = await chrome.storage.local.get([chaveEstudo, chaveCartoesEstudo]);
            marcacoesEstudo = Array.isArray(resultado?.[chaveEstudo])
                ? resultado[chaveEstudo].slice(-200)
                : [];
            cartoesEstudo = Array.isArray(resultado?.[chaveCartoesEstudo])
                ? resultado[chaveCartoesEstudo].slice(-200)
                : [];
        } catch (error) {
            if (!contextoExtensaoInvalidado(error)) {
                console.warn("[S·IA] Não foi possível carregar o estudo local.", error);
            }
        }
    }

    function videoIdParaEstudo() {
        try {
            return new URL(location.href).searchParams.get("v") || "";
        } catch {
            return "";
        }
    }

    function contextoDaCueParaEstudo(cue) {
        return {
            cue: {
                text: cue?.text ?? cue?.texto,
                startTime: cue?.startTime ?? cue?.inicio,
                endTime: cue?.endTime ?? cue?.fim,
            },
            platformId: PLATAFORMA_APRENDIZAGEM_ID,
            videoId: videoIdParaEstudo(),
            url: location.href,
            title: document.title,
            course: location.pathname.match(/\/learn\/([^/]+)/)?.[1] || "",
        };
    }

    function normalizarTexto(valor) {
        return String(valor || "")
            .replace(/\u200B/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function emitirEventoH5(fase, registro, error = "") {
        const contexto = registro?.contexto || {};
        if (!["H5-native-udemy-texttrack", "H6-shared-udemy-texttrack", "H7-shaka-temporal-caption", "YT-temporal-caption-aggregated"].includes(contexto.gate)) return;
        if (typeof globalThis.dispatchEvent !== "function" || typeof globalThis.CustomEvent !== "function") return;
        try {
            globalThis.dispatchEvent(new globalThis.CustomEvent("SIA_H5_NATIVE_SPEECH", {
                detail: {
                    phase: fase,
                    engine: contexto.voiceEngine || "browser",
                    text: normalizarTexto(registro.texto).slice(0, 200),
                    startTime: Number(contexto.inicioCue),
                    endTime: Number(contexto.fimCue),
                    source: contexto.source || "texttrack",
                    sourceConfidence: contexto.sourceConfidence || "high",
                    error: String(error || "")
                }
            }));
        } catch {
            // Diagnóstico nunca pode interromper a fila comum.
        }
    }

    function registrarDiagnostico(evento, texto = "") {
        const piperStatus = globalThis.SiaPiperVoiceStatus?.() || {};
        console.info("[S·IA diagnóstico]", {
            evento,
            tempoVideo: Number((videoMonitorado?.currentTime || 0).toFixed(2)),
            texto: normalizarTexto(texto).slice(0, 160),
            speaking: speechSynthesis.speaking,
            pending: speechSynthesis.pending,
            paused: speechSynthesis.paused,
            falaAtual: Boolean(falaAtual),
            falaEnfileirada: Boolean(falaEnfileirada),
            reserva: Boolean(legendaReserva),
            voiceEngine: piperStatus.engine || "browser",
            voiceEngineState: piperStatus.state || "unavailable"
        });
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

    function terminaComPontuacaoFinal(texto) {
        if (MOTOR_SINCRONIA?.terminaComPontuacaoFinal) {
            return MOTOR_SINCRONIA.terminaComPontuacaoFinal(texto);
        }
        return /[.!?…]["'”’)\]]*\s*$/u.test(normalizarTexto(texto));
    }

    function prepararTextoParaSintese(texto) {
        const valor = normalizarTexto(texto);
        if (MOTOR_SINCRONIA?.prepararTextoParaSintese) {
            return MOTOR_SINCRONIA.prepararTextoParaSintese(valor);
        }
        if (terminaComPontuacaoFinal(valor) || /[,;:]["'”’)\]]*\s*$/u.test(valor)) {
            return valor;
        }

        // A vírgula informa ao motor de voz que o bloco continua. Como a próxima
        // utterance já está pré-carregada, isso reduz a entonação de encerramento
        // sem antecipar conteúdo que ainda não apareceu no vídeo.
        return `${valor},`;
    }

    function unirFragmentosSemRepetir(textoAtual, novoFragmento) {
        const atual = normalizarTexto(textoAtual);
        const novo = normalizarTexto(novoFragmento);
        if (!atual) return novo;
        if (!novo || atual === novo || atual.endsWith(novo)) return atual;
        if (novo.startsWith(atual)) return novo;

        const palavrasAtuais = atual.split(" ");
        const palavrasNovas = novo.split(" ");
        const limite = Math.min(palavrasAtuais.length, palavrasNovas.length);

        for (let tamanho = limite; tamanho > 0; tamanho--) {
            const finalAtual = palavrasAtuais.slice(-tamanho).join(" ").toLocaleLowerCase();
            const inicioNovo = palavrasNovas.slice(0, tamanho).join(" ").toLocaleLowerCase();
            if (finalAtual === inicioNovo) {
                return normalizarTexto(
                    [...palavrasAtuais, ...palavrasNovas.slice(tamanho)].join(" ")
                );
            }
        }

        return normalizarTexto(`${atual} ${novo}`);
    }

    function limparBufferSentenca() {
        bufferSentenca = {
            texto: "",
            inicioVideo: null,
            fragmentos: 0
        };
    }

    function liberarBufferSentenca(contexto = {}) {
        const texto = normalizarTexto(bufferSentenca.texto);
        const quantidadeFragmentos = bufferSentenca.fragmentos;
        limparBufferSentenca();
        if (!texto) return;

        // A sentença foi construída ao longo de várias cues. O tempo restante
        // da última cue não representa sua duração total, então não deve forçar
        // uma aceleração extrema para "recuperar" o trecho já transcorrido.
        falar(texto, {
            ...contexto,
            fimCue: quantidadeFragmentos === 1 ? contexto.fimCue : 0
        });
    }

    function processarFragmentoDeSentenca(texto, contexto = {}) {
        limparBufferSentenca();
        falar(texto, contexto);
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

    function detectarLinhaPorIdioma(linhas, idiomaAlvo = "pt-BR") {
        if (!Array.isArray(linhas) || !linhas.length) return "";
        const validas = linhas.map(normalizarTexto).filter(textoValidoDeLegenda);
        if (!validas.length) return "";
        if (validas.length === 1) return validas[0];

        const querPt = /^pt/i.test(idiomaAlvo);
        const querEn = /^en/i.test(idiomaAlvo);

        const pontuarLinha = texto => {
            let scorePt = 0;
            let scoreEn = 0;

            const acentosPt = (texto.match(/[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]/g) || []).length;
            scorePt += acentosPt * 3;

            const palavrasPt = (texto.match(/\b(o|a|os|as|um|uma|de|do|da|dos|das|em|no|na|nos|nas|por|para|com|que|e|é|se|não|ao|à|como|mas|mais|ou|são|este|esta|isso|esse|essa|você|ele|ela|eles|elas|nós|muito|também|sua|seu|suas|seus|então|portanto|quando|onde|pelo|pela|pelos|pelas)\b/gi) || []).length;
            scorePt += palavrasPt * 2;

            const palavrasEn = (texto.match(/\b(the|and|to|of|in|is|are|that|it|with|as|for|was|on|at|by|from|this|these|those|you|we|they|or|an|be|have|has|had|not|but|what|all|were|when|so|next|split|into|will|can)\b/gi) || []).length;
            scoreEn += palavrasEn * 2;

            return { scorePt, scoreEn };
        };

        if (querPt) {
            let melhor = validas[0];
            let melhorDiff = -Infinity;
            for (const linha of validas) {
                const { scorePt, scoreEn } = pontuarLinha(linha);
                const diff = scorePt - scoreEn;
                if (diff > melhorDiff) {
                    melhorDiff = diff;
                    melhor = linha;
                }
            }
            if (melhorDiff > 0) return melhor;
        } else if (querEn) {
            let melhor = validas[0];
            let melhorDiff = -Infinity;
            for (const linha of validas) {
                const { scorePt, scoreEn } = pontuarLinha(linha);
                const diff = scoreEn - scorePt;
                if (diff > melhorDiff) {
                    melhorDiff = diff;
                    melhor = linha;
                }
            }
            if (melhorDiff > 0) return melhor;
        }

        return validas[0];
    }

    function comporSentencaDeCues(cuesBase, todasAsCues, tempoFallback = 0) {
        let texto = "";
        let fimCue = 0;
        let inicioCue = Number.POSITIVE_INFINITY;
        for (const cue of cuesBase || []) {
            let fragmentoBruto = String(cue?.text || "");
            let fragmento = normalizarTexto(fragmentoBruto);
            if (fragmentoBruto.includes("\n")) {
                const partes = fragmentoBruto.split(/\r?\n+/);
                fragmento = detectarLinhaPorIdioma(partes, idiomaFala) || fragmento;
            }
            if (textoValidoDeLegenda(fragmento)) {
                texto = unirFragmentosSemRepetir(texto, fragmento);
                fimCue = Math.max(fimCue, Number(cue?.endTime) || 0);
                inicioCue = Math.min(inicioCue, Number(cue?.startTime) || tempoFallback);
            }
        }

        if (!texto) return null;

        const fimCueAtiva = fimCue;
        let cuesAntecipadas = 0;
        const futuras = (todasAsCues || []).filter(cue =>
            Number(cue?.startTime) >= fimCueAtiva - 0.04
        );

        for (const cue of futuras) {
            if (terminaComPontuacaoFinal(texto)) break;
            if (cuesAntecipadas >= CONFIG.maximoCuesAntecipadas) break;
            if ((Number(cue?.endTime) || fimCue) - inicioCue > (CONFIG.maximoSegundosAntecipacao || 12)) {
                break;
            }

            let fragmentoBruto = String(cue?.text || "");
            let fragmento = normalizarTexto(fragmentoBruto);
            if (fragmentoBruto.includes("\n")) {
                const partes = fragmentoBruto.split(/\r?\n+/);
                fragmento = detectarLinhaPorIdioma(partes, idiomaFala) || fragmento;
            }
            if (!textoValidoDeLegenda(fragmento)) continue;

            const combinado = unirFragmentosSemRepetir(texto, fragmento);
            if (combinado.length > CONFIG.maximoCaracteresSemPonto) break;

            texto = combinado;
            fimCue = Math.max(fimCue, Number(cue?.endTime) || 0);
            cuesAntecipadas++;
        }

        return {
            texto,
            inicioCue,
            fimCue,
            sentencaAntecipada: cuesAntecipadas > 0
        };
    }

    function obterLegendasDaTextTrack(video) {
        if (!video.textTracks) return null;

        for (const track of video.textTracks) {
            if (track.kind !== "subtitles" && track.kind !== "captions") continue;

            const cuesAtivas = [...(track.activeCues || [])];
            if (!cuesAtivas.length) continue;

            const composta = comporSentencaDeCues(cuesAtivas, [...(track.cues || [])], video.currentTime);
            if (!composta) continue;

            return {
                ...composta,
                video
            };
        }

        return null;
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

        const linhasColetadas = [];
        for (const elemento of candidatos) {
            // Se há containers de legenda aninhados, usa somente o mais interno para
            // não repetir o mesmo diálogo duas ou três vezes.
            if (candidatos.some(outro => outro !== elemento && elemento.contains(outro))) {
                continue;
            }

            // Separa por quebras de linha existentes (div, p, br ou \n) para que
            // traduções automáticas bilíngues (PT e EN) não sejam coladas juntas.
            const textoBruto = elemento.innerText || elemento.textContent || "";
            const pedacos = textoBruto.split(/\r?\n+/);
            for (const pedaco of pedacos) {
                const texto = normalizarTexto(pedaco);
                if (textoValidoDeLegenda(texto)) {
                    linhasColetadas.push(texto);
                }
            }
        }

        const linhasUnicas = [...new Set(linhasColetadas)];
        if (!linhasUnicas.length) return "";

        return detectarLinhaPorIdioma(linhasUnicas, idiomaFala);
    }

    const SELETORES_CONTAINER_TRANSCRICAO = [
        '.rc-Transcript',
        '[data-testid*="transcript" i]',
        '[class*="transcript-content" i]',
        '[class*="transcriptContent" i]',
        '[class*="Transcript" i]',
        '[class*="transcript" i]',
        '[aria-label*="transcript" i]',
        '[aria-label*="transcri" i]',
        '[id*="transcript" i]'
    ].join(",");

    const SELETORES_FRASE_ATIVA_TRANSCRICAO = [
        '.rc-TranscriptHighlight',
        '[class*="TranscriptHighlight" i]',
        '[class*="transcript-highlight" i]',
        '[class*="transcriptHighlight" i]',
        '[class*="active-phrase" i]',
        '[class*="activePhrase" i]',
        '[class*="current-phrase" i]',
        '[class*="currentPhrase" i]',
        '[aria-current="true"]',
        '[aria-current="step"]',
        'span[class*="phrase" i][class*="active" i]',
        'span[class*="phrase" i][class*="highlight" i]',
        '[data-testid*="transcript-cue" i][class*="active" i]',
        '[data-testid*="transcript-cue" i][class*="highlight" i]',
        '[class*="is-highlighted" i]',
        '[class*="highlighted" i]'
    ].join(",");

    function formatarTextoTranscricao(textoBruto) {
        if (!textoBruto) return "";
        let texto = normalizarTexto(textoBruto).replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*/, "");
        if (textoBruto.includes("\n") || texto.includes(". ")) {
            const partes = textoBruto.includes("\n")
                ? textoBruto.split(/\r?\n+/)
                : texto.split(/(?<=[.!?…])\s+(?=[A-Z\p{Lu}])/u);
            texto = detectarLinhaPorIdioma(partes, idiomaFala) || texto;
        }
        return normalizarTexto(texto).replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*/, "");
    }

    function obterFraseAtivaDaTranscricao(video) {
        const container = document.querySelector(SELETORES_CONTAINER_TRANSCRICAO);
        if (!container || !elementoVisivel(container)) return null;

        const candidatoAtivo = container.querySelector(SELETORES_FRASE_ATIVA_TRANSCRICAO);
        if (!candidatoAtivo || !elementoVisivel(candidatoAtivo)) return null;

        const textoBruto = candidatoAtivo.innerText || candidatoAtivo.textContent || "";
        const texto = formatarTextoTranscricao(textoBruto);

        if (!textoValidoDeLegenda(texto)) return null;

        let inicioCue = video.currentTime;
        try {
            const bloco = candidatoAtivo.closest('[class*="Paragraph" i], [class*="paragraph" i], [class*="row" i], li') || candidatoAtivo.parentElement;
            const botaoTempo = bloco?.querySelector('button, [class*="time" i], [class*="timestamp" i]');
            const textoTempo = normalizarTexto(botaoTempo?.innerText || botaoTempo?.textContent || "");
            const match = textoTempo.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (match) {
                if (match[3]) {
                    inicioCue = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
                } else {
                    inicioCue = Number(match[1]) * 60 + Number(match[2]);
                }
            }
        } catch {}

        const duracaoEstimada = Math.max(1.5, texto.split(/\s+/).length / CONFIG.palavrasPorSegundo);
        return {
            texto,
            origem: "transcript",
            video,
            inicioCue,
            fimCue: inicioCue + duracaoEstimada,
            elementoAtivo: candidatoAtivo
        };
    }

    function obterProximasFrasesDaTranscricao(elementoAtivo, limite = 3) {
        if (!elementoAtivo) return [];
        const container = elementoAtivo.closest(SELETORES_CONTAINER_TRANSCRICAO);
        if (!container) return [];

        const resultados = [];
        const visitados = new Set();
        visitados.add(elementoAtivo);

        // 1. Tenta o próximo irmão direto (dentro do mesmo parágrafo)
        let proximo = elementoAtivo.nextElementSibling;
        while (proximo && resultados.length < limite) {
            const texto = formatarTextoTranscricao(proximo.innerText || proximo.textContent || "");
            if (textoValidoDeLegenda(texto) && !resultados.includes(texto)) {
                resultados.push(texto);
                visitados.add(proximo);
            }
            proximo = proximo.nextElementSibling;
        }

        // 2. Se for a última frase do bloco atual, busca no próximo parágrafo
        const blocoAtual = elementoAtivo.closest('[class*="Paragraph" i], [class*="paragraph" i], [class*="row" i], li') || elementoAtivo.parentElement;
        let proximoBloco = blocoAtual?.nextElementSibling;
        while (proximoBloco && resultados.length < limite) {
            const candidatas = proximoBloco.querySelectorAll('.rc-Phrase, span[class*="phrase" i], [class*="phrase" i], p, span');
            for (const cand of candidatas) {
                if (cand.closest('button, [class*="time" i], [class*="timestamp" i]')) continue;
                if (visitados.has(cand)) continue;
                const texto = formatarTextoTranscricao(cand.innerText || cand.textContent || "");
                if (textoValidoDeLegenda(texto) && !resultados.includes(texto)) {
                    resultados.push(texto);
                    visitados.add(cand);
                    if (resultados.length >= limite) break;
                }
            }
            proximoBloco = proximoBloco.nextElementSibling;
        }

        // 3. Fallback: lista linear de todas as frases do container
        if (resultados.length < limite) {
            const todasAsFrases = [...container.querySelectorAll('.rc-Phrase, span[class*="phrase" i], [class*="phrase" i], [class*="TranscriptHighlight" i], span, p')]
                .filter(el => {
                    if (el.children.length > 2) return false;
                    if (el.closest('button, [class*="time" i], [class*="timestamp" i]')) return false;
                    const txt = formatarTextoTranscricao(el.innerText || el.textContent || "");
                    return textoValidoDeLegenda(txt);
                });

            const indice = todasAsFrases.indexOf(elementoAtivo);
            if (indice >= 0) {
                for (let i = indice + 1; i < todasAsFrases.length && resultados.length < limite; i++) {
                    const txt = formatarTextoTranscricao(todasAsFrases[i].innerText || todasAsFrases[i].textContent || "");
                    if (textoValidoDeLegenda(txt) && !resultados.includes(txt)) {
                        resultados.push(txt);
                    }
                }
            }
        }
        return normalizarTexto(texto).replace(/^\s*\d{1,2}:\d{2}(?::\d{2})?\s*/, "");
    }

    function obterFraseAtivaDaTranscricao(video) {
        const container = document.querySelector(SELETORES_CONTAINER_TRANSCRICAO);
        if (!container || !elementoVisivel(container)) return null;

        const candidatoAtivo = container.querySelector(SELETORES_FRASE_ATIVA_TRANSCRICAO);
        if (!candidatoAtivo || !elementoVisivel(candidatoAtivo)) return null;

        const textoBruto = candidatoAtivo.innerText || candidatoAtivo.textContent || "";
        const texto = formatarTextoTranscricao(textoBruto);

        if (!textoValidoDeLegenda(texto)) return null;

        let inicioCue = video.currentTime;
        try {
            const bloco = candidatoAtivo.closest('[class*="Paragraph" i], [class*="paragraph" i], [class*="row" i], li') || candidatoAtivo.parentElement;
            const botaoTempo = bloco?.querySelector('button, [class*="time" i], [class*="timestamp" i]');
            const textoTempo = normalizarTexto(botaoTempo?.innerText || botaoTempo?.textContent || "");
            const match = textoTempo.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (match) {
                if (match[3]) {
                    inicioCue = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
                } else {
                    inicioCue = Number(match[1]) * 60 + Number(match[2]);
                }
            }
        } catch {}

        const duracaoEstimada = Math.max(1.5, texto.split(/\s+/).length / CONFIG.palavrasPorSegundo);
        return {
            texto,
            origem: "transcript",
            video,
            inicioCue,
            fimCue: inicioCue + duracaoEstimada,
            elementoAtivo: candidatoAtivo
        };
    }

    function obterProximasFrasesDaTranscricao(elementoAtivo, limite = 3) {
        if (!elementoAtivo) return [];
        const container = elementoAtivo.closest(SELETORES_CONTAINER_TRANSCRICAO);
        if (!container) return [];

        const resultados = [];
        const visitados = new Set();
        visitados.add(elementoAtivo);

        // 1. Tenta o próximo irmão direto (dentro do mesmo parágrafo)
        let proximo = elementoAtivo.nextElementSibling;
        while (proximo && resultados.length < limite) {
            const texto = formatarTextoTranscricao(proximo.innerText || proximo.textContent || "");
            if (textoValidoDeLegenda(texto) && !resultados.includes(texto)) {
                resultados.push(texto);
                visitados.add(proximo);
            }
            proximo = proximo.nextElementSibling;
        }

        // 2. Se for a última frase do bloco atual, busca no próximo parágrafo
        const blocoAtual = elementoAtivo.closest('[class*="Paragraph" i], [class*="paragraph" i], [class*="row" i], li') || elementoAtivo.parentElement;
        let proximoBloco = blocoAtual?.nextElementSibling;
        while (proximoBloco && resultados.length < limite) {
            const candidatas = proximoBloco.querySelectorAll('.rc-Phrase, span[class*="phrase" i], [class*="phrase" i], p, span');
            for (const cand of candidatas) {
                if (cand.closest('button, [class*="time" i], [class*="timestamp" i]')) continue;
                if (visitados.has(cand)) continue;
                const texto = formatarTextoTranscricao(cand.innerText || cand.textContent || "");
                if (textoValidoDeLegenda(texto) && !resultados.includes(texto)) {
                    resultados.push(texto);
                    visitados.add(cand);
                    if (resultados.length >= limite) break;
                }
            }
            proximoBloco = proximoBloco.nextElementSibling;
        }

        // 3. Fallback: lista linear de todas as frases do container
        if (resultados.length < limite) {
            const todasAsFrases = [...container.querySelectorAll('.rc-Phrase, span[class*="phrase" i], [class*="phrase" i], [class*="TranscriptHighlight" i], span, p')]
                .filter(el => {
                    if (el.children.length > 2) return false;
                    if (el.closest('button, [class*="time" i], [class*="timestamp" i]')) return false;
                    const txt = formatarTextoTranscricao(el.innerText || el.textContent || "");
                    return textoValidoDeLegenda(txt);
                });

            const indice = todasAsFrases.indexOf(elementoAtivo);
            if (indice >= 0) {
                for (let i = indice + 1; i < todasAsFrases.length && resultados.length < limite; i++) {
                    const txt = formatarTextoTranscricao(todasAsFrases[i].innerText || todasAsFrases[i].textContent || "");
                    if (textoValidoDeLegenda(txt) && !resultados.includes(txt)) {
                        resultados.push(txt);
                    }
                }
            }
        }

        return resultados;
    }

    function obterProximaFraseDaTranscricao(elementoAtivo) {
        const proximas = obterProximasFrasesDaTranscricao(elementoAtivo, 1);
        return proximas[0] || null;
    }

    function obterTextoAtual(video) {
        // 1. Transcrição oficial ativa do Coursera (tem a marcação mais precisa e estável de frases)
        const textoTranscricao = obterFraseAtivaDaTranscricao(video);
        if (textoTranscricao) {
            return textoTranscricao;
        }

        // 2. activeCues não contém botões nem o relógio do player e tem prioridade sobre o DOM do player.
        const textoTrack = obterLegendasDaTextTrack(video);
        if (textoTrack) {
            return { ...textoTrack, origem: "track" };
        }

        // 3. Fallback para as legendas flutuantes do player no DOM
        const textoDom = obterLegendasDoDom(video);
        const duracaoEstimada = Math.max(1.5, textoDom.split(/\s+/).length / CONFIG.palavrasPorSegundo);
        return {
            texto: textoDom,
            origem: "dom",
            video,
            inicioCue: video.currentTime,
            fimCue: video.currentTime + duracaoEstimada
        };
    }

    function obterLegendaAtivaParaPrecache(video) {
        const fraseTranscricao = obterFraseAtivaDaTranscricao(video);
        if (fraseTranscricao) return fraseTranscricao;

        if (!video?.textTracks) return null;

        for (const track of video.textTracks) {
            if (track.kind !== "subtitles" && track.kind !== "captions") continue;
            const ativas = [...(track.activeCues || [])];
            const fimCue = Math.max(
                0,
                ...ativas.map(cue => Number(cue.endTime) || 0)
            );
            if (fimCue > 0) return { origem: "track", fimCue, video };
        }
        return null;
    }

    function precacheFraseNeural(textoOriginal, contexto = {}) {
        const provider = globalThis.SiaPiperVoice;
        if (!provider?.isActive?.() || !extensaoAtiva) return;
        const originalNormalizado = normalizarTexto(textoOriginal);
        if (!textoValidoDeLegenda(originalNormalizado)) return;

        const taxaBase = Number(contexto.rate) || velocidadeFala;

        if (traducaoInglesAtiva && MOTOR_TRADUCAO) {
            void MOTOR_TRADUCAO.translate(originalNormalizado, {
                sourceLanguage: "en",
                targetLanguage: "pt-BR"
            }).then(traduzido => {
                if (!traduzido?.text || !extensaoAtiva) return;
                const textoParaSintese = traduzido.text;
                const utterance = {
                    text: prepararTextoParaSintese(textoParaSintese),
                    lang: idiomaFala,
                    rate: taxaBase,
                    pitch: tomFala,
                    volume: volumeFala,
                    voice: null,
                    silenceScale: continuaSemPontuacaoFinal(textoParaSintese) ? 0.08 : 0.2
                };
                const precache = {
                    texto: textoParaSintese,
                    textoOriginal: originalNormalizado,
                    origem: contexto.origem || "precache",
                    inicioCue: contexto.inicioCue,
                    fimCue: contexto.fimCue,
                    rate: utterance.rate,
                    silenceScale: utterance.silenceScale
                };
                legendaNeuralPrecarregada = precache;
                void Promise.resolve(provider.primeText?.(utterance)).then(ok => {
                    if (ok === false && legendaNeuralPrecarregada === precache) {
                        legendaNeuralPrecarregada = null;
                    }
                });
            }).catch(() => {});
            return;
        }

        const utterance = {
            text: prepararTextoParaSintese(originalNormalizado),
            lang: idiomaFala,
            rate: taxaBase,
            pitch: tomFala,
            volume: volumeFala,
            voice: null,
            silenceScale: continuaSemPontuacaoFinal(originalNormalizado) ? 0.08 : 0.2
        };
        const precache = {
            texto: originalNormalizado,
            textoOriginal: originalNormalizado,
            origem: contexto.origem || "precache",
            inicioCue: contexto.inicioCue,
            fimCue: contexto.fimCue,
            rate: utterance.rate,
            silenceScale: utterance.silenceScale
        };
        legendaNeuralPrecarregada = precache;
        void Promise.resolve(provider.primeText?.(utterance)).then(ok => {
            if (ok === false && legendaNeuralPrecarregada === precache) {
                legendaNeuralPrecarregada = null;
            }
        });
    }

    function precacheProximaLegendaNeural(video, legendaAtual) {
        const provider = globalThis.SiaPiperVoice;
        if (!provider?.isActive?.()) return;

        // Pré-carregamento para a próxima frase da transcrição do Coursera
        if (legendaAtual?.origem === "transcript" && legendaAtual.elementoAtivo) {
            const proximas = obterProximasFrasesDaTranscricao(legendaAtual.elementoAtivo, 2);
            const proximoTexto = proximas[0];
            if (proximoTexto && proximoTexto !== legendaAtual.texto) {
                if (proximas[1] && traducaoInglesAtiva && MOTOR_TRADUCAO?.prime) {
                    MOTOR_TRADUCAO.prime(proximas[1], { sourceLanguage: "en", targetLanguage: "pt-BR" });
                }
                precacheFraseNeural(proximoTexto, {
                    origem: "transcript",
                    rate: velocidadeFala
                });
                return;
            }
        }

        if (legendaAtual?.origem !== "track") return;

        const fimAtualInformado = Number(legendaAtual.fimCue) || 0;
        if (!fimAtualInformado || !video?.textTracks) return;

        for (const track of video.textTracks) {
            if (track.kind !== "subtitles" && track.kind !== "captions") continue;
            const fimCueAtiva = Math.max(
                0,
                ...[...(track.activeCues || [])].map(cue => Number(cue.endTime) || 0)
            );
            const fimAtual = Math.max(fimCueAtiva, coberturaLegendaAte, fimAtualInformado);
            const todasAsCues = [...(track.cues || [])].sort((a, b) => Number(a.startTime) - Number(b.startTime));
            const proximas = todasAsCues.filter(cue =>
                Number(cue.startTime) >= fimAtual - 0.04
            );
            const proximaInicial = proximas.find(cue =>
                textoValidoDeLegenda(normalizarTexto(cue.text))
                && Number(cue.startTime) > fimAtual - 0.04
            );
            if (!proximaInicial) continue;

            const composta = comporSentencaDeCues([proximaInicial], todasAsCues, Number(proximaInicial.startTime) || video.currentTime);
            if (!composta) continue;

            const texto = composta.texto;
            const inicioCue = composta.inicioCue;
            const fimCue = composta.fimCue;
            const contexto = {
                // Calcula a taxa no instante em que a cue deve começar, não no
                // instante em que a cue anterior foi detectada.
                video: {
                    currentTime: inicioCue,
                    playbackRate: video.playbackRate || 1
                },
                inicioCue,
                fimCue,
                sentencaAntecipada: composta.sentencaAntecipada,
                inicioPrevistoEm: Math.max(performance.now(), previsaoFimFilaEm)
            };
            const taxa = calcularTaxaAntecipada(texto, contexto);
            precacheFraseNeural(texto, {
                origem: "track",
                inicioCue,
                fimCue,
                rate: taxa
            });
            return;
        }
    }

    function reconciliarPrevisaoFilaAposFimReal() {
        if (falaEnfileirada) return;
        previsaoFimFilaEm = performance.now();
        atrasoFilaEstimado = 0;
        ultimaTaxaPlanejada = velocidadeFala;
    }

    function criarEntradaHistorico(registro) {
        const video = registro.contexto?.video || videoMonitorado;
        const inicio = Number(registro.contexto?.inicioCue);
        const fim = Number(registro.contexto?.fimCue);
        return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            texto: registro.texto,
            textoOriginal: registro.contexto?.originalText || "",
            traduzido: Boolean(registro.contexto?.translated),
            inicio: Number.isFinite(inicio) ? inicio : Number(video?.currentTime) || 0,
            fim: Number.isFinite(fim) && fim > 0 ? fim : Number(video?.currentTime) || 0,
            url: location.href,
            titulo: document.title,
            curso: location.pathname.match(/\/learn\/([^/]+)/)?.[1] || "coursera",
            criadoEm: Date.now(),
            favorito: false,
            nota: ""
        };
    }

    async function registrarFraseNoHistorico(registro) {
        const entrada = criarEntradaHistorico(registro);
        const ultima = historicoFrases.at(-1);
        if (
            ultima
            && ultima.texto === entrada.texto
            && Math.abs(ultima.inicio - entrada.inicio) < 0.25
        ) {
            return;
        }

        historicoFrases.push(entrada);
        historicoFrases = historicoFrases.slice(-CONFIG.maximoHistoricoFrases);
        transcricaoFrases.push({ ...entrada });
        if (transcricaoFrases.length > CONFIG.maximoTranscricaoFrases) {
            transcricaoFrases = transcricaoFrases.slice(-CONFIG.maximoTranscricaoFrases);
            transcricaoCortada = true;
        }
        await Promise.all([
            salvarStorageLocalSeguro(chaveHistorico, historicoFrases),
            salvarStorageLocalSeguro(chaveTranscricao, transcricaoFrases),
        ]);
    }

    async function criarMarcacaoEstudo({ type, note } = {}) {
        await estadoAprendizagemPronto;
        if (!MOTOR_APRENDIZAGEM || !cueEstudoAtual) {
            return { ok: false, reason: "no-temporal-cue" };
        }
        const existente = marcacoesEstudo.find(item =>
            item.texto === cueEstudoAtual.text
            && Math.abs(Number(item.inicio) - Number(cueEstudoAtual.startTime)) < 0.08
            && Math.abs(Number(item.fim) - Number(cueEstudoAtual.endTime)) < 0.08
        );
        if (existente) {
            return { ok: true, duplicate: true, bookmark: existente, card: cartoesEstudo.find(card => card.bookmarkId === existente.id) || null };
        }
        const bookmark = MOTOR_APRENDIZAGEM.createBookmark({
            ...contextoDaCueParaEstudo(cueEstudoAtual),
            type,
            note,
        });
        if (!bookmark) return { ok: false, reason: "invalid-bookmark" };
        const card = MOTOR_APRENDIZAGEM.createRecallCard(bookmark);
        marcacoesEstudo = [bookmark, ...marcacoesEstudo].slice(0, 200);
        if (card) cartoesEstudo = [card, ...cartoesEstudo].slice(0, 200);
        await salvarEstadoAprendizagem();
        return { ok: true, bookmark, card };
    }

    async function avaliarCartaoEstudo(cardId, rating, answer = "") {
        await estadoAprendizagemPronto;
        if (!MOTOR_APRENDIZAGEM) return { ok: false, reason: "learning-engine-unavailable" };
        const index = cartoesEstudo.findIndex(card => card.id === cardId);
        if (index < 0) return { ok: false, reason: "card-not-found" };
        const updated = MOTOR_APRENDIZAGEM.reviewCard(cartoesEstudo[index], rating, { answer });
        if (!updated) return { ok: false, reason: "invalid-review" };
        cartoesEstudo[index] = updated;
        await salvarEstadoAprendizagem();
        return { ok: true, card: updated };
    }

    function repetirMarcacaoEstudo(id = "") {
        const mark = marcacoesEstudo.find(item => item.id === id);
        const video = document.querySelector("video");
        if (!mark || !video) return false;
        interromperFala();
        ultimoTextoDetectado = "";
        textoCandidato = "";
        cueEstudoAtual = null;
        video.currentTime = Math.max(0, Number(mark.inicio) - 0.05);
        void video.play();
        return true;
    }

    function contextoAprendizagem() {
        const now = Date.now();
        return {
            ok: true,
            enabled: Boolean(MOTOR_APRENDIZAGEM),
            currentCue: cueEstudoAtual,
            bookmarks: marcacoesEstudo,
            cards: cartoesEstudo,
            dueCards: MOTOR_APRENDIZAGEM?.dueCards?.(cartoesEstudo, { now, limit: 20 }) || [],
            progress: MOTOR_APRENDIZAGEM?.progress?.(cartoesEstudo, { now }) || null,
        };
    }

    function transcricaoAulaLocal() {
        if (!MOTOR_APRENDIZAGEM?.createTranscript) {
            return { ok: false, reason: "transcript-engine-unavailable" };
        }
        const transcricao = MOTOR_APRENDIZAGEM.createTranscript(transcricaoFrases);
        return {
            ok: true,
            transcricao,
            parcial: transcricaoCortada,
            fonte: "historico-local-integral",
            titulo: document.title,
            url: location.href,
        };
    }

    function obterTrechosTemporaisSegurosDaTranscricao() {
        if (!MOTOR_APRENDIZAGEM?.createTranscript) return [];
        const entradasSeguras = (Array.isArray(transcricaoFrases) ? transcricaoFrases : [])
            .filter(entrada => {
                const texto = normalizarTexto(entrada?.texto ?? entrada?.text);
                const inicio = Number(entrada?.inicio);
                const fim = Number(entrada?.fim);
                return Boolean(texto)
                    && Number.isFinite(inicio)
                    && Number.isFinite(fim)
                    && fim > inicio;
            });
        return MOTOR_APRENDIZAGEM.createTranscript(entradasSeguras).trechos || [];
    }

    function cancelarReplayTranscricao() {
        const replay = replayTranscricaoAtivo;
        if (!replay) return false;
        replayTranscricaoAtivo = null;
        for (const [evento, listener] of Object.entries(replay.listeners || {})) {
            replay.video.removeEventListener?.(evento, listener);
        }
        return true;
    }

    function repetirTranscricaoNoVideo() {
        const video = document.querySelector("video");
        const trechos = obterTrechosTemporaisSegurosDaTranscricao();
        const primeiro = trechos[0];
        const ultimo = trechos.at(-1);
        const inicio = Number(primeiro?.inicio);
        const fim = Number(ultimo?.fim);
        if (!video) return { ok: false, reason: "video-not-found" };
        if (
            !primeiro
            || !ultimo
            || !Number.isFinite(inicio)
            || !Number.isFinite(fim)
            || fim <= inicio
        ) {
            return { ok: false, reason: "transcript-timing-unavailable" };
        }

        interromperFala();
        ultimoTextoDetectado = "";
        textoCandidato = "";
        cueEstudoAtual = null;
        coberturaLegendaAte = 0;
        const inicioRevisao = Math.max(0, inicio - 0.05);
        const replay = {
            video,
            inicioRevisao,
            limite: fim + 0.35,
            ignorarBuscaInicial: true,
            listeners: {},
        };
        const finalizarNoLimite = () => {
            if (replayTranscricaoAtivo !== replay) return;
            cancelarReplayTranscricao();
            if (Number.isFinite(replay.video.duration) && replay.video.duration > 0) {
                replay.video.currentTime = Math.min(replay.limite, replay.video.duration);
            }
            replay.video.pause?.();
            interromperFala();
        };
        replay.listeners.timeupdate = () => {
            if (Number(replay.video.currentTime) >= replay.limite) finalizarNoLimite();
        };
        replay.listeners.pause = () => {
            if (replayTranscricaoAtivo === replay) cancelarReplayTranscricao();
        };
        replay.listeners.ended = () => {
            if (replayTranscricaoAtivo === replay) cancelarReplayTranscricao();
        };
        replay.listeners.emptied = () => {
            if (replayTranscricaoAtivo === replay) {
                cancelarReplayTranscricao();
                interromperFala();
            }
        };
        replay.listeners.seeking = () => {
            if (replayTranscricaoAtivo !== replay) return;
            if (
                replay.ignorarBuscaInicial
                && Math.abs(Number(replay.video.currentTime) - replay.inicioRevisao) < 0.2
            ) {
                replay.ignorarBuscaInicial = false;
                return;
            }
            cancelarReplayTranscricao();
            interromperFala();
            ultimoTextoDetectado = "";
            textoCandidato = "";
        };
        replayTranscricaoAtivo = replay;
        for (const [evento, listener] of Object.entries(replay.listeners)) {
            replay.video.addEventListener?.(evento, listener);
        }
        try {
            replay.video.currentTime = inicioRevisao;
        } catch {
            cancelarReplayTranscricao();
            return { ok: false, reason: "video-seek-failed" };
        }
        try {
            const promessaPlay = replay.video.play?.();
            if (promessaPlay && typeof promessaPlay.catch === "function") {
                promessaPlay.catch(() => {
                    if (replayTranscricaoAtivo === replay) cancelarReplayTranscricao();
                });
            }
        } catch {
            cancelarReplayTranscricao();
            return { ok: false, reason: "video-play-failed" };
        }
        return {
            ok: true,
            reason: "transcript-replay-started",
            inicio: inicioRevisao,
            fim,
            totalFrases: trechos.length,
        };
    }

    function repetirEntradaHistorico(id = "") {
        const entrada = id
            ? historicoFrases.find(item => item.id === id)
            : historicoFrases.at(-1);
        const video = document.querySelector("video");
        if (!entrada || !video) return false;

        interromperFala();
        ultimoTextoDetectado = "";
        textoCandidato = "";
        video.currentTime = Math.max(0, entrada.inicio - 0.05);
        void video.play();
        return true;
    }

    function observarAlteracaoManualDeVelocidade() {
        if (!videoComVelocidadeAjustada || velocidadeAplicadaVideo === null) return;
        if (Math.abs(videoComVelocidadeAjustada.playbackRate - velocidadeAplicadaVideo) < 0.01) {
            return;
        }

        // O usuário mudou a velocidade no player. Essa escolha passa a ter
        // prioridade e não será sobrescrita quando a fala terminar.
        videoComVelocidadeAjustada.removeEventListener(
            "ratechange",
            observarAlteracaoManualDeVelocidade
        );
        videoComVelocidadeAjustada = null;
        velocidadeOriginalVideo = null;
        velocidadeAplicadaVideo = null;
    }

    function restaurarVelocidadeVideo() {
        if (videoComVelocidadeAjustada && velocidadeOriginalVideo !== null) {
            videoComVelocidadeAjustada.removeEventListener(
                "ratechange",
                observarAlteracaoManualDeVelocidade
            );
            if (videoComVelocidadeAjustada.isConnected) {
                videoComVelocidadeAjustada.playbackRate = velocidadeOriginalVideo;
            }
        }
        videoComVelocidadeAjustada = null;
        velocidadeOriginalVideo = null;
        velocidadeAplicadaVideo = null;
    }

    function calcularAjusteSincronia(texto, contexto) {
        taxaFalaEfetiva = velocidadeFala;
        const video = contexto?.video;
        const fimCue = Number(contexto?.fimCue);
        if (!MOTOR_SINCRONIA || !video || !fimCue || fimCue <= video.currentTime) return;

        const ajuste = MOTOR_SINCRONIA.calcularAjusteAdaptativo({
            texto,
            modo: comportamentoSincronia,
            taxaBase: velocidadeFala,
            taxaMaxima: CONFIG.velocidadeMaxima,
            taxaVideo: video.playbackRate || 1,
            taxaVideoMinima: CONFIG.velocidadeVideoMinima,
            segundosMidia: fimCue - video.currentTime,
            palavrasPorSegundo: CONFIG.palavrasPorSegundo
        });

        taxaFalaEfetiva = ajuste.taxaFala;
        if (!ajuste.ajustarVideo) return;

        velocidadeOriginalVideo = video.playbackRate || 1;
        videoComVelocidadeAjustada = video;
        velocidadeAplicadaVideo = ajuste.taxaVideo;
        video.addEventListener(
            "ratechange",
            observarAlteracaoManualDeVelocidade
        );
        video.playbackRate = ajuste.taxaVideo;
    }

    function calcularTaxaAntecipada(texto, contexto) {
        if (comportamentoSincronia !== "accelerate_voice" || !MOTOR_SINCRONIA) {
            return velocidadeFala;
        }

        const video = contexto?.video;
        const fimCue = Number(contexto?.fimCue);
        if (!video || !fimCue || fimCue <= video.currentTime) return velocidadeFala;

        if (typeof MOTOR_SINCRONIA.calcularTaxaSincronizacaoContinua === "function") {
            const agora = performance.now();
            const inicioPrevistoEm = Math.max(
                agora,
                Number(contexto?.inicioPrevistoEm) || agora
            );
            const esperaFila = Math.max(0, (inicioPrevistoEm - agora) / 1000);
            const segundosAteFim = Math.max(
                0,
                (fimCue - video.currentTime) / (video.playbackRate || 1)
            );
            atrasoFilaEstimado = esperaFila;
            const taxaReferencia = (
                contexto?.sentencaAntecipada
                && typeof MOTOR_SINCRONIA.calcularTaxaParaIntervalo === "function"
            )
                ? MOTOR_SINCRONIA.calcularTaxaParaIntervalo({
                    texto,
                    taxaBase: velocidadeFala,
                    taxaMinima: Math.max(CONFIG.velocidadeMinima, velocidadeFala * 0.75),
                    taxaMaxima: CONFIG.velocidadeMaxima,
                    taxaVideo: video.playbackRate || 1,
                    segundosMidia: fimCue - video.currentTime,
                    palavrasPorSegundo: CONFIG.palavrasPorSegundo
                })
                : velocidadeFala;

            const ajuste = MOTOR_SINCRONIA.calcularTaxaSincronizacaoContinua({
                texto,
                taxaBase: taxaReferencia,
                taxaAnterior: ultimaTaxaPlanejada,
                taxaMaxima: CONFIG.velocidadeMaxima,
                passoMaximo: CONFIG.passoMaximoTaxaAdaptativa,
                tolerancia: CONFIG.toleranciaTaxaAdaptativa,
                fatorDuracao: fatorDuracaoVoz,
                segundosReaisDisponiveis: Math.max(0, segundosAteFim - esperaFila),
                palavrasPorSegundo: CONFIG.palavrasPorSegundo
            });
            ultimaTaxaPlanejada = ajuste.taxaFala;
            return ajuste.taxaFala;
        }

        if (
            contexto?.sentencaAntecipada
            && typeof MOTOR_SINCRONIA.calcularTaxaParaIntervalo === "function"
        ) {
            return MOTOR_SINCRONIA.calcularTaxaParaIntervalo({
                texto,
                taxaBase: velocidadeFala,
                taxaMinima: Math.max(CONFIG.velocidadeMinima, velocidadeFala * 0.75),
                taxaMaxima: CONFIG.velocidadeMaxima,
                taxaVideo: video.playbackRate || 1,
                segundosMidia: fimCue - video.currentTime,
                palavrasPorSegundo: CONFIG.palavrasPorSegundo
            });
        }

        return MOTOR_SINCRONIA.calcularAjusteAdaptativo({
            texto,
            modo: "accelerate_voice",
            taxaBase: velocidadeFala,
            taxaMaxima: CONFIG.velocidadeMaxima,
            taxaVideo: video.playbackRate || 1,
            taxaVideoMinima: CONFIG.velocidadeVideoMinima,
            segundosMidia: fimCue - video.currentTime,
            palavrasPorSegundo: CONFIG.palavrasPorSegundo
        }).taxaFala;
    }

    function criarFalaEnfileiravel(texto, contexto) {
        const utterance = new SpeechSynthesisUtterance(prepararTextoParaSintese(texto));
        const registro = {
            texto,
            contexto,
            utterance,
            geracao: geracaoDaFala,
            inicioPrevistoEm: Number(contexto?.inicioPrevistoEm) || performance.now(),
            inicioRealEm: 0,
            duracaoTaxaUm: MOTOR_SINCRONIA?.estimarDuracaoFala
                ? MOTOR_SINCRONIA.estimarDuracaoFala(texto, {
                    palavrasPorSegundo: CONFIG.palavrasPorSegundo
                })
                : Math.max(0.6, texto.split(/\s+/).length / CONFIG.palavrasPorSegundo)
        };

        utterance.lang = idiomaFala;
        utterance.rate = calcularTaxaAntecipada(texto, contexto);
        utterance.pitch = tomFala;
        utterance.volume = volumeFala;
        if (vozSelecionada) {
            const voz = speechSynthesis.getVoices().find(
                item => item.voiceURI === vozSelecionada || item.name === vozSelecionada
            );
            if (voz) utterance.voice = voz;
        }

        utterance.onstart = () => {
            if (registro.geracao !== geracaoDaFala) return;

            iniciarDucking();
            notificarEstadoFala(true, registro.texto);
            emitirEventoH5("started", registro);
            registrarDiagnostico("fala-iniciada", registro.texto);
            if (registro.contexto?.naoRegistrarHistorico !== true) {
                void registrarFraseNoHistorico(registro);
            }
            registro.inicioRealEm = performance.now();
            erroInicioFila = (registro.inicioRealEm - registro.inicioPrevistoEm) / 1000;
            previsaoFimFilaEm = Math.max(
                registro.inicioRealEm,
                previsaoFimFilaEm + (registro.inicioRealEm - registro.inicioPrevistoEm)
            );
            falaAtual = registro;
            if (falaEnfileirada === registro) falaEnfileirada = null;
            textoEmFala = registro.texto;
            taxaFalaEfetiva = utterance.rate;
            sentencaAntecipadaAtiva = Boolean(registro.contexto?.sentencaAntecipada);
            ultimoErroSintese = "";

            restaurarVelocidadeVideo();
            if (comportamentoSincronia === "slow_video") {
                calcularAjusteSincronia(registro.texto, registro.contexto);
            }

            // Assim que a fala pré-carregada começa, ocupa novamente a fila
            // nativa com a legenda mais recente mantida como reserva.
            const reserva = legendaReserva;
            legendaReserva = null;
            if (reserva && reserva.texto !== registro.texto) {
                enfileirarFala(reserva.texto, reserva.contexto);
            }
        };

        utterance.onboundary = evento => {
            if (registro.geracao !== geracaoDaFala) return;
            if (evento?.name === "word") {
                notificarCadenciaFala(evento.charIndex, evento.charLength);
            }
        };

        utterance.onend = () => {
            if (registro.geracao !== geracaoDaFala) return;
            agendarRestauracaoDucking();
            notificarEstadoFala(false);
            registrarDiagnostico("fala-finalizada", registro.texto);
            ultimoTextoConcluido = registro.texto;
            ultimoTextoConcluidoEm = performance.now();
            if (registro.inicioRealEm && registro.duracaoTaxaUm > 0) {
                const duracaoReal = (performance.now() - registro.inicioRealEm) / 1000;
                const fatorObservado = Math.min(
                    1.8,
                    Math.max(0.6, duracaoReal * utterance.rate / registro.duracaoTaxaUm)
                );
                fatorDuracaoVoz += (
                    fatorObservado - fatorDuracaoVoz
                ) * CONFIG.pesoCalibracaoVoz;
            }
            reconciliarPrevisaoFilaAposFimReal();
            if (falaAtual === registro) {
                falaAtual = null;
                textoEmFala = "";
                sentencaAntecipadaAtiva = false;
                restaurarVelocidadeVideo();
            }

            const reserva = legendaReserva;
            legendaReserva = null;
            if (reserva && reserva.texto !== registro.texto) {
                enfileirarFala(reserva.texto, reserva.contexto);
            }
        };

        utterance.onerror = evento => {
            if (registro.geracao !== geracaoDaFala) return;

            agendarRestauracaoDucking();
            notificarEstadoFala(false);
            emitirEventoH5("error", registro, evento?.error);
            registrarDiagnostico(`fala-erro:${evento.error || "desconhecido"}`, registro.texto);
            ultimoErroSintese = evento.error || "speech-error";
            if (falaAtual === registro) falaAtual = null;
            if (falaEnfileirada === registro) falaEnfileirada = null;
            textoEmFala = "";
            sentencaAntecipadaAtiva = false;
            restaurarVelocidadeVideo();
            reconciliarPrevisaoFilaAposFimReal();

            if (["not-allowed", "synthesis-unavailable", "voice-unavailable"].includes(evento.error)) {
                sinteseBloqueada = true;
                legendaReserva = null;
                geracaoDaFala++;
                speechSynthesis.cancel();
            }
        };

        return registro;
    }

    function enfileirarFalaNeural(texto, contexto = {}) {
        const provider = globalThis.SiaPiperVoice;
        if (!provider?.isActive?.()) {
            enfileirarFala(texto, contexto);
            return;
        }

        const agora = performance.now();
        const inicioPrevistoEm = Math.max(agora, previsaoFimFilaEm);
        const contextoPlanejado = { ...contexto, inicioPrevistoEm };
        const precache = legendaNeuralPrecarregada;
        const inicioCue = Number(contexto?.inicioCue);
        const fimCue = Number(contexto?.fimCue);
        const mesmaCuePrecarregada = Boolean(
            precache
            && (
                precache.texto === normalizarTexto(texto)
                || (contexto?.originalText && precache.textoOriginal === normalizarTexto(contexto.originalText))
            )
            && (
                precache.origem === "transcript"
                || precache.origem === "precache"
                || (
                    Number.isFinite(inicioCue)
                    && Number.isFinite(fimCue)
                    && Number.isFinite(precache.inicioCue)
                    && Number.isFinite(precache.fimCue)
                    && Math.abs(precache.inicioCue - inicioCue) < 0.25
                    && Math.abs(precache.fimCue - fimCue) < 0.25
                )
                || (!Number.isFinite(inicioCue) && !Number.isFinite(precache.inicioCue))
            )
        );
        if (precache && !mesmaCuePrecarregada) legendaNeuralPrecarregada = null;
        const taxaAntecipada = mesmaCuePrecarregada
            ? precache.rate
            : calcularTaxaAntecipada(texto, contextoPlanejado);
        const silenceScaleAntecipado = (mesmaCuePrecarregada && Number.isFinite(precache?.silenceScale))
            ? precache.silenceScale
            : (continuaSemPontuacaoFinal(texto) ? 0.08 : 0.2);
        if (mesmaCuePrecarregada) legendaNeuralPrecarregada = null;
        const utterance = {
            text: prepararTextoParaSintese(texto),
            lang: idiomaFala,
            rate: taxaAntecipada,
            pitch: tomFala,
            volume: volumeFala,
            voice: null,
            silenceScale: silenceScaleAntecipado,
            onstart: null,
            onend: null,
            onerror: null
        };
        const registro = {
            texto,
            contexto: contextoPlanejado,
            utterance,
            geracao: geracaoDaFala,
            inicioPrevistoEm,
            inicioRealEm: 0,
            duracaoTaxaUm: MOTOR_SINCRONIA?.estimarDuracaoFala
                ? MOTOR_SINCRONIA.estimarDuracaoFala(texto, {
                    palavrasPorSegundo: CONFIG.palavrasPorSegundo
                })
                : Math.max(0.6, texto.split(/\s+/).length / CONFIG.palavrasPorSegundo)
        };

        utterance.onstart = () => {
            if (registro.geracao !== geracaoDaFala) return;

            iniciarDucking();
            notificarEstadoFala(true, registro.texto);
            registrarDiagnostico("fala-neural-iniciada", registro.texto);
            if (registro.contexto?.naoRegistrarHistorico !== true) {
                void registrarFraseNoHistorico(registro);
            }
            registro.inicioRealEm = performance.now();
            erroInicioFila = (registro.inicioRealEm - registro.inicioPrevistoEm) / 1000;
            previsaoFimFilaEm = Math.max(
                registro.inicioRealEm,
                previsaoFimFilaEm + (registro.inicioRealEm - registro.inicioPrevistoEm)
            );
            falaAtual = registro;
            if (falaEnfileirada === registro) falaEnfileirada = null;
            textoEmFala = registro.texto;
            taxaFalaEfetiva = utterance.rate;
            sentencaAntecipadaAtiva = Boolean(registro.contexto?.sentencaAntecipada);
            ultimoErroSintese = "";

            restaurarVelocidadeVideo();
            if (comportamentoSincronia === "slow_video") {
                calcularAjusteSincronia(registro.texto, registro.contexto);
            }

            const reserva = legendaReserva;
            legendaReserva = null;
            if (reserva && reserva.texto !== registro.texto) {
                enfileirarFala(reserva.texto, reserva.contexto);
            }
        };

        utterance.onend = () => {
            if (registro.geracao !== geracaoDaFala) return;
            agendarRestauracaoDucking();
            notificarEstadoFala(false);
            registrarDiagnostico("fala-neural-finalizada", registro.texto);
            ultimoTextoConcluido = registro.texto;
            ultimoTextoConcluidoEm = performance.now();
            if (registro.inicioRealEm && registro.duracaoTaxaUm > 0) {
                const duracaoReal = (performance.now() - registro.inicioRealEm) / 1000;
                const fatorObservado = Math.min(
                    1.8,
                    Math.max(0.6, duracaoReal * utterance.rate / registro.duracaoTaxaUm)
                );
                fatorDuracaoVoz += (
                    fatorObservado - fatorDuracaoVoz
                ) * CONFIG.pesoCalibracaoVoz;
            }
            reconciliarPrevisaoFilaAposFimReal();
            if (falaAtual === registro) {
                falaAtual = null;
                textoEmFala = "";
                sentencaAntecipadaAtiva = false;
                restaurarVelocidadeVideo();
            }
        };

        utterance.onerror = evento => {
            if (registro.geracao !== geracaoDaFala) return;

            agendarRestauracaoDucking();
            notificarEstadoFala(false);
            registrarDiagnostico("fala-neural-erro", registro.texto);
            ultimoErroSintese = evento?.error || "piper-error";
            if (falaAtual === registro) falaAtual = null;
            if (falaEnfileirada === registro) falaEnfileirada = null;
            textoEmFala = "";
            sentencaAntecipadaAtiva = false;
            restaurarVelocidadeVideo();
            reconciliarPrevisaoFilaAposFimReal();

            if (!provider.isActive?.()) {
                // O provedor já se desativou. Tenta a mesma frase pela rota
                // nativa, sem alterar a geração atual nem a fila de legendas.
                enfileirarFala(registro.texto, registro.contexto);
                return;
            }
        };

        const duracaoPrevistaMs = registro.duracaoTaxaUm
            * fatorDuracaoVoz
            / Math.max(0.01, registro.utterance.rate)
            * 1000;
        previsaoFimFilaEm = Math.max(agora, previsaoFimFilaEm) + duracaoPrevistaMs;
        falaEnfileirada = registro;
        registrarDiagnostico("fala-neural-enfileirada", texto);
        notificarEstadoFala(true, texto);
        // Começa a síntese assim que a legenda é detectada. A fila reutiliza
        // o mesmo pedido/cache e não gera a frase duas vezes.
        void provider.primeText?.(utterance);
        if (!provider.speak(utterance)) {
            falaEnfileirada = null;
            enfileirarFala(texto, contexto);
        }
    }

    function estaFalandoOuSintetizando() {
        return Boolean(
            falaAtual
            || falaEnfileirada
            || (typeof speechSynthesis !== "undefined" && (speechSynthesis.speaking || speechSynthesis.pending))
            || (globalThis.SiaPiperVoice?.isSpeaking?.() === true)
        );
    }

    function notificarEstadoFala(falando, texto = "") {
        try {
            if (typeof chrome !== "undefined" && chrome?.runtime?.sendMessage) {
                chrome.runtime.sendMessage({
                    type: "SIA_SPEECH_STATE",
                    isSpeaking: Boolean(falando),
                    text: texto || ""
                }).catch(() => {});
            }
        } catch {
            // Ignora quando o contexto de extensão estiver inativo
        }
    }

    function notificarCadenciaFala(charIndex = 0, charLength = 0) {
        try {
            if (typeof chrome !== "undefined" && chrome?.runtime?.sendMessage) {
                chrome.runtime.sendMessage({
                    type: "SIA_SPEECH_CADENCE",
                    charIndex: Number(charIndex) || 0,
                    charLength: Number(charLength) || 0
                }).catch(() => {});
            }
        } catch {
            // Ignora quando o contexto de extensão estiver inativo
        }
    }

    function enfileirarFala(texto, contexto = {}) {
        if (contexto?.nativeOnly !== true && globalThis.SiaPiperVoice?.isActive?.()) {
            enfileirarFalaNeural(texto, contexto);
            return;
        }

        const agora = performance.now();
        const inicioPrevistoEm = Math.max(agora, previsaoFimFilaEm);
        const contextoPlanejado = { ...contexto, inicioPrevistoEm };
        const registro = criarFalaEnfileiravel(texto, contextoPlanejado);
        const duracaoPrevistaMs = registro.duracaoTaxaUm
            * fatorDuracaoVoz
            / registro.utterance.rate
            * 1000;
        previsaoFimFilaEm = inicioPrevistoEm + duracaoPrevistaMs;
        falaEnfileirada = registro;
        registrarDiagnostico("fala-enfileirada", texto);
        notificarEstadoFala(true, texto);
        speechSynthesis.speak(registro.utterance);
    }

    function falarAgora(texto, contexto = {}) {
        const contextoFala = replayTranscricaoAtivo
            ? { ...contexto, naoRegistrarHistorico: true, replayTranscricao: true }
            : contexto;
        let valor = normalizarTexto(texto);
        if (!valor || !extensaoAtiva || sinteseBloqueada) return;
        const usarPiper = contextoFala?.nativeOnly !== true
            && globalThis.SiaPiperVoice?.isActive?.() === true;
        if (!usarPiper && (!("speechSynthesis" in globalThis) || !("SpeechSynthesisUtterance" in globalThis))) {
            ultimoErroSintese = "synthesis-unavailable";
            sinteseBloqueada = true;
            return;
        }

        if (typeof MOTOR_SINCRONIA?.removerSobreposicaoInicial === "function") {
            const textoConcluidoRecente = (
                ultimoTextoConcluido
                && performance.now() - ultimoTextoConcluidoEm
                    <= CONFIG.janelaDeduplicacaoConcluidaMs
            )
                ? ultimoTextoConcluido
                : "";
            const referencias = [
                textoEmFala,
                falaEnfileirada?.texto,
                legendaReserva?.texto,
                textoConcluidoRecente
            ].filter(Boolean);

            for (const referencia of referencias) {
                const semSobreposicao = normalizarTexto(
                    MOTOR_SINCRONIA.removerSobreposicaoInicial(referencia, valor)
                );
                if (semSobreposicao.length < valor.length) {
                    registrarDiagnostico(
                        semSobreposicao ? "sobreposicao-removida" : "repeticao-descartada",
                        valor
                    );
                    valor = semSobreposicao;
                }
                if (!valor) return;
            }
        }

        if (valor === textoEmFala || valor === falaEnfileirada?.texto) return;

        if (MOTOR_APRENDIZAGEM && Number.isFinite(Number(contextoFala?.inicioCue)) && Number.isFinite(Number(contextoFala?.fimCue))) {
            cueEstudoAtual = {
                text: valor,
                startTime: Number(contextoFala.inicioCue),
                endTime: Number(contextoFala.fimCue),
                platformId: PLATAFORMA_APRENDIZAGEM_ID,
                videoId: videoIdParaEstudo(),
            };
        }

        if (contextoFala?.naoRegistrarHistorico !== true) {
            void registrarFraseNoHistorico({
                texto: valor,
                contexto: contextoFala
            });
        }

        if (usarPiper) {
            enfileirarFala(valor, contextoFala);
            return;
        }

        // Para a voz nativa, se já houver fala em reprodução, mantém a nova legenda como reserva
        // ou enfileirada para iniciar suavemente assim que a atual concluir, sem cortar palavras.
        if (speechSynthesis.speaking) {
            if (falaEnfileirada) {
                registrarDiagnostico("substituindo-fala-enfileirada", falaEnfileirada.texto);
            }
            legendaReserva = { texto: valor, contexto: contextoFala };
            return;
        }

        enfileirarFala(valor, contextoFala);
    }

    function falar(texto, contexto = {}) {
        if (!traducaoInglesAtiva || !MOTOR_TRADUCAO || contexto?.naoTraduzir === true) {
            falarAgora(texto, contexto);
            return;
        }
        const geracao = geracaoTraducao;
        const entregaId = ++ultimoIdEntregaTraducao;
        const originalText = normalizarTexto(texto);
        const traducao = MOTOR_TRADUCAO.translate(originalText, {
            sourceLanguage: "en",
            targetLanguage: "pt-BR"
        });
        filaEntregaTraducao = filaEntregaTraducao.catch(() => {}).then(() => traducao);
        void filaEntregaTraducao.then(resultado => {
            if (geracao !== geracaoTraducao || !traducaoInglesAtiva || !extensaoAtiva) return;
            if (!resultado?.text) return;
            ultimoErroTraducao = "";
            falarAgora(resultado.text, {
                ...contexto,
                originalText: resultado.originalText,
                translated: resultado.translated,
                sourceLanguage: resultado.sourceLanguage,
                targetLanguage: resultado.targetLanguage
            });
        }).catch(error => {
            if (geracao !== geracaoTraducao || entregaId < ultimoIdEntregaTraducao || !traducaoInglesAtiva || !extensaoAtiva) return;
            ultimoErroTraducao = String(error?.message || error || "translation-failed");
            registrarDiagnostico("traducao-indisponivel", originalText);
            falarAgora(originalText, { ...contexto, translationFallback: true });
        });
    }

    function precacheTraducoesFuturas(video, ateTempo = 0) {
        if (!traducaoInglesAtiva || !MOTOR_TRADUCAO?.prime || !video) return;
        const agora = performance.now();
        if (agora - ultimaPreTraducaoEm < 400) return;
        ultimaPreTraducaoEm = agora;
        const limiteInferior = Math.max(video.currentTime, ateTempo || 0) - 0.05;

        // Pré-tradução de TextTracks
        if (video.textTracks) {
            for (const track of video.textTracks) {
                if (track.kind !== "subtitles" && track.kind !== "captions") continue;
                const futuras = [...(track.cues || [])]
                    .filter(cue => Number(cue?.startTime) >= limiteInferior)
                    .slice(0, 4);
                for (const cue of futuras) {
                    const texto = normalizarTexto(cue?.text || "");
                    if (textoValidoDeLegenda(texto)) {
                        MOTOR_TRADUCAO.prime(texto, { sourceLanguage: "en", targetLanguage: "pt-BR" });
                    }
                }
                if (futuras.length) return;
            }
        }

        // Pré-tradução de frases futuras da Transcrição oficial do Coursera
        const container = document.querySelector(SELETORES_CONTAINER_TRANSCRICAO);
        if (container) {
            const ativo = container.querySelector(SELETORES_FRASE_ATIVA_TRANSCRICAO);
            if (ativo) {
                const proximas = obterProximasFrasesDaTranscricao(ativo, 4);
                for (const frase of proximas) {
                    MOTOR_TRADUCAO.prime(frase, { sourceLanguage: "en", targetLanguage: "pt-BR" });
                }
            }
        }
    }

    function processarCueExterna(cue) {
        if (
            !PLATAFORMA_EXTERNA
            || !cue
            || !plataformaAtiva
            || cue.platformId !== PLATAFORMA_EXTERNA_ID
            || !["texttrack", "shaka-caption", "youtube-track", "youtube-aggregated"].includes(cue.source)
            || cue.sourceConfidence !== "high"
            || cue.safeToSpeak !== true
            || !Number.isFinite(Number(cue.startTime))
            || !Number.isFinite(Number(cue.endTime))
            || Number(cue.endTime) <= Number(cue.startTime)
        ) {
            return false;
        }

        const video = document.querySelector("video");
        if (!video || video.paused || video.ended) return false;
        videoMonitorado = video;
        precacheTraducoesFuturas(video, Number(cue.endTime));
        ultimaPosicaoVideo = Number(video.currentTime) || 0;
        if (video.currentTime > Number(cue.endTime) + 0.35) return false;
        if (video.currentTime + 0.35 < Number(cue.startTime)) return false;

        const texto = normalizarTexto(cue.text);
        if (!texto || texto === ultimoTextoDetectado) return false;

        ultimoTextoDetectado = texto;
        textoCandidato = "";
        coberturaLegendaAte = Number(cue.endTime);
        const usarPiper = globalThis.SiaPiperVoice?.isActive?.() === true;
        const voiceEngine = usarPiper ? "piper-local" : "browser";
        const gate = cue.source === "shaka-caption"
            ? "H7-shaka-temporal-caption"
            : "H6-shared-udemy-texttrack";
        emitirEventoH5("requested", {
            texto,
            contexto: {
                inicioCue: Number(cue.startTime),
                fimCue: Number(cue.endTime),
                source: cue.source,
                sourceConfidence: cue.sourceConfidence,
                voiceEngine,
                gate
            }
        });
        falar(texto, {
            video,
            inicioCue: Number(cue.startTime),
            fimCue: Number(cue.endTime),
            sentencaAntecipada: false,
            source: cue.source,
            sourceConfidence: cue.sourceConfidence,
            playerIdentity: cue.playerIdentity,
            nativeOnly: !usarPiper,
            voiceEngine,
            gate
        });
        return true;
    }

    function conectarEntradaDeCaption() {
        if (!PLATAFORMA_EXTERNA || !plataformaAtiva) return;
        const input = globalThis.SiaCaptionInput;
        if (!input?.subscribe) return;

        removerEntradaDeCaption();
        removerEntradaDeCaption = input.subscribe(evento => {
            if (evento?.type !== input.EVENTS?.ACCEPTED) return;
            processarCueExterna(evento.cue);
        });
    }

    function interromperFala() {
        cancelarReplayTranscricao();
        geracaoDaFala++;
        geracaoTraducao++;
        ultimoIdEntregaTraducao++;
        filaEntregaTraducao = Promise.resolve();
        falaAtual = null;
        falaEnfileirada = null;
        textoEmFala = "";
        legendaReserva = null;
        coberturaLegendaAte = 0;
        ultimaPosicaoVideo = 0;
        sentencaAntecipadaAtiva = false;
        previsaoFimFilaEm = 0;
        ultimaTaxaPlanejada = velocidadeFala;
        legendaNeuralPrecarregada = null;
        atrasoFilaEstimado = 0;
        erroInicioFila = 0;
        ultimoTextoConcluido = "";
        ultimoTextoConcluidoEm = 0;
        limparBufferSentenca();
        restaurarVelocidadeVideo();
        restaurarDuckingImediato();
        notificarEstadoFala(false);
        if (speechSynthesis.speaking || speechSynthesis.pending) {
            speechSynthesis.cancel();
        }
        globalThis.SiaPiperVoice?.cancel?.();
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

        if (ultimaPosicaoVideo > 0 && (video.currentTime + 0.25 < ultimaPosicaoVideo || video.currentTime - ultimaPosicaoVideo > 1.8)) {
            interromperFala();
            ultimoTextoDetectado = "";
            textoCandidato = "";
        }
        ultimaPosicaoVideo = video.currentTime;
        precacheTraducoesFuturas(video, coberturaLegendaAte || video.currentTime);

        if (video.paused || video.ended) {
            if (!videoEstavaPausado) {
                videoEstavaPausado = true;
                if (!testeNeuralEmAndamento) interromperFala();
                restaurarDuckingImediato();
                textoCandidato = "";
            }
            // Enquanto pausado, pré-sintetiza a frase atual/inicial para latência zero ao dar Play
            if (!video.ended && !legendaNeuralPrecarregada) {
                const legendaPausa = obterTextoAtual(video);
                if (legendaPausa?.texto) {
                    precacheFraseNeural(legendaPausa.texto, {
                        ...legendaPausa,
                        rate: velocidadeFala
                    });
                }
            }
            return;
        }
        videoEstavaPausado = false;

        if (
            bufferSentenca.texto
            && video.currentTime - bufferSentenca.inicioVideo >= CONFIG.maximoSegundosSemPonto
        ) {
            liberarBufferSentenca({ video, fimCue: 0 });
        }

        const legenda = obterTextoAtual(video);
        const textoAtual = legenda.texto;

        if (video.currentTime < coberturaLegendaAte - 0.04) {
            // Enquanto a fala atual ainda cobre o vídeo e o texto na tela não mudou,
            // apenas prepara a próxima cue. Se uma nova legenda legítima já surgiu na tela,
            // não bloqueia a captura em tempo real.
            if (!textoAtual || textoAtual === ultimoTextoDetectado) {
                if (!legendaNeuralPrecarregada) {
                    const legendaAtiva = obterLegendaAtivaParaPrecache(video);
                    if (legendaAtiva) precacheProximaLegendaNeural(video, legendaAtiva);
                }
                return;
            }
        }

        if (!textoAtual) {
            // Em pequenos intervalos antes da próxima cue, prepara o áudio
            // futuro sem falar e sem alterar a fila. Assim a primeira fala de
            // uma nova frase não precisa esperar toda a geração neural.
            if (!legendaNeuralPrecarregada) {
                precacheProximaLegendaNeural(video, {
                    origem: "track",
                    fimCue: Number(video.currentTime) || 0,
                    video
                });
            }
            // O desaparecimento da cue não interrompe uma frase já iniciada.
            ultimoTextoDetectado = "";
            textoCandidato = "";
            return;
        }

        if (textoAtual === ultimoTextoDetectado) return;

        // Fontes estruturadas (TextTrack e Transcript oficial do Coursera) já são estáveis
        // e podem ser faladas no mesmo ciclo sem atraso de debounce do DOM.
        if (legenda.origem === "track" || legenda.origem === "transcript") {
            ultimoTextoDetectado = textoAtual;
            textoCandidato = "";
            limparBufferSentenca();
            coberturaLegendaAte = Math.max(video.currentTime, Number(legenda.fimCue) || 0);
            falar(textoAtual, legenda);
            // A previsão da fila já inclui a fala atual; antecipa a síntese da próxima frase.
            precacheProximaLegendaNeural(video, legenda);
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
        limparBufferSentenca();
        falar(textoAtual, legenda);
        precacheProximaLegendaNeural(video, legenda);
    }

    function aplicarConfiguracao(chave, valor) {
        switch (chave) {
            case "sia_enabled":
                extensaoAtiva = Boolean(valor);
                if (!extensaoAtiva) interromperFala();
                if (extensaoAtiva) sinteseBloqueada = false;
                break;
            case "sia_voice":
                vozSelecionada = String(valor || "");
                fatorDuracaoVoz = 1;
                sinteseBloqueada = false;
                ultimoErroSintese = "";
                break;
            case "sia_lang":
                idiomaFala = String(valor || CONFIG.idioma);
                break;
            case "sia_speed":
                velocidadeFala = Math.min(
                    CONFIG.velocidadeMaxima,
                    Math.max(CONFIG.velocidadeMinima, Number(valor) || 1.2)
                );
                ultimaTaxaPlanejada = velocidadeFala;
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
            case "sia_voice_engine": {
                const nextEngine = String(valor || "browser");
                const currentEngine = globalThis.SiaPiperVoiceStatus?.().engine || "browser";
                if (nextEngine !== currentEngine) interromperFala();
                sinteseBloqueada = false;
                ultimoErroSintese = "";
                globalThis.SiaPiperVoice?.setActive?.(nextEngine);
                break;
            }
            case "sia_translate_en_pt":
                traducaoInglesAtiva = Boolean(valor);
                geracaoTraducao++;
                ultimoErroTraducao = "";
                ultimaPreTraducaoEm = 0;
                if (traducaoInglesAtiva) {
                    void MOTOR_TRADUCAO?.prepare?.({ sourceLanguage: "en", targetLanguage: "pt-BR" });
                    precacheTraducoesFuturas(document.querySelector("video"));
                }
                break;
            case "sia_ducking":
                duckingAtivo = Boolean(valor);
                if (!duckingAtivo) {
                    restaurarDuckingImediato();
                }
                break;
            case "sia_ducking_level": {
                const parsed = Number(valor);
                if (Number.isFinite(parsed)) {
                    const norm = parsed > 1 ? parsed / 100 : parsed;
                    duckingNivel = Math.max(0, Math.min(1, norm));
                    if (duckingEmAndamento && volumeBaseVideo !== null) {
                        const video = obterVideoParaDucking();
                        if (video) {
                            const volumeAlvo = Math.max(0, Math.min(volumeBaseVideo, volumeBaseVideo * duckingNivel));
                            rampaVolumeVideo(video, volumeAlvo, 80);
                        }
                    }
                }
                break;
            }
            case "sia_spatial_audio":
            case "sia_spatial_profile": {
                if (globalThis.SiaPiperVoice?.setSpatialAudio) {
                    const enabled = chave === "sia_spatial_audio" ? Boolean(valor) : undefined;
                    const profile = chave === "sia_spatial_profile" ? String(valor) : undefined;
                    globalThis.SiaPiperVoice.setSpatialAudio(enabled, profile);
                }
                break;
            }
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
            "sia_sync",
            "sia_voice_engine",
            "sia_translate_en_pt",
            "sia_ducking",
            "sia_ducking_level",
            "sia_spatial_audio",
            "sia_spatial_profile"
        ];

        chrome.storage.local.get([...chaves, "sia_course_profiles"], configuracoes => {
            chaves.forEach(chave => {
                if (!(chave in configuracoes)) return;
                aplicarConfiguracao(chave, configuracoes[chave]);
            });
            const curso = location.pathname.match(/\/learn\/([^/]+)/)?.[1];
            const perfil = curso && configuracoes.sia_course_profiles?.[curso];
            Object.entries(perfil || {}).forEach(([chave, valor]) => {
                aplicarConfiguracao(chave, valor);
            });
        });

        chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
            if (mensagem?.type === "SIA_PLATFORM_DEACTIVATE") {
                plataformaAtiva = false;
                removerEntradaDeCaption();
                interromperFala();
                globalThis.SiaPiperVoice?.cancel?.();
                responder({
                    ok: true,
                    platformId: PLATAFORMA_EXTERNA ? PLATAFORMA_EXTERNA_ID : "coursera",
                    platformActive: false
                });
                return;
            }
            if (mensagem?.type === "SIA_PLATFORM_ACTIVATE") {
                const requested = String(mensagem.platformId || "").toLowerCase();
                const current = PLATAFORMA_EXTERNA ? PLATAFORMA_EXTERNA_ID : "coursera";
                if (requested !== current) {
                    responder({ ok: false, reason: "platform-mismatch", platformId: current, platformActive: plataformaAtiva });
                    return;
                }
                plataformaAtiva = true;
                conectarEntradaDeCaption();
                responder({ ok: true, platformId: current, platformActive: true });
                return;
            }
            if (mensagem?.type === "SIA_CONFIG_UPDATE") {
                aplicarConfiguracao(mensagem.key, mensagem.value);
                const piperStatus = globalThis.SiaPiperVoiceStatus?.() || {};
                responder({
                    ok: true,
                    voiceEngine: piperStatus.engine || "browser",
                    voiceEngineState: piperStatus.state || "unavailable",
                    audioState: piperStatus.audioState || "unknown",
                    audioError: piperStatus.audioError || ""
                });
                return;
            }

            if (mensagem?.type === "SIA_TEST_BROWSER_VOICE") {
                if (!("speechSynthesis" in globalThis) || !("SpeechSynthesisUtterance" in globalThis)) {
                    responder({ ok: false, reason: "synthesis-unavailable", message: "Síntese de voz indisponível nesta página" });
                    return;
                }

                const utterance = new SpeechSynthesisUtterance(
                    normalizarTexto(mensagem.text) || "A S IA está pronta para transformar suas aulas em áudio."
                );
                utterance.lang = String(mensagem.lang || idiomaFala || CONFIG.idioma);
                utterance.rate = Math.min(
                    CONFIG.velocidadeMaxima,
                    Math.max(CONFIG.velocidadeMinima, Number(mensagem.rate) || velocidadeFala)
                );
                utterance.pitch = Math.min(1.5, Math.max(0.5, Number(mensagem.pitch) || tomFala));
                utterance.volume = Math.min(1, Math.max(0, Number(mensagem.volume) || volumeFala));
                const voz = speechSynthesis.getVoices().find(item =>
                    item.voiceURI === mensagem.voiceURI
                    || item.name === mensagem.voiceName
                    || item.voiceURI === mensagem.voiceName
                );
                if (voz) utterance.voice = voz;

                let respondeu = false;
                let timeoutResposta = 0;
                const responderUmaVez = resultado => {
                    if (respondeu) return;
                    respondeu = true;
                    clearTimeout(timeoutResposta);
                    responder(resultado);
                };
                utterance.onstart = () => responderUmaVez({
                    ok: true,
                    started: true,
                    engine: "browser",
                    state: "playing"
                });
                utterance.onend = () => responderUmaVez({
                    ok: true,
                    started: true,
                    engine: "browser",
                    state: "finished"
                });
                utterance.onerror = evento => responderUmaVez({
                    ok: false,
                    reason: evento?.error || "synthesis-failed",
                    message: "A voz do navegador não iniciou nesta página"
                });

                try {
                    speechSynthesis.cancel();
                    speechSynthesis.speak(utterance);
                    timeoutResposta = setTimeout(() => responderUmaVez({
                        ok: false,
                        reason: "speech-start-timeout",
                        message: "A voz do navegador não iniciou no tempo esperado"
                    }), 8000);
                } catch (error) {
                    responderUmaVez({
                        ok: false,
                        reason: "synthesis-failed",
                        message: error?.message || "Falha ao iniciar a voz do navegador"
                    });
                }
                return true;
            }

            if (mensagem?.type === "SIA_PRIME_NEURAL_AUDIO") {
                const provider = globalThis.SiaPiperVoice;
                provider?.setActive?.("piper-local");
                if (!provider?.primeAudio) {
                    responder({ ok: false, message: "bridge neural não carregado" });
                    return;
                }
                void provider.primeAudio().then(responder);
                return true;
            }

            if (mensagem?.type === "SIA_TEST_NEURAL_VOICE") {
                const provider = globalThis.SiaPiperVoice;
                if (!provider?.isActive?.()) {
                    responder({ ok: false, reason: "piper-inactive" });
                    return;
                }

                testeNeuralEmAndamento = true;
                provider.cancel?.();
                let respondeu = false;
                let timeoutResposta = 0;
                const responderUmaVez = resultado => {
                    if (respondeu) return;
                    respondeu = true;
                    clearTimeout(timeoutResposta);
                    responder(resultado);
                };
                const utterance = {
                    text: normalizarTexto(mensagem.text) || "A S IA está pronta para transformar suas aulas em áudio.",
                    lang: idiomaFala,
                    rate: velocidadeFala,
                    pitch: tomFala,
                    volume: volumeFala,
                    onstart: () => {
                        testeNeuralEmAndamento = false;
                        responderUmaVez({
                        ok: true,
                        started: true,
                        engine: "piper-local",
                        state: "playing"
                        });
                    },
                    onend: () => {
                        testeNeuralEmAndamento = false;
                        responderUmaVez({
                        ok: true,
                        started: true,
                        engine: "piper-local",
                        state: "finished"
                        });
                    },
                    onerror: evento => {
                        testeNeuralEmAndamento = false;
                        responderUmaVez({
                        ok: false,
                        reason: evento?.error || "piper-error",
                        message: evento?.message || "A voz neural falhou e recuou para a voz do navegador"
                        });
                    }
                };
                const enfileirada = provider.speak?.(utterance) === true;
                if (!enfileirada) {
                    testeNeuralEmAndamento = false;
                    responderUmaVez({ ok: false, reason: "piper-not-queued", message: "voz neural não entrou na fila" });
                    return;
                }
                timeoutResposta = setTimeout(() => {
                    testeNeuralEmAndamento = false;
                    responderUmaVez({
                    ok: false,
                    reason: "piper-start-timeout",
                    message: "A voz neural não iniciou no tempo esperado"
                    });
                }, 25000);
                return true;
            }

            if (mensagem?.type === "SIA_GET_STATUS") {
                const video = document.querySelector("video");
                responder({
                    enabled: extensaoAtiva,
                    videoFound: Boolean(video),
                    paused: video?.paused ?? false,
                    ended: video?.ended ?? false,
                    captionActive: Boolean(ultimoTextoDetectado || textoEmFala),
                                        speechActive: Boolean(falaAtual || falaEnfileirada),
                    currentSpeechText: falaAtual?.texto || "",
                    queuedSpeechText: falaEnfileirada?.texto || "",
                    bufferingSentence: Boolean(bufferSentenca.texto),

                    timelineSentenceActive: sentencaAntecipadaAtiva,
                    syncMode: comportamentoSincronia,
                    effectiveSpeechRate: Number(taxaFalaEfetiva.toFixed(2)),
                    plannedSpeechRate: Number(ultimaTaxaPlanejada.toFixed(2)),
                    estimatedQueueDelay: Number(atrasoFilaEstimado.toFixed(2)),
                    queueStartError: Number(erroInicioFila.toFixed(2)),
                    voiceDurationFactor: Number(fatorDuracaoVoz.toFixed(2)),
                    videoRate: Number((video?.playbackRate || 1).toFixed(2)),
                    videoRateAdjusted: video === videoComVelocidadeAjustada,
                    speechError: ultimoErroSintese,
                    voiceEngine: globalThis.SiaPiperVoiceStatus?.().engine || "browser",
                    voiceEngineState: globalThis.SiaPiperVoiceStatus?.().state || "unavailable",
                    audioState: globalThis.SiaPiperVoiceStatus?.().audioState || "unknown",
                    audioError: globalThis.SiaPiperVoiceStatus?.().audioError || "",
                    translationEnabled: traducaoInglesAtiva,
                    translationReady: MOTOR_TRADUCAO?.getStatus?.().ready === true,
                    translationState: MOTOR_TRADUCAO?.getStatus?.().state || "unavailable",
                    translationError: ultimoErroTraducao,
                    syncEngineReady: Boolean(MOTOR_SINCRONIA),
                    duckingActive: Boolean(duckingEmAndamento || volumeBaseVideo !== null),
                    duckingEnabled: duckingAtivo,
                    duckingLevel: duckingNivel,
                    platformId: PLATAFORMA_EXTERNA ? PLATAFORMA_EXTERNA_ID : "coursera",
                    platformActive: plataformaAtiva,
                    platformDiagnostic: globalThis.SiaCoreDiagnostic?.get?.() || null
                });
                return;
            }

            if (mensagem?.type === "SIA_GET_LEARNING_CONTEXT") {
                const falador = estaFalandoOuSintetizando();
                responder({
                    ok: true,
                    courseKey: chaveHistorico,
                    title: document.title,
                    url: location.href,
                    history: historicoFrases,
                    study: contextoAprendizagem(),
                    isSpeaking: falador,
                    currentSpeechText: falaAtual?.texto || falaEnfileirada?.texto || textoEmFala || historicoFrases[0]?.texto || ""
                });
                return;
            }

            if (mensagem?.type === "SIA_GET_STUDY_CONTEXT") {
                responder(contextoAprendizagem());
                return;
            }

            if (mensagem?.type === "SIA_GET_LESSON_TRANSCRIPT") {
                responder(transcricaoAulaLocal());
                return;
            }

            if (mensagem?.type === "SIA_REPLAY_LESSON_TRANSCRIPT") {
                responder(repetirTranscricaoNoVideo());
                return;
            }

            if (mensagem?.type === "SIA_CREATE_STUDY_BOOKMARK") {
                void criarMarcacaoEstudo({
                    type: mensagem.typeId || mensagem.bookmarkType,
                    note: mensagem.note,
                }).then(responder);
                return true;
            }

            if (mensagem?.type === "SIA_REVIEW_STUDY_CARD") {
                void avaliarCartaoEstudo(mensagem.cardId, mensagem.rating, mensagem.answer).then(responder);
                return true;
            }

            if (mensagem?.type === "SIA_REPLAY_STUDY_BOOKMARK") {
                responder({ ok: repetirMarcacaoEstudo(mensagem.bookmarkId) });
                return;
            }

            if (mensagem?.type === "SIA_CLEAR_STUDY") {
                marcacoesEstudo = [];
                cartoesEstudo = [];
                void Promise.all([
                    removerStorageLocalSeguro(chaveEstudo),
                    removerStorageLocalSeguro(chaveCartoesEstudo),
                ]).then(([marksRemoved, cardsRemoved]) => {
                    responder({ ok: marksRemoved && cardsRemoved });
                });
                return true;
            }

            if (mensagem?.type === "SIA_REPLAY_LAST") {
                responder({ ok: repetirEntradaHistorico(mensagem.id) });
                return;
            }

            if (mensagem?.type === "SIA_UPDATE_HISTORY_ENTRY") {
                const entrada = historicoFrases.find(item => item.id === mensagem.id);
                if (!entrada) {
                    responder({ ok: false });
                    return;
                }
                if (typeof mensagem.favorite === "boolean") {
                    entrada.favorito = mensagem.favorite;
                }
                if (typeof mensagem.note === "string") {
                    entrada.nota = mensagem.note.slice(0, 1000);
                }
                void salvarStorageLocalSeguro(chaveHistorico, historicoFrases);
                responder({ ok: true, entry: entrada });
                return;
            }

            if (mensagem?.type === "SIA_CLEAR_HISTORY") {
                historicoFrases = [];
                transcricaoFrases = [];
                transcricaoCortada = false;
                void Promise.all([
                    removerStorageLocalSeguro(chaveHistorico),
                    removerStorageLocalSeguro(chaveTranscricao),
                ]).then(([historicoRemovido, transcricaoRemovida]) => {
                    responder({ ok: historicoRemovido && transcricaoRemovida });
                });
                return true;
            }
        });
    }

    function iniciarSia() {
        conectarConfiguracoes();
        conectarEntradaDeCaption();
        estadoAprendizagemPronto = carregarEstadoAprendizagem();
        chrome.storage.local.get([chaveHistorico, chaveTranscricao], resultado => {
            const salvo = resultado[chaveHistorico];
            historicoFrases = Array.isArray(salvo)
                ? salvo.slice(-CONFIG.maximoHistoricoFrases)
                : [];
            const salvoTranscricao = resultado[chaveTranscricao];
            transcricaoFrases = Array.isArray(salvoTranscricao)
                ? salvoTranscricao.slice(-CONFIG.maximoTranscricaoFrases)
                : historicoFrases.map(item => ({ ...item }));
            transcricaoCortada = transcricaoFrases.length >= CONFIG.maximoTranscricaoFrases;
        });
        if (!PLATAFORMA_EXTERNA) {
            setInterval(observarLegenda, CONFIG.intervaloMonitoramentoMs);
        }
        addEventListener("pagehide", () => {
            cancelarReplayTranscricao();
            removerEntradaDeCaption();
            interromperFala();
            restaurarDuckingImediato();
        }, { once: true });
        console.info(PLATAFORMA_EXTERNA
            ? "S.IA: entrada de cues externas ativa."
            : "S.ia: leitor de legendas do Coursera ativo.");
    }

    if (PLATAFORMA_EXTERNA) conectarEntradaDeCaption();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciarSia, { once: true });
    } else {
        iniciarSia();
    }
})();
