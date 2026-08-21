(() => {
    "use strict";

    // Camada adicional e independente. Ela não chama speechSynthesis nem altera
    // o motor de sincronia: apenas publica texto em um elemento compatível com o
    // detector DOM já existente quando a detecção normal não encontra legenda.
    const CONFIG = Object.freeze({
        intervaloMonitoramentoMs: 250,
        atrasoFalhaMs: 1500,
        estabilidadeCandidatoMs: 80,
        evidenciaExpiraMs: 15000,
        pontuacaoMinima: 8,
        tamanhoMinimo: 4,
        maximoCaracteres: 280,
        maximoElementosScan: 1800,
        intervaloAgendamentoMs: 60
    });

    const SELETORES_RAIZ_PLAYER = [
        '[data-testid*="video-player" i]',
        '[class*="video-player" i]',
        '[class*="videoPlayer"]',
        '.video-js',
        '.shaka-video-container'
    ].join(",");

    const SELETORES_LEGENDA_PRIMARIA = [
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
        "button",
        '[role="button"]',
        '[role="slider"]',
        '[class*="control" i]',
        '[class*="progress" i]',
        '[class*="scrubber" i]',
        '[class*="seek" i]',
        '[class*="time-display" i]',
        '[data-testid*="control" i]'
    ].join(",");

    const SELETORES_ELEMENTOS_IGNORADOS = [
        "video",
        "track",
        "source",
        "script",
        "style",
        "noscript",
        "canvas",
        "svg",
        "button",
        "input",
        "textarea",
        "select",
        "option",
        "a"
    ].join(",");

    const MARCADOR_LEGENDA = /caption|captions|subtitle|subtitles|closed[-_ ]?caption|\bcc\b|legend/iu;
    const SELETORES_INDICIO_LEGENDA = [
        '[aria-label*="caption" i]',
        '[aria-label*="subtitle" i]',
        '[aria-label*="legenda" i]',
        '[title*="caption" i]',
        '[title*="subtitle" i]',
        '[title*="legenda" i]',
        '[data-testid*="caption" i]',
        '[data-testid*="subtitle" i]',
        '[class*="caption" i]',
        '[class*="subtitle" i]'
    ].join(",");
    const PALAVRAS_CONTROLE = /^(play|pause|reproduzir|pausar|volume|mute|mudo|fullscreen|tela cheia|settings|configurações|speed|velocidade|quality|qualidade|autoplay|next|previous|avançar|voltar)$/iu;
    const REGEX_TEMPO = /^-?\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*\/\s*-?\d{1,2}:\d{2}(?::\d{2})?)?\s*$/u;

    let iniciado = false;
    let timerMonitoramento = 0;
    let timerAgendado = 0;
    let videoAtual = null;
    let raizAtual = null;
    let overlay = null;
    let observer = null;
    let falhaDesde = 0;
    let evidenciaAte = 0;
    let candidatoTexto = "";
    let candidatoDesde = 0;
    let candidatoPontuacao = 0;
    let fallbackAtivo = false;
    let ultimaOrigem = "";

    function normalizarTexto(valor) {
        return String(valor || "")
            .replace(/\u200B/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function textoValido(texto) {
        const valor = normalizarTexto(texto);
        if (
            valor.length < CONFIG.tamanhoMinimo
            || valor.length > CONFIG.maximoCaracteres
            || REGEX_TEMPO.test(valor)
            || PALAVRAS_CONTROLE.test(valor)
        ) {
            return false;
        }

        const letras = valor.match(/\p{L}/gu);
        return Boolean(letras && letras.length >= 2);
    }

    function textoDoElemento(elemento) {
        if (!(elemento instanceof HTMLElement)) return "";
        return normalizarTexto(elemento.innerText || elemento.textContent);
    }

    function elementoVisivel(elemento) {
        if (!(elemento instanceof HTMLElement) || !elemento.isConnected) return false;
        const estilo = getComputedStyle(elemento);
        const retangulo = elemento.getBoundingClientRect();
        return estilo.display !== "none"
            && estilo.visibility !== "hidden"
            && Number(estilo.opacity) !== 0
            && retangulo.width > 0
            && retangulo.height > 0;
    }

    function obterRaizDoPlayer(video) {
        return video.closest(SELETORES_RAIZ_PLAYER) || video.parentElement;
    }

    function obterTextoPrimario(video, raiz) {
        try {
            for (const track of video.textTracks || []) {
                if (track.kind !== "subtitles" && track.kind !== "captions") continue;
                const cues = [...(track.activeCues || [])];
                for (const cue of cues) {
                    if (textoValido(cue.text)) return true;
                }
            }
        } catch {
            // Uma TextTrack pode deixar de existir durante a troca do player.
        }

        if (!raiz) return false;

        try {
            const candidatos = raiz.querySelectorAll(SELETORES_LEGENDA_PRIMARIA);
            for (const elemento of candidatos) {
                if (
                    elemento === overlay
                    || !elementoVisivel(elemento)
                    || elemento.closest(SELETORES_CONTROLE)
                ) {
                    continue;
                }
                if (textoValido(textoDoElemento(elemento))) return true;
            }
        } catch {
            // O fallback nunca deve interromper o leitor principal.
        }

        return false;
    }

    function possuiFaixaDeLegendaAtiva(video) {
        try {
            return [...(video.textTracks || [])].some(track =>
                (track.kind === "subtitles" || track.kind === "captions")
                && track.mode !== "disabled"
            );
        } catch {
            return false;
        }
    }

    function possuiIndicioDeLegenda(raiz) {
        if (!raiz) return false;
        try {
            return Boolean(raiz.querySelector(SELETORES_INDICIO_LEGENDA));
        } catch {
            return false;
        }
    }

    function marcarEvidencia(video, raiz, agora) {
        if (
            possuiFaixaDeLegendaAtiva(video)
            || obterTextoPrimario(video, raiz)
            || possuiIndicioDeLegenda(raiz)
        ) {
            evidenciaAte = agora + CONFIG.evidenciaExpiraMs;
        }
        return agora < evidenciaAte;
    }

    function possuiDescendenteComTexto(elemento) {
        for (const filho of elemento.children) {
            if (
                filho instanceof HTMLElement
                && elementoVisivel(filho)
                && textoValido(textoDoElemento(filho))
            ) {
                return true;
            }
        }
        return false;
    }

    function temMarcadorDeLegenda(elemento) {
        const identidade = [
            elemento.id,
            elemento.className,
            elemento.getAttribute("aria-label"),
            elemento.getAttribute("data-testid"),
            elemento.getAttribute("data-purpose")
        ].filter(Boolean).join(" ");
        return MARCADOR_LEGENDA.test(identidade);
    }

    function obterSinaisDaHierarquia(elemento, raiz) {
        let atual = elemento.parentElement;
        let profundidade = 0;
        let marcador = false;
        let posicionado = false;
        let controle = false;
        let diretoNaRaiz = elemento.parentElement === raiz;

        while (atual && atual !== raiz && profundidade < 4) {
            marcador = marcador || temMarcadorDeLegenda(atual);
            posicionado = posicionado || ["absolute", "fixed", "sticky"].includes(
                getComputedStyle(atual).position
            );
            controle = controle || Boolean(atual.matches(SELETORES_CONTROLE));
            diretoNaRaiz = diretoNaRaiz || atual.parentElement === raiz;
            atual = atual.parentElement;
            profundidade++;
        }

        return { marcador, posicionado, controle, diretoNaRaiz };
    }

    function candidatoDom(elemento, video, raiz) {
        if (
            !(elemento instanceof HTMLElement)
            || elemento === overlay
            ||             elemento.matches(SELETORES_ELEMENTOS_IGNORADOS)
            || elemento.matches('[aria-hidden="true"]')
            || elemento.matches(SELETORES_CONTROLE)
            || elemento.closest(SELETORES_CONTROLE)
            || elemento.closest("a")
            || !elementoVisivel(elemento)
            || possuiDescendenteComTexto(elemento)
        ) {
            return null;
        }

        const texto = textoDoElemento(elemento);
        if (!textoValido(texto)) return null;

        const videoRect = video.getBoundingClientRect();
        const elementoRect = elemento.getBoundingClientRect();
        if (!videoRect.width || !videoRect.height) return null;

        const centroX = (elementoRect.left + elementoRect.right) / 2;
        const centroY = (elementoRect.top + elementoRect.bottom) / 2;
        const relativoX = (centroX - videoRect.left) / videoRect.width;
        const relativoY = (centroY - videoRect.top) / videoRect.height;

        if (
            relativoX < -0.1
            || relativoX > 1.1
            || relativoY < 0.3
            || relativoY > 1.2
            || elementoRect.height > videoRect.height * 0.45
        ) {
            return null;
        }

        const estilo = getComputedStyle(elemento);
        const sinais = obterSinaisDaHierarquia(elemento, raiz);
        if (sinais.controle) return null;
        const posicionado = ["absolute", "fixed", "sticky"].includes(estilo.position)
            || sinais.posicionado;
        const centralizado = relativoX >= 0.18 && relativoX <= 0.82;
        const inferior = relativoY >= 0.58;
        const marcador = temMarcadorDeLegenda(elemento) || sinais.marcador;
        const ariaLive = elemento.getAttribute("aria-live") || "";
        const papel = elemento.getAttribute("role") || "";

        let pontuacao = 0;
        if (inferior) pontuacao += 3;
        if (centralizado) pontuacao += 2;
        if (posicionado) pontuacao += 2;
        if (marcador) pontuacao += 3;
        if (ariaLive === "polite" || ariaLive === "assertive") pontuacao += 1;
        if (papel === "status" || papel === "alert") pontuacao += 1;
        if (elementoRect.width <= videoRect.width * 0.95) pontuacao += 1;
        if (raiz && sinais.diretoNaRaiz) pontuacao += 1;

        if (pontuacao < CONFIG.pontuacaoMinima) return null;

        return {
            elemento,
            texto,
            pontuacao,
            distanciaInferior: relativoY,
            marcador
        };
    }

    function obterCandidatoGenerico(video, raiz) {
        if (!raiz) return null;

        let elementos;
        try {
            elementos = raiz.querySelectorAll("*");
        } catch {
            return null;
        }

        let melhor = null;
        const limite = Math.min(elementos.length, CONFIG.maximoElementosScan);
        for (let indice = 0; indice < limite; indice++) {
            const candidato = candidatoDom(elementos[indice], video, raiz);
            if (!candidato) continue;

            if (
                !melhor
                || candidato.pontuacao > melhor.pontuacao
                || (
                    candidato.pontuacao === melhor.pontuacao
                    && candidato.distanciaInferior > melhor.distanciaInferior
                )
            ) {
                melhor = candidato;
            }
        }

        return melhor;
    }

    function criarOuObterOverlay(raiz) {
        if (!raiz) return null;
        if (overlay?.isConnected && overlay.parentElement === raiz) return overlay;

        if (overlay?.isConnected) overlay.remove();

        const novoOverlay = document.createElement("div");
        novoOverlay.setAttribute("data-testid", "video-captions");
        novoOverlay.setAttribute("data-sia-dom-fallback", "true");
        novoOverlay.setAttribute("aria-live", "polite");
        novoOverlay.className = "sia-dom-fallback-caption";
        Object.assign(novoOverlay.style, {
            display: "none",
            position: "fixed",
            left: "0px",
            top: "0px",
            width: "0px",
            bottom: "auto",
            zIndex: "2147483646",
            padding: "0.35em 0.65em",
            borderRadius: "0.3em",
            background: "rgb(0 0 0 / 72%)",
            color: "#fff",
            font: "600 clamp(14px, 2.2vw, 28px) / 1.35 sans-serif",
            textAlign: "center",
            textShadow: "0 1px 2px #000",
            pointerEvents: "none",
            userSelect: "none"
        });
        raiz.append(novoOverlay);
        overlay = novoOverlay;
        return overlay;
    }

    function ocultarOverlay() {
        if (!overlay) return;
        overlay.textContent = "";
        overlay.style.display = "none";
        fallbackAtivo = false;
    }

    function posicionarOverlay(video, destino) {
        if (!video || !destino) return;
        const retangulo = video.getBoundingClientRect();
        if (!retangulo.width || !retangulo.height) return;

        destino.style.left = `${retangulo.left + retangulo.width * 0.08}px`;
        destino.style.top = `${retangulo.top + retangulo.height * 0.77}px`;
        destino.style.width = `${retangulo.width * 0.84}px`;
        destino.style.maxHeight = `${retangulo.height * 0.2}px`;
        destino.style.overflow = "hidden";
    }

    function publicarCandidato(candidato, video, raiz) {
        const destino = criarOuObterOverlay(raiz);
        if (!destino) return;

        if (destino.textContent !== candidato.texto) {
            destino.textContent = candidato.texto;
        }
        posicionarOverlay(video, destino);
        destino.style.display = "block";
        fallbackAtivo = true;
        ultimaOrigem = "dom-fallback";
    }

    function resetarCandidato() {
        candidatoTexto = "";
        candidatoDesde = 0;
        candidatoPontuacao = 0;
    }

    function trocarVideo(video, raiz) {
        if (videoAtual === video && raizAtual === raiz) return;

        if (observer) observer.disconnect();
        observer = null;
        ocultarOverlay();
        if (overlay?.isConnected) overlay.remove();
        overlay = null;
        videoAtual = video;
        raizAtual = raiz;
        falhaDesde = 0;
        evidenciaAte = 0;
        ultimaOrigem = "";
        resetarCandidato();

        if (raiz && "MutationObserver" in globalThis) {
            observer = new MutationObserver(registros => {
                const alterouTexto = registros.some(registro => {
                    if (registro.target === overlay) return false;
                    if (registro.type === "characterData") return true;
                    if (registro.type === "childList") {
                        return ![...registro.addedNodes, ...registro.removedNodes]
                            .some(node => node === overlay || node.contains?.(overlay));
                    }
                    return true;
                });
                if (alterouTexto) agendarVerificacao();
            });
            observer.observe(raiz, {
                subtree: true,
                childList: true,
                characterData: true,
                attributes: true,
                attributeFilter: ["class", "style", "aria-label", "data-testid", "data-purpose", "hidden"]
            });
        }
    }

    function verificar() {
        timerAgendado = 0;
        const video = document.querySelector("video");

        if (!video) {
            trocarVideo(null, null);
            return;
        }

        const raiz = obterRaizDoPlayer(video);
        trocarVideo(video, raiz);

        if (video.paused || video.ended || !raiz) {
            falhaDesde = 0;
            ocultarOverlay();
            resetarCandidato();
            return;
        }

        const agora = performance.now();
        const possuiTextoPrimario = obterTextoPrimario(video, raiz);
        const evidenciaInicial = marcarEvidencia(video, raiz, agora);

        if (possuiTextoPrimario) {
            falhaDesde = 0;
            ocultarOverlay();
            resetarCandidato();
            ultimaOrigem = "primaria";
            return;
        }

        const candidato = obterCandidatoGenerico(video, raiz);
        const evidenciaPorCandidato = Boolean(
            candidato && candidato.pontuacao >= CONFIG.pontuacaoMinima
        );
        const possuiEvidencia = evidenciaInicial || evidenciaPorCandidato;

        if (!possuiEvidencia) {
            falhaDesde = 0;
            ocultarOverlay();
            resetarCandidato();
            ultimaOrigem = "sem-evidencia";
            return;
        }

        if (!falhaDesde) falhaDesde = agora;

        if (!candidato) {
            ocultarOverlay();
            resetarCandidato();
            ultimaOrigem = "aguardando-candidato";
            return;
        }

        if (candidato.texto !== candidatoTexto) {
            candidatoTexto = candidato.texto;
            candidatoDesde = agora;
            candidatoPontuacao = candidato.pontuacao;
        } else {
            candidatoPontuacao = Math.max(candidatoPontuacao, candidato.pontuacao);
        }

        const falhaConfirmada = agora - falhaDesde >= CONFIG.atrasoFalhaMs;
        const candidatoEstavel = agora - candidatoDesde >= CONFIG.estabilidadeCandidatoMs;
        if (!falhaConfirmada || !candidatoEstavel || candidatoPontuacao < CONFIG.pontuacaoMinima) {
            ocultarOverlay();
            ultimaOrigem = "confirmando-fallback";
            return;
        }

        publicarCandidato(candidato, video, raiz);
    }

    function agendarVerificacao() {
        if (timerAgendado) return;
        timerAgendado = window.setTimeout(verificar, CONFIG.intervaloAgendamentoMs);
    }

    function iniciar() {
        if (iniciado) return;
        iniciado = true;
        verificar();
        timerMonitoramento = window.setInterval(verificar, CONFIG.intervaloMonitoramentoMs);
    }

    function parar() {
        if (!iniciado) return;
        iniciado = false;
        window.clearInterval(timerMonitoramento);
        window.clearTimeout(timerAgendado);
        timerMonitoramento = 0;
        timerAgendado = 0;
        if (observer) observer.disconnect();
        observer = null;
        ocultarOverlay();
        if (overlay?.isConnected) overlay.remove();
        overlay = null;
        videoAtual = null;
        raizAtual = null;
        resetarCandidato();
    }

    function obterStatus() {
        return {
            ativo: iniciado,
            fallbackAtivo,
            origem: ultimaOrigem,
            videoEncontrado: Boolean(videoAtual),
            evidenciaValida: performance.now() < evidenciaAte,
            falhaHaMs: falhaDesde ? Math.max(0, performance.now() - falhaDesde) : 0,
            candidato: candidatoTexto
        };
    }

    globalThis.SiaDomFallback = Object.freeze({
        iniciar,
        parar,
        obterStatus
    });

    addEventListener("pagehide", parar, { once: true });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciar, { once: true });
    } else {
        iniciar();
    }
})();
