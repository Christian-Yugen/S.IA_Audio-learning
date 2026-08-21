# S·IA 1.8.0 — Piper PT-BR local experimental

## Resultado

Foi adicionada uma alternativa neural local à S·IA sem substituir o caminho existente de `speechSynthesis`. A extensão continua usando a voz do navegador por padrão. O Piper é carregado sob demanda somente quando o usuário seleciona `Voz neural local PT-BR — experimental` no pop-up.

## Fluxo

```text
legenda atual → content.js → seleção do motor
                              ├─ browser: SpeechSynthesis original
                              └─ piper-local: PiperLocalProvider → Worker → sherpa-onnx WASM → PCM → AudioContext
```

O detector de legendas, o fallback DOM, o `sync-engine.js`, a fila lógica, o replay, o histórico, o Companion e o comportamento do vídeo permanecem separados do runtime neural.

## Arquivos adicionados

- `neural-tts/piper-worker.js`: worker isolado, inicialização, geração PCM e descarte.
- `neural-tts/piper-bridge.js`: provedor local, carregamento preguiçoso, fila de áudio, cache de oito frases, cancelamento, callbacks, pitch, volume e fallback automático.
- `neural-tts/runtime/*`: build browser do sherpa-onnx v1.13.6 com Emscripten 4.0.23.
- `neural-tts/licenses/*`: model card, licença Apache-2.0 do sherpa-onnx e aviso de terceiros.
- `neural-tts/README.md`: documentação do estado experimental.
- `tests/piper-bridge.test.js`: testes isolados do novo bridge.

## Arquivos originais tocados apenas como ponte

- `manifest.json`: registra bridge, Worker, assets e versão 1.8.0.
- `content.js`: adiciona somente a seleção opt-in do provider, teste neural, cancelamento e status; o ramo nativo permanece igual quando o engine é `browser`.
- `popup.html`/`popup.js`: adiciona seletor de motor e chave `sia_voice_engine`, com default `browser`.
- `scripts/package-extension.ps1`: inclui a pasta `neural-tts` no ZIP.

Os hashes do `sync-engine.js`, `dom-fallback.js`, `sidepanel.js`, `service-worker.js` e `tests/sync-engine.test.js` permanecem idênticos aos do baseline.

## Validação realizada

Foram aprovados 19 testes automatizados, incluindo os 15 testes originais do motor e quatro testes do bridge. A sintaxe de todos os scripts foi validada, o manifesto foi parseado e os assets `.wasm` e `.data` foram confirmados no ZIP.

O worker customizado passou no navegador pelo ciclo `ready → result → disposed`, gerando 69.120 samples a 22.050 Hz. O bridge real passou pelo ciclo `start → end`, com aproximadamente 1,96 s até o início da primeira reprodução no harness local. A amostra PT-BR foi reconhecida por transcrição automática de forma coerente com a frase-alvo.

## Ativação manual

1. Abra `chrome://extensions`.
2. Ative o modo de desenvolvedor.
3. Carregue sem compactação a pasta `extracted/tts-extension` ou instale o ZIP experimental.
4. Abra uma aula do Coursera.
5. Abra o pop-up da S·IA.
6. Em **Motor**, selecione **Voz neural local PT-BR — experimental**.
7. Use **Testar voz** antes de iniciar a aula.

Para voltar ao comportamento original, selecione **Voz do navegador — padrão atual**. Se o Piper falhar ao carregar ou gerar áudio, ele se desativa e o bridge solicita retorno à voz do navegador.

## Bloqueio de publicação comercial

O build técnico usa `pt_BR-faber-medium-int8`. O model card confirma `pt_BR` e CC0 para o dataset, mas não concede, de forma explícita e inequívoca, uma licença comercial dos pesos finais. Portanto, o ZIP é **experimental e não está liberado para publicação comercial** até a confirmação da licença do modelo/voz e das dependências estáticas. O modelo `pt_BR-dii-high-int8` não foi usado porque declara CC BY-NC-SA 4.0.

## Entrega

O pacote distribuível desta etapa é `sia-extension-1.8.0-piper-experimental.zip`. Ele contém o runtime local, mas não contém os harnesses nem os testes.
