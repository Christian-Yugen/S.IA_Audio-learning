# Fase 2 — artefatos do provedor neural

## Descoberta inicial

A documentação oficial do sherpa-onnx separa duas distribuições JavaScript:

- `sherpa-onnx`: pacote baseado em WebAssembly, adequado ao navegador, sem suporte a multithreading interno.
- `sherpa-onnx-node`: pacote baseado em native addon, com multithreading, inadequado para distribuição direta dentro de uma extensão Chrome.

Fonte: https://k2-fsa.github.io/sherpa/onnx/speaker-diarization/javascript.html

A extensão deverá usar a variante WebAssembly dentro de um Web Worker. O Worker isola o processamento da página, mas não transforma a biblioteca em multithread; o runtime deve ser tratado como single-thread e medido em máquinas reais.

O pacote npm retornou captcha no navegador, portanto a inspeção será feita por metadados/tarball oficial com scripts de instalação desativados, sem executar artefatos externos.

## Build browser oficial

A documentação oficial do sherpa-onnx para TTS em WebAssembly orienta um build específico com Emscripten (`build-wasm-simd-tts.sh`). O resultado não é apenas o pacote npm Node: ele gera `sherpa-onnx-wasm-main.js`, `sherpa-onnx-wasm-main.wasm`, `sherpa-onnx-wasm-main.data`, `sherpa-onnx.js`, `app.js` e os assets do modelo.

Fonte: https://k2-fsa.github.io/sherpa/onnx/tts/wasm/build.html

A própria documentação mostra, para uma voz Piper em inglês, aproximadamente 11 MB de WASM e 92 MB de arquivo `.data`, além do modelo e dos arquivos de fonemização. O tamanho real da voz PT-BR deverá ser medido após o build. Isso confirma que a implantação é possível, mas precisa tratar tamanho de extensão e memória como requisitos de primeira classe.

O pacote npm `sherpa-onnx@1.13.6` obtido para inspeção tem 15,1 MB descompactado, mas seu entrypoint CommonJS carrega `sherpa-onnx-wasm-nodejs.js`, e o runtime contém a proteção `NODERAWFS is currently only supported on Node.js environment`. Esse pacote não será integrado diretamente no Chrome. A implementação deverá usar o build browser oficial ou um artefato browser equivalente, com licença e hash fixados.

## Resultado da inspeção de releases

A release oficial v1.13.6 foi consultada por API. O único asset filtrado simultaneamente como WASM e TTS foi um pacote específico do modelo Pocket TTS; não foi encontrado um bundle genérico Piper TTS WASM pronto para download.

Isso confirma que, para Piper PT-BR, será necessário gerar o bundle a partir do alvo oficial `build-wasm-simd-tts.sh` ou adaptar um build browser equivalente. O pacote npm inspecionado não substitui esse processo porque seu entrypoint/runtime é orientado ao ambiente Node.

## Licença das vozes Piper

A documentação oficial `VOICES.md` informa que cada voz deve ser distribuída com seu próprio model card e que algumas vozes possuem licenças restritivas. O projeto não impõe restrições adicionais aos modelos, mas recomenda revisão individual da licença antes da distribuição.

Fonte: https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md

O arquivo `pt_BR-dii-high-int8` baixado para teste declara explicitamente CC BY-NC-SA 4.0 e proíbe uso comercial; está bloqueado e não será integrado.

O arquivo `pt_BR-cadu-medium-int8` declara idioma PT-BR, qualidade medium, 22.050 Hz e licença CC0 para o dataset associado, mas o model card não contém uma frase explícita dizendo que os pesos podem ser redistribuídos comercialmente. Antes de liberar a extensão, a licença da voz/modelo deve ser confirmada com o distribuidor/model card e arquivada; por enquanto `cadu` é candidato de laboratório, não artefato comercial aprovado.

## Candidato PT-BR atual: faber medium INT8

Foi baixado o asset oficial `vits-piper-pt_BR-faber-medium-int8.tar.bz2` da release `tts-models` do sherpa-onnx.

```text
SHA-256: dbc8b1d7d729fd417ea78a350ed35696c928770ac93513d3f507bd4e88eee3fd
Arquivo compactado: 20.3 MB aproximadamente
Modelo ONNX: pt_BR-faber-medium.onnx, 18,681,781 bytes
```

O model card declara idioma `pt_BR`, um speaker, qualidade `medium`, sample rate de 22.050 Hz e licença CC0 para o dataset. Ele não traz uma declaração explícita e independente de licença comercial dos pesos. Portanto, `faber` será usado no build de laboratório e validação técnica, mas não será marcado como aprovado para distribuição comercial até essa autorização ser documentada.

O candidato `dii-high-int8` está descartado porque o próprio pacote declara CC BY-NC-SA 4.0 e proíbe uso comercial.
