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
        maximoCuesAntecipadas: 6,
        passoMaximoTaxaAdaptativa: 0.3,
        toleranciaTaxaAdaptativa: 0.15,
        pesoCalibracaoVoz: 0.2,
        janelaDeduplicacaoConcluidaMs: 5000,
        maximoHistoricoFrases: 60
    });
    const MOTOR_SINCRONIA = globalThis.SiaSyncEngine;
    const PLATAFORMA_EXTERNA = location.hostname === "www.udemy.com";
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
    let testeNeuralEmAndamento = false;
    let historicoFrases = [];
    const chaveHistorico = `sia_history_${location.pathname
        .replace(/[^a-z0-9]+/gi, "_")
        .slice(0, 120)}`;
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

    function normalizarTexto(valor) {
        return String(valor || "")
            .replace(/\u200B/g, "")
            .replace(/\s+/g, " ")
            .trim();
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
                inicioCue,
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

        return {
            texto: obterLegendasDoDom(video),
            origem: "dom",
            video,
            inicioCue: video.currentTime,
            fimCue: 0
        };
    }

        function precacheProximaLegendaNeural(video, legendaAtual) {
        const provider = globalThis.SiaPiperVoice;
        if (!provider?.isActive?.() || legendaAtual?.origem !== "track") return;

        const fimAtual = Number(legendaAtual.fimCue) || 0;
        if (!fimAtual || !video?.textTracks) return;

        for (const track of video.textTracks) {
            const proximas = [...(track.cues || [])]
                .filter(cue => Number(cue.startTime) >= fimAtual - 0.04)
                .sort((a, b) => Number(a.startTime) - Number(b.startTime));
            const proxima = proximas.find(cue =>
                textoValidoDeLegenda(normalizarTexto(cue.text))
                && Number(cue.startTime) > fimAtual - 0.04
            );
            if (!proxima) continue;

            const texto = normalizarTexto(proxima.text);
            const inicioCue = Number(proxima.startTime) || video.currentTime;
            const contexto = {
                // Calcula a taxa no instante em que a cue deve começar, não no
                // instante em que a cue anterior foi detectada.
                video: {
                    currentTime: inicioCue,
                    playbackRate: video.playbackRate || 1
                },
                inicioCue,
                fimCue: Number(proxima.endTime) || 0,
                sentencaAntecipada: false,
                inicioPrevistoEm: Math.max(performance.now(), previsaoFimFilaEm)
            };
            const utterance = {
                text: prepararTextoParaSintese(texto),
                lang: idiomaFala,
                rate: calcularTaxaAntecipada(texto, contexto),
                pitch: tomFala,
                volume: volumeFala,
                voice: null
            };
            void provider.primeText?.(utterance);
            return;
        }
    }

    function criarEntradaHistorico(registro) {

        const video = registro.contexto?.video || videoMonitorado;
        const inicio = Number(registro.contexto?.inicioCue);
        const fim = Number(registro.contexto?.fimCue);
        return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            texto: registro.texto,
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
        await salvarStorageLocalSeguro(chaveHistorico, historicoFrases);
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

            registrarDiagnostico("fala-iniciada", registro.texto);
            void registrarFraseNoHistorico(registro);
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

        utterance.onend = () => {
            if (registro.geracao !== geracaoDaFala) return;
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

    function enfileirarFalaNeural(texto, contexto = {}) {
        const provider = globalThis.SiaPiperVoice;
        if (!provider?.isActive?.()) {
            enfileirarFala(texto, contexto);
            return;
        }

        const agora = performance.now();
        const inicioPrevistoEm = Math.max(agora, previsaoFimFilaEm);
        const contextoPlanejado = { ...contexto, inicioPrevistoEm };
        const utterance = {
            text: prepararTextoParaSintese(texto),
            lang: idiomaFala,
            rate: calcularTaxaAntecipada(texto, contextoPlanejado),
            pitch: tomFala,
            volume: volumeFala,
            voice: null,
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

            registrarDiagnostico("fala-neural-iniciada", registro.texto);
            void registrarFraseNoHistorico(registro);
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
            if (falaAtual === registro) {
                falaAtual = null;
                textoEmFala = "";
                sentencaAntecipadaAtiva = false;
                restaurarVelocidadeVideo();
            }
        };

        utterance.onerror = evento => {
            if (registro.geracao !== geracaoDaFala) return;

            registrarDiagnostico("fala-neural-erro", registro.texto);
            ultimoErroSintese = evento?.error || "piper-error";
            if (falaAtual === registro) falaAtual = null;
            if (falaEnfileirada === registro) falaEnfileirada = null;
            textoEmFala = "";
            sentencaAntecipadaAtiva = false;
            restaurarVelocidadeVideo();

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
        // Começa a síntese assim que a legenda é detectada. A fila reutiliza
        // o mesmo pedido/cache e não gera a frase duas vezes.
        void provider.primeText?.(utterance);
        if (!provider.speak(utterance)) {

            falaEnfileirada = null;
            enfileirarFala(texto, contexto);
        }
    }

    function enfileirarFala(texto, contexto = {}) {
        if (globalThis.SiaPiperVoice?.isActive?.()) {
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
        speechSynthesis.speak(registro.utterance);
    }

    function falar(texto, contexto = {}) {
        let valor = normalizarTexto(texto);
        if (!valor || !extensaoAtiva || sinteseBloqueada) return;

        const piperAtivo = globalThis.SiaPiperVoice?.isActive?.() === true;
        if (!piperAtivo && (!("speechSynthesis" in globalThis) || !("SpeechSynthesisUtterance" in globalThis))) {
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

        if (falaEnfileirada) {
            legendaReserva = { texto: valor, contexto };
            registrarDiagnostico("reserva-atualizada", valor);
            return;
        }

        enfileirarFala(valor, contexto);
    }

    function processarCueExterna(cue) {
        if (
            !PLATAFORMA_EXTERNA
            || !cue
            || cue.platformId !== "udemy"
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
        ultimaPosicaoVideo = Number(video.currentTime) || 0;
        if (video.currentTime > Number(cue.endTime) + 0.35) return false;
        if (video.currentTime + 0.35 < Number(cue.startTime)) return false;

        const texto = normalizarTexto(cue.text);
        if (!texto || texto === ultimoTextoDetectado) return false;

        ultimoTextoDetectado = texto;
        textoCandidato = "";
        coberturaLegendaAte = Number(cue.endTime);
        falar(texto, {
            video,
            inicioCue: Number(cue.startTime),
            fimCue: Number(cue.endTime),
            sentencaAntecipada: false,
            source: cue.source,
            sourceConfidence: cue.sourceConfidence,
            playerIdentity: cue.playerIdentity
        });
        return true;
    }

    function conectarEntradaDeCaption() {
        if (!PLATAFORMA_EXTERNA) return;
        const input = globalThis.SiaCaptionInput;
        if (!input?.subscribe) return;

        removerEntradaDeCaption();
        removerEntradaDeCaption = input.subscribe(evento => {
            if (evento?.type !== input.EVENTS?.ACCEPTED) return;
            processarCueExterna(evento.cue);
        });
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
        previsaoFimFilaEm = 0;
        ultimaTaxaPlanejada = velocidadeFala;
        atrasoFilaEstimado = 0;
        erroInicioFila = 0;
        ultimoTextoConcluido = "";
        ultimoTextoConcluidoEm = 0;
        limparBufferSentenca();
        restaurarVelocidadeVideo();
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

        if (video.currentTime + 0.25 < ultimaPosicaoVideo) {
            interromperFala();
            ultimoTextoDetectado = "";
            textoCandidato = "";
        }
        ultimaPosicaoVideo = video.currentTime;

        if (video.paused || video.ended) {
            if (!testeNeuralEmAndamento) interromperFala();
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
            // A previsão da fila já inclui a fala atual; só então calculamos
            // a taxa/cache da próxima cue.
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
            "sia_voice_engine"
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
            if (mensagem?.type === "SIA_CONFIG_UPDATE") {
                aplicarConfiguracao(mensagem.key, mensagem.value);
                const piperStatus = globalThis.SiaPiperVoiceStatus?.() || {};
                responder({
                    ok: true,
                    voiceEngine: piperStatus.engine || "browser",
                    voiceEngineState: piperStatus.state || "unavailable"
                });
                return;
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
                    syncEngineReady: Boolean(MOTOR_SINCRONIA)
                });
                return;
            }

            if (mensagem?.type === "SIA_GET_LEARNING_CONTEXT") {
                responder({
                    ok: true,
                    courseKey: chaveHistorico,
                    title: document.title,
                    url: location.href,
                    history: historicoFrases
                });
                return;
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
                void removerStorageLocalSeguro(chaveHistorico);
                responder({ ok: true });
            }
        });
    }

    function iniciarSia() {
        conectarConfiguracoes();
        conectarEntradaDeCaption();
        chrome.storage.local.get(chaveHistorico, resultado => {
            const salvo = resultado[chaveHistorico];
            historicoFrases = Array.isArray(salvo)
                ? salvo.slice(-CONFIG.maximoHistoricoFrases)
                : [];
        });
        if (!PLATAFORMA_EXTERNA) {
            setInterval(observarLegenda, CONFIG.intervaloMonitoramentoMs);
        }
        addEventListener("pagehide", () => {
            removerEntradaDeCaption();
            interromperFala();
        }, { once: true });
        console.info(PLATAFORMA_EXTERNA
            ? "S.IA: entrada de cues externas ativa."
            : "S.ia: leitor de legendas do Coursera ativo.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciarSia, { once: true });
    } else {
        iniciarSia();
    }
})();
