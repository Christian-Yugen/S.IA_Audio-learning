# Fase 4 — bridge e áudio

O harness browser do `piper-bridge.js` real foi aberto com um mock mínimo de `chrome.runtime.getURL` e `chrome.storage`. O clique de teste ativou o provedor e reportou:

```json
{"engine":"piper-local","state":"idle","queued":0,"ready":false,"storageReady":true}
```

O estado inicial `ready=false` é esperado porque o Worker é carregado sob demanda. A geração e os callbacks `start/end` ainda precisam ser observados.

## Bridge real aprovado tecnicamente

Após o clique no harness, o bridge real carregou o Worker e produziu áudio. O resultado observado foi:

```json
{"event":"start","elapsedMs":1962}
{"event":"end","events":["start","end"],"status":{"engine":"piper-local","state":"ready","queued":0,"ready":true,"storageReady":true}}
```

Isso confirma o caminho completo `PiperLocalProvider → Worker → sherpa-onnx WASM → PCM → AudioContext → callbacks`, com carregamento preguiçoso e sem servidor de inferência.

## Verificação de inteligibilidade

A amostra foi identificada como WAV PCM 16-bit, mono, 22.050 Hz, com 177.196 bytes. A transcrição automática reconheceu:

```text
Olá, esta é uma frase de teste em português brasileiro para a SIA
```

A transcrição é coerente com a frase-alvo. Isso indica inteligibilidade técnica do modelo `faber` para a frase testada, mas não substitui o teste auditivo humano de sotaque, prosódia e naturalidade.
