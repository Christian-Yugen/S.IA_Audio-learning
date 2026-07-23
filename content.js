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
        maximoSegundosSemPonto: 12,
        maximoCuesAntecipadas: 6
    });
    const MOTOR_SINCRONIA = globalThis.SiaSyncEngine;

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
    let bufferSentenca = {
        texto: "",
        inicioVideo: null,
        fragmentos: 0
    };

    function normalizarTexto(valor) {
        return String(valor || "")
            .replace(/\u200B/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function registrarDiagnostico(evento, texto = "") {
        console.info("[S·IA diagnóstico]", {
            evento,
            tempoVideo: Number((videoMonitorado?.currentTime || 0).toFixed(2)),
            texto: normalizarTexto(texto).slice(0, 160),
            speaking: speechSynthesis.speaking,
            pending: speechSynthesis.pending,
            paused: speechSynthesis.paused,
            falaAtual: Boolean(falaAtual),
            falaEnfileirada: Boolean(falaEnfileirada),
            reserva: Boolean(legendaReserva)
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
        const video = contexto.video;
        if (bufferSentenca.inicioVideo === null) {
            bufferSentenca.inicioVideo = Number(video?.currentTime) || 0;
        }

        bufferSentenca.texto = unirFragmentosSemRepetir(bufferSentenca.texto, texto);
        bufferSentenca.fragmentos++;
        const tempoEmBuffer = Math.max(
            0,
            (Number(video?.currentTime) || 0) - bufferSentenca.inicioVideo
        );

        if (
            terminaComPontuacaoFinal(bufferSentenca.texto)
            || bufferSentenca.texto.length >= CONFIG.maximoCaracteresSemPonto
            || tempoEmBuffer >= CONFIG.maximoSegundosSemPonto
        ) {
            liberarBufferSentenca(contexto);
        }
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

        for (const track of video.textTracks) {
            if (track.kind !== "subtitles" && track.kind !== "captions") continue;

            const cuesAtivas = [...(track.activeCues || [])];
            if (!cuesAtivas.length) continue;

            let texto = "";
            let fimCue = 0;
            let inicioCue = Number.POSITIVE_INFINITY;
            for (const cue of cuesAtivas) {
                const fragmento = normalizarTexto(cue.text);
                if (textoValidoDeLegenda(fragmento)) {
                    texto = unirFragmentosSemRepetir(texto, fragmento);
                    fimCue = Math.max(fimCue, Number(cue.endTime) || 0);
                    inicioCue = Math.min(inicioCue, Number(cue.startTime) || video.currentTime);
                }
            }

            if (!texto) continue;

            const fimCueAtiva = fimCue;
            let cuesAntecipadas = 0;
            const todasAsCues = [...(track.cues || [])];
            const futuras = todasAsCues.filter(cue =>
                Number(cue.startTime) >= fimCueAtiva - 0.04
            );

            for (const cue of futuras) {
                if (terminaComPontuacaoFinal(texto)) break;
                if (cuesAntecipadas >= CONFIG.maximoCuesAntecipadas) break;
                if ((Number(cue.endTime) || fimCue) - inicioCue > CONFIG.maximoSegundosSemPonto) {
                    break;
                }

                const fragmento = normalizarTexto(cue.text);
                if (!textoValidoDeLegenda(fragmento)) continue;

                const combinado = unirFragmentosSemRepetir(texto, fragmento);
                if (combinado.length > CONFIG.maximoCaracteresSemPonto) break;

                texto = combinado;
                fimCue = Math.max(fimCue, Number(cue.endTime) || 0);
                cuesAntecipadas++;
            }

            return {
                texto,
                fimCue,
                video,
                sentencaAntecipada: cuesAntecipadas > 0
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
            geracao: geracaoDaFala
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

            registrarDiagnostico("fala-iniciada", registro.texto);
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

        utterance.onend = () => {
            if (registro.geracao !== geracaoDaFala) return;
            registrarDiagnostico("fala-finalizada", registro.texto);
            if (falaAtual === registro) {
                falaAtual = null;
                textoEmFala = "";
                sentencaAntecipadaAtiva = false;
                restaurarVelocidadeVideo();
            }
        };

        utterance.onerror = evento => {
            if (registro.geracao !== geracaoDaFala) return;

            registrarDiagnostico(`fala-erro:${evento.error || "desconhecido"}`, registro.texto);
            ultimoErroSintese = evento.error || "speech-error";
            if (falaAtual === registro) falaAtual = null;
            if (falaEnfileirada === registro) falaEnfileirada = null;
            textoEmFala = "";
            sentencaAntecipadaAtiva = false;
            restaurarVelocidadeVideo();

            if (["not-allowed", "synthesis-unavailable", "voice-unavailable"].includes(evento.error)) {
                sinteseBloqueada = true;
                legendaReserva = null;
                geracaoDaFala++;
                speechSynthesis.cancel();
            }
        };

        return registro;
    }

    function enfileirarFala(texto, contexto = {}) {
        const registro = criarFalaEnfileiravel(texto, contexto);
        falaEnfileirada = registro;
        registrarDiagnostico("fala-enfileirada", texto);
        speechSynthesis.speak(registro.utterance);
    }

    function falar(texto, contexto = {}) {
        let valor = normalizarTexto(texto);
        if (!valor || !extensaoAtiva || sinteseBloqueada) return;

        if (!("speechSynthesis" in globalThis) || !("SpeechSynthesisUtterance" in globalThis)) {
            ultimoErroSintese = "synthesis-unavailable";
            sinteseBloqueada = true;
            return;
        }

        if (typeof MOTOR_SINCRONIA?.removerSobreposicaoInicial === "function") {
            const referencias = [
                textoEmFala,
                falaEnfileirada?.texto,
                legendaReserva?.texto
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

        if (falaEnfileirada) {
            legendaReserva = { texto: valor, contexto };
            registrarDiagnostico("reserva-atualizada", valor);
            return;
        }

        enfileirarFala(valor, contexto);
    }

    function interromperFala() {
        geracaoDaFala++;
        falaAtual = null;
        falaEnfileirada = null;
        textoEmFala = "";
        legendaReserva = null;
        coberturaLegendaAte = 0;
        ultimaPosicaoVideo = 0;
        sentencaAntecipadaAtiva = false;
        limparBufferSentenca();
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

        if (video.currentTime + 0.25 < ultimaPosicaoVideo) {
            interromperFala();
            ultimoTextoDetectado = "";
            textoCandidato = "";
        }
        ultimaPosicaoVideo = video.currentTime;

        if (video.paused || video.ended) {
            interromperFala();
            textoCandidato = "";
            return;
        }

        if (
            bufferSentenca.texto
            && video.currentTime - bufferSentenca.inicioVideo >= CONFIG.maximoSegundosSemPonto
        ) {
            liberarBufferSentenca({ video, fimCue: 0 });
        }

        if (video.currentTime < coberturaLegendaAte - 0.04) return;

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
            limparBufferSentenca();
            coberturaLegendaAte = Math.max(video.currentTime, Number(legenda.fimCue) || 0);
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
        processarFragmentoDeSentenca(textoAtual, legenda);
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
                    speechActive: Boolean(falaAtual || falaEnfileirada),
                    bufferingSentence: Boolean(bufferSentenca.texto),
                    timelineSentenceActive: sentencaAntecipadaAtiva,
                    syncMode: comportamentoSincronia,
                    effectiveSpeechRate: Number(taxaFalaEfetiva.toFixed(2)),
                    videoRate: Number((video?.playbackRate || 1).toFixed(2)),
                    videoRateAdjusted: video === videoComVelocidadeAjustada,
                    speechError: ultimoErroSintese,
                    syncEngineReady: Boolean(MOTOR_SINCRONIA)
                });
            }
        });
    }

    function iniciarSia() {
        conectarConfiguracoes();
        setInterval(observarLegenda, CONFIG.intervaloMonitoramentoMs);
        addEventListener("pagehide", interromperFala, { once: true });
        console.info("S.ia: leitor de legendas do Coursera ativo.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciarSia, { once: true });
    } else {
        iniciarSia();
    }
})();
