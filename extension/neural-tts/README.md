# S·IA — Piper PT-BR local

Este diretório contém o provedor neural local opcional da S·IA.

## Estado

A alternativa é experimental. O modo padrão continua sendo `speechSynthesis` do navegador. O Piper só é carregado quando o usuário escolhe **Voz neural local PT-BR — experimental** no pop-up.

## Arquitetura

- `piper-worker.js` inicializa o bundle browser do sherpa-onnx, gera PCM e envia o resultado por `postMessage`.
- `piper-bridge.js` encapsula o Worker, cria o `AudioContext`, controla fila, cancelamento e fallback.
- `runtime/` contém o build WebAssembly TTS gerado pelo sherpa-onnx v1.13.6 com Emscripten 4.0.23.
- `licenses/` contém os avisos conhecidos e o model card usado no build.

## Limites deliberados

O novo provedor não modifica o detector de legendas, o motor de sincronização, o fallback DOM, o histórico ou o Companion. A opção é desligada por padrão. Uma falha de inicialização ou geração desativa o Piper e retorna à voz do navegador.

## Artefato de laboratório

A voz usada no primeiro build técnico é `pt_BR-faber-medium-int8`, com sample rate de 22.050 Hz e um speaker. O model card declara CC0 para o dataset, mas a autorização explícita de redistribuição comercial dos pesos ainda deve ser confirmada antes de publicar a extensão ou vender o produto. O pacote `pt_BR-dii-high-int8` foi descartado por declarar CC BY-NC-SA 4.0 e proibir uso comercial.

## Build do runtime

O runtime browser foi produzido pelo alvo oficial `build-wasm-simd-tts.sh` do sherpa-onnx v1.13.6, com assets Piper preparados como `model.onnx`, `model.onnx.json`, `tokens.txt` e `espeak-ng-data`.

A geração foi validada no navegador em harness local com os eventos `ready`, `result` e `disposed`. A ponte real também foi validada com callbacks `start` e `end`.

## Correção 1.8.2

A versão 1.8.2 prepara o `AudioContext` no clique do usuário, prepara também a instância do content script por meio de `SIA_PRIME_NEURAL_AUDIO`, aceita a taxa padrão do dispositivo quando 22.050 Hz não é suportado, valida samples/taxa antes de montar o buffer e identifica a etapa da falha no erro. Gestos na página (`pointerdown`, `keydown` e `touchstart`) também tentam liberar o áudio da leitura contínua.
