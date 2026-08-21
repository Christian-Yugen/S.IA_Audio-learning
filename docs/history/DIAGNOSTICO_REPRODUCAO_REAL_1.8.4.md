# Diagnóstico e correção real da S·IA 1.8.4

**Projeto:** S·IA — Audio-learning by UXBRAS®  
**Data do teste:** 21 de agosto de 2026  
**Ambiente:** Chromium 151 isolado, Manifest V3, página fixture servida com URL `https://www.coursera.org/learn/data-analytics-introduction/lecture/Oy6ru/case-study-scrubbing-data`

## Resumo executivo

O defeito foi reproduzido em um Chromium real. A seleção do motor era aplicada, mas o áudio neural não chegava ao callback `onstart` porque havia três falhas encadeadas: o Worker iniciado a partir do content script era bloqueado por origem cruzada; a tentativa Blob precisava resolver os assets a partir de uma URL `blob:`; e, depois de o Worker funcionar, um `Float32Array` devolvido por `chrome.runtime.sendMessage` não mantinha a propriedade `.length` no transporte entre contextos. Além disso, durante o teste manual, o monitor da página pausada cancelava a fila neural repetidamente.

O modelo faber não era a causa. A validação nativa do mesmo modelo Piper PT-BR gerou áudio em aproximadamente 2,04 segundos. No Chrome, o Worker passou a inicializar e a geração passou a entregar PCM ao content script depois da correção arquitetural.

## Causas comprovadas

| Causa | Evidência observada | Correção aplicada |
|---|---|---|
| Worker direto no content script | `SecurityError`: o Worker `chrome-extension://.../piper-worker.js` não podia ser acessado a partir de `https://www.coursera.org`. | Host neural em `offscreen.html`, com Worker na origem da extensão. |
| Resolução de runtime dentro de Blob | O Worker Blob era criado, mas a resolução relativa usando `self.location.href` sobre `blob:` era inválida. | O Worker recebe os URLs dos assets e não tenta resolver `runtime/` quando sua origem é Blob. |
| CSP de WebAssembly | A política padrão de páginas da extensão desabilita WebAssembly. | Manifesto declara `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';`, que é a política mínima documentada pelo Chrome [1]. |
| Transporte do PCM | O resultado chegava como objeto serializado sem `.length`; o bridge reconstruía um buffer vazio. | O offscreen converte samples para `Array.from(...)`; o bridge reconstrói `Float32Array`. |
| Cancelamento durante teste pausado | O monitor chamava `interromperFala()` repetidamente, alterando a sequência de fala enquanto o Piper aguardava `ready`. | Nova flag protege somente o teste manual neural; a regra normal de pausa da aula continua preservada. |
| Contexto invalidado após reload | Abas antigas geravam `Extension context invalidated` ao salvar histórico. | Salvamento e remoção de storage agora capturam essa rejeição sem erro não tratado. |

## Arquitetura corrigida

```text
Popup
  │ chrome.tabs.sendMessage
  ▼
Content script Coursera
  │ proxy SiaPiperVoice
  │ chrome.runtime.sendMessage(target=sia-piper-router)
  ▼
Service worker
  │ garante offscreen.html
  │ encaminha target=sia-piper-offscreen
  ▼
Offscreen document da extensão
  │ Worker chrome-extension://...
  ▼
Piper / sherpa-onnx WebAssembly
  │ PCM local
  ▼
Offscreen → service worker → content script
  │ Array numérico → Float32Array
  ▼
AudioContext da página Coursera
  │ AudioBufferSourceNode.start()
  ▼
Callback onstart da S·IA
```

O popup não carrega `piper-bridge.js`, `piper-worker.js`, `.wasm` ou `.data`. A página Coursera também não inicia diretamente um Worker de origem da extensão. O Worker neural fica no documento offscreen, criado com a razão `WORKERS`, uma razão prevista pela API oficial do Chrome [2].

## Teste real executado

A sequência foi executada em Chromium 151 com uma instalação limpa da extensão carregada por diretório:

| Etapa | Resultado observado |
|---|---|
| Content script na URL Coursera fixture | `videoFound: true`, `syncEngineReady: true` |
| Estado inicial | `voiceEngine: browser`, `voiceEngineState: idle` |
| Seleção Piper | `ok: true`, `voiceEngine: piper-local` |
| Prime de áudio | `ok: true`, `state: running`, `sampleRate: 22050` |
| Teste neural | `ok: true`, `started: true`, `engine: piper-local`, `state: playing` |
| Estado após teste | `voiceEngine: piper-local`, `voiceEngineState: ready` |
| Reversão para navegador | `ok: true`, `voiceEngine: browser` |
| Estado final nativo | `voiceEngine: browser`, `voiceEngineState: ready` |

Na execução neural, o content script recebeu **50.432 samples PCM a 22.050 Hz** e chamou `AudioBufferSourceNode.start()` antes de disparar `onstart`. Portanto, o teste confirmou o fluxo real de geração, transporte e início do AudioBuffer no Chrome, não apenas a entrada da frase em uma fila simulada. O Chromium utilizado foi headless; por isso a validação automatizada confirmou o início do pipeline de áudio e não substitui a percepção auditiva em uma janela normal do Chrome.

## Regressão

Foram executados os seguintes controles:

```bash
node --check content.js
node --check popup.js
node --check neural-tts/piper-bridge.js
node --check neural-tts/piper-worker.js
node --check service-worker.js
node --check offscreen.js
node --test tests/sync-engine.test.js tests/piper-bridge.test.js
```

Resultado: **20 testes aprovados, 0 falhas**, além de checagem sintática aprovada para todos os scripts modificados.

Também foi verificado que `popup.html` não contém referência a `piper-bridge.js` e que o manifesto inclui `offscreen.html`, a permissão `offscreen`, os recursos do runtime e a CSP compatível com WebAssembly.

## Instalação e teste no Chrome do usuário

Em `chrome://extensions`, remova ou desative as versões 1.8.2, 1.8.3 e qualquer duplicata da S·IA. Carregue somente a pasta do pacote 1.8.4 por **Carregar sem compactação**. A pasta selecionada deve ser aquela que contém diretamente `manifest.json`.

Depois de carregar, feche completamente todas as abas antigas do Coursera e abra uma nova. Essa etapa é necessária porque um content script de uma versão removida não é atualizado retroativamente em uma página que permaneceu aberta.

No popup, confirme `v1.8.4 · Piper PT-BR experimental`. Selecione **Voz neural local PT-BR — experimental**, clique em **Testar voz** e aguarde o retorno. Depois, troque para **Voz do navegador** para confirmar que o motor original continua disponível.

Não copie arquivos individuais para outra pasta e não carregue `piper-bridge.js` no popup. O pacote deve ser carregado como uma pasta única, mantendo a estrutura `neural-tts/`, `offscreen.html`, `offscreen.js` e `manifest.json` no mesmo nível.

## Referências

[1]: https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy "Chrome Extensions — Content Security Policy"

[2]: https://developer.chrome.com/docs/extensions/reference/api/offscreen "Chrome Extensions — Offscreen API"

[3]: https://k2-fsa.github.io/sherpa/onnx/tts/wasm/build.html "sherpa-onnx — Build WebAssembly TTS"
