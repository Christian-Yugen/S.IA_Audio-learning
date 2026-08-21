# Fase 3 — runtime WebAssembly

## Build

O sherpa-onnx v1.13.6 foi compilado com Emscripten 4.0.23 pelo script oficial `build-wasm-simd-tts.sh`, usando os assets do candidato Piper PT-BR `faber-medium-int8`.

Artefatos gerados:

```text
sherpa-onnx-wasm-main-tts.js   109,893 bytes
sherpa-onnx-wasm-main-tts.wasm 13,474,632 bytes
sherpa-onnx-wasm-main-tts.data 36,679,194 bytes
sherpa-onnx-tts.js             33,227 bytes
sherpa-onnx-tts.worker.js       2,677 bytes
```

O `.data` contém o filesystem virtual com `model.onnx`, `model.onnx.json`, `tokens.txt` e `espeak-ng-data`. O modelo usado é PT-BR, qualidade medium, 22.050 Hz, um speaker.

## Teste browser

A demo oficial gerada pelo build foi servida localmente em `http://127.0.0.1:6008/index.html`. O navegador exibiu inicialmente “Model downloaded. Initializing text to speech model...”. Após a inicialização, o campo `Speaker ID (0 - 0)` e o botão `Generate` ficaram disponíveis. Isso confirma que o bundle browser e o Worker conseguem inicializar no ambiente Web, antes da integração com o player Coursera.

A geração sonora ainda deve ser acionada para confirmar áudio, e a licença comercial do modelo `faber` continua pendente de confirmação documental; portanto, este é um build técnico experimental.

## Geração de áudio confirmada

Na demo local, foi inserida e sintetizada a frase:

```text
Olá. Esta é uma frase de teste em português brasileiro para a S IA.
```

Após acionar `Generate`, a interface criou um clipe de áudio com controles `Save` e `Delete`. Isso confirma que o Worker retornou samples PCM e que o `AudioContext` reproduziu a saída no navegador. A qualidade fonética ainda precisa de avaliação auditiva humana; o teste comprova o caminho técnico, não a aprovação comercial ou a naturalidade final.

## Amostra

O clipe gerado pela demo foi salvo via botão `Save` para a pasta de downloads do navegador. A amostra serve para inspeção objetiva de formato/duração e avaliação auditiva humana da pronúncia; não é evidência suficiente, por si só, de naturalidade final nem de autorização comercial dos pesos.

## Teste do worker customizado

O harness local foi aberto para executar o worker aditivo `neural-tts/piper-worker.js`. O ciclo retornou apenas `worker-error`, sem mensagem no console do navegador. Isso indica que a demo oficial funciona, mas a adaptação customizada ainda precisa de diagnóstico antes de ser considerada integrada. Nenhuma conclusão de falha do runtime será feita sem capturar a mensagem detalhada.

## Ajuste do harness

O primeiro erro do harness foi um 404 porque o servidor estava apontando para a pasta `artifacts`, enquanto a extensão está em uma pasta irmã `extracted/tts-extension`. A raiz do servidor foi corrigida e o worker passou a ser encontrado. Depois da correção, o harness permanece em `starting` sem emitir `ready`; isso será investigado separadamente da demo oficial, que já inicializou e gerou áudio com sucesso.

## Ajuste de localização dos assets

O log do servidor mostrou que o `locateFile` inicial procurava `.wasm` e `.data` na pasta `neural-tts`, enquanto os arquivos estão em `neural-tts/runtime`. O worker foi corrigido para resolver os assets a partir de `runtime/`.

Após a correção, o harness local deixou de apresentar 404, mas ainda permaneceu em `starting` durante a janela observada, sem emitir `ready`. A demo oficial continua sendo a validação positiva; a causa do atraso do harness precisa ser isolada antes da liberação.

## Worker customizado aprovado tecnicamente

Após adicionar cache-busting ao harness, o worker customizado da S·IA completou o ciclo real:

```text
sia-piper-ready     sampleRate=22050 numSpeakers=1
sia-piper-result    sampleCount=69120 durationSeconds=3.1346938775510202
sia-piper-disposed requestId=2
```

O ciclo confirma que `piper-worker.js` resolve os assets em `runtime/`, carrega o WASM/DATA, inicializa o Piper, gera PCM e libera o motor. Essa validação é técnica e não substitui a avaliação auditiva nem a confirmação final da licença comercial dos pesos.
