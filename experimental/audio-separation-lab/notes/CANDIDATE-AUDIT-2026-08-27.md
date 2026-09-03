# Auditoria preliminar de candidatos — 27 de agosto de 2026

## Resultado atual

A auditoria foi iniciada apenas em fontes oficiais. Nenhum peso foi incorporado ao pacote da extensão e nenhum candidato está aprovado para distribuição. O laboratório trata licença de código, licença de pesos, licença da conversão ONNX e licença do runtime como itens separados.

| Candidato | Evidência técnica | Situação de licença | Decisão provisória |
|---|---|---|---|
| HT-Demucs/Demucs | O repositório oficial descreve separação de vocais, bateria, baixo e acompanhamento. O projeto `demucs-web` demonstra uma adaptação ONNX para execução no navegador com WebGPU/WASM. | O repositório Demucs declara MIT, mas os pesos e a conversão ONNX escolhida ainda precisam de evidência própria. | Primeiro candidato de qualidade, somente no laboratório. |
| `demucs-web` | Execução totalmente local com ONNX Runtime Web, WebGPU/WASM e processamento por segmentos. | A licença do repositório, do modelo hospedado e de eventuais dependências precisa ser registrada individualmente. | Candidato de portabilidade web, não aprovado para empacotamento. |
| DeepFilterNet | Estrutura de aprimoramento de fala de baixa complexidade, útil para comparação de ruído e inteligibilidade. | O código declara MIT ou Apache-2.0; os pesos e a forma de redistribuição ainda devem ser verificados. | Comparador, não substituto de separador de voz. |
| DPDFNet/sherpa-onnx | Modelos causais de aprimoramento com opções offline e streaming em ONNX, em taxas de 8, 16 e 48 kHz. | O modelo, os arquivos ONNX e o runtime precisam de auditoria individual. | Comparador de streaming, não separador principal. |

## Bloqueios antes de uso comercial

A declaração MIT do repositório Demucs permite uso comercial do código com preservação dos avisos, mas não é suficiente para concluir que qualquer arquivo de peso, conversão de terceiros ou pacote distribuído possa ser incluído automaticamente. O mesmo princípio vale para DeepFilterNet, DPDFNet e `demucs-web`.

Antes de qualquer empacotamento, deverão ser guardados no laboratório: URL e commit/tag da fonte, arquivo de licença, SHA-256 de cada peso, licença ou aviso associado ao peso, licença do runtime e uma decisão documentada sobre redistribuição. Se algum item não puder ser comprovado, o modelo ficará restrito ao teste local ou será descartado.

## Riscos técnicos já conhecidos

HT-Demucs é orientado principalmente a música. Isso faz dele um candidato lógico para separar voz e acompanhamento, mas não garante bom resultado para professor sobre ruído de sala, reverberação, efeitos de demonstração ou vozes sobrepostas. DeepFilterNet e DPDFNet são modelos de aprimoramento de fala; eles podem melhorar ou reduzir ruído, porém não devem ser apresentados como removedores de voz da faixa original.

## Próxima ação

Receber as amostras reais autorizadas, fixar as versões exatas dos candidatos e concluir a auditoria dos pesos antes de instalar qualquer conjunto pesado. Os resultados desta nota são preliminares e não representam aprovação comercial.

## Referências consultadas

[1]: <https://github.com/facebookresearch/demucs> "Meta Demucs — repositório oficial"
[2]: <https://github.com/facebookresearch/demucs/blob/main/LICENSE> "Demucs — licença MIT do repositório"
[3]: <https://github.com/timcsy/demucs-web> "demucs-web — separação no navegador"
[4]: <https://github.com/rikorose/DeepFilterNet> "DeepFilterNet — aprimoramento de fala"
[5]: <https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/dpdfnet.html> "sherpa-onnx — DPDFNet"

## Evidência adicional — Spleeter via sherpa-onnx

A documentação oficial do sherpa-onnx lista suporte a Spleeter 2-stems e publica um pacote FP16 com dois modelos ONNX: `vocals.fp16.onnx` e `accompaniment.fp16.onnx`, cada um com aproximadamente 19 MB. A mesma documentação fornece arquivos de teste WAV e informa exemplos de execução CPU com fator de tempo real muito baixo, mas esses números publicados não substituem a medição no hardware do laboratório.

A inspeção local confirmou que os modelos baixados têm entradas `x` com forma dinâmica `[2, num_splits, 512, 1024]` e saída `y` com forma `[2, num_splits, 512, 1024]`. O áudio de teste `audio_example.wav` tem 10,919 segundos, estéreo e PCM16 a 44.100 Hz. Os arquivos foram baixados para pastas ignoradas e tiveram hashes registrados em `notes/spleeter-sherpa-artifacts.sha256`.

O runtime sherpa-onnx declara Apache-2.0. A licença dos modelos Spleeter e de cada conversão ONNX ainda precisa ser documentada individualmente antes de qualquer distribuição comercial. O comparador foi escolhido para medir custo e qualidade de uma alternativa leve; não está aprovado para entrar na extensão.

Fontes: <https://k2-fsa.github.io/sherpa/onnx/source-separation/models.html>, <https://github.com/k2-fsa/sherpa-onnx>, <https://github.com/deezer/spleeter>.
