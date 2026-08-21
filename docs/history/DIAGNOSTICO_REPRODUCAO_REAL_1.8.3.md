
## Segunda reprodução após a correção Blob

Com a extensão reiniciada em Chromium real e a rota fixture correta em HTTPS 443, o fluxo chegou além do erro de segurança anterior. O resultado foi:

```text
TEST_NEURAL {"ok":false,"reason":"piper-fallback","message":"[Error] Uncaught SyntaxError: Invalid or unexpected token"}
```

Isso confirma que o fallback Blob está sendo utilizado, mas o código combinado do bootstrap e do worker contém uma sequência inválida. O erro surgiu em `piper-bridge.js` durante a criação do Worker Blob, antes do runtime sherpa-onnx ser inicializado. A causa provável é o bootstrap ter recebido os caracteres literais `\\n` em vez de uma quebra de linha real, devido ao escape duplicado na template string.

O bloqueio cross-origin anterior não aparece mais nessa execução. O próximo ajuste é corrigir somente o escape do bootstrap e repetir o mesmo teste real.

## Terceira reprodução: separação entre modelo e worker

A mesma configuração foi executada pela API Python nativa do sherpa-onnx 1.13.6 com o modelo faber extraído:

```text
READY 22050 1
GENERATED 45056 22050 2.043356009070295
```

Portanto, o modelo e os tokens são válidos e a inferência nativa produz 2,04 segundos de PCM.

No Chromium real, o worker Blob carregou o bundle Emscripten e chegou a `voiceEngineState: ready`, mas a mensagem de síntese ficou presa dentro da chamada WASM. Em seguida, um teste direto com `new Worker(chrome.runtime.getURL("neural-tts/piper-worker.js"))` a partir de uma página `chrome-extension://` não recebeu nem `sia-piper-ready` nem `sia-piper-error` no prazo de 180 segundos. Isso confirma que o caminho atual do worker/runtime não é uma base confiável para distribuição, mesmo com o fallback Blob.

Conclusão operacional: não basta trocar a origem do Worker. A chamada atual combina inicialização síncrona/longa do runtime Emscripten com um worker que não entrega um handshake observável. A correção precisa isolar o runtime em um documento da extensão ou usar uma implementação WASM/ONNX Web comprovadamente assíncrona, com timeout de inicialização e geração. O modelo faber não é a causa.

## Referência oficial de CSP

A documentação do Chrome confirma que a política `extension_pages` se aplica a páginas e workers da extensão e que o mínimo permitido inclui `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';`. Ela também informa que, sem essa política, WebAssembly fica desabilitado por padrão em páginas da extensão. Fonte: [Chrome Extensions — Content Security Policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).

A documentação oficial do build TTS do sherpa-onnx mostra que o artefato WebAssembly é executado em browser com `model.onnx`, `tokens.txt`, `espeak-ng-data`, `.wasm` e `.data`, e que a geração retorna áudio no demo oficial. Fonte: [sherpa-onnx — Build WebAssembly TTS](https://k2-fsa.github.io/sherpa/onnx/tts/wasm/build.html).

A documentação oficial do Chrome também confirma que a permissão `offscreen` é necessária, que somente `chrome.runtime` fica disponível no documento offscreen e que a razão `WORKERS` existe para documentos que precisam criar workers. Diferentemente de `AUDIO_PLAYBACK`, a razão `WORKERS` não impõe limite de vida de 30 segundos. Fonte: [Chrome Extensions — Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen).

## Correção definitiva validada no Chrome

Foi implementado um host `offscreen.html` com razão `WORKERS`. O content script agora usa um proxy de mensagens; o service worker cria o offscreen e encaminha os comandos; o offscreen mantém o Worker Piper na origem `chrome-extension://` autorizada pela CSP.

A primeira versão do roteador tinha ainda um erro de ordem de propriedades (`...message` sobrescrevia `target: "sia-piper-offscreen"`), corrigido em seguida.

A primeira versão do transporte devolvia `Float32Array` diretamente por `chrome.runtime.sendMessage`. O Chrome entregava esse typed array como objeto serializado sem `.length`, e o bridge criava um áudio vazio. O offscreen agora converte explicitamente os samples para `Array.from(...)`; o bridge reconstrói o `Float32Array` no content script.

Teste real posterior, em Chromium 151 isolado:

```text
ROUTE_INIT {"ok":true,"type":"sia-piper-ready","sampleRate":22050,"numSpeakers":1,"state":"ready"}
ROUTE_GENERATE {"type":"sia-piper-result","requestId":777,"samples":7277,"sampleRate":22050}
TEST_NEURAL {"ok":true,"started":true,"engine":"piper-local","state":"playing"}
STATUS_AFTER voiceEngine="piper-local", voiceEngineState="ready"
```

O resultado `started:true` ocorre no callback executado depois de `AudioBufferSourceNode.start()`, portanto confirma o início do áudio no bridge, não apenas o enfileiramento. Os 20 testes de regressão e as checagens sintáticas também passaram após a implementação do host.
