# Runners offline do laboratório

Este diretório contém cópias auditadas dos módulos necessários para repetir os benchmarks HT-Demucs e Spleeter fora da extensão. O código derivado de `demucs-web` permanece acompanhado da licença MIT em `LICENSE.demucs-web`.

## Dependência

Os runners usam Node.js e `onnxruntime-node`. A dependência deve ser instalada em um ambiente de laboratório separado, nunca dentro da extensão Chrome:

```bash
pnpm add onnxruntime-node
```

Os pesos ONNX não ficam no Git. Eles devem ser baixados de uma fonte documentada, verificados por SHA-256 e armazenados em `experimental/audio-separation-lab/models/`.

## HT-Demucs

```bash
node run-separation.mjs \
  ../../corpus/working/P01.wav \
  ../../models/htdemucs_embedded.onnx \
  ../../results/P01-htdemucs-cpu
```

A entrada deve ser WAV PCM16 estéreo a 44.100 Hz. O runner grava quatro stems e `metrics.json`.

## Spleeter FP16

```bash
node run-spleeter.mjs \
  ../../corpus/raw/public-audio-example.wav \
  ../../models/spleeter-sherpa/sherpa-onnx-spleeter-2stems-fp16/vocals.fp16.onnx \
  ../../models/spleeter-sherpa/sherpa-onnx-spleeter-2stems-fp16/accompaniment.fp16.onnx \
  ../../results/P02-spleeter-cpu
```

O runner reproduz a sequência STFT, inferência dos dois modelos, máscaras e iSTFT descrita no código oficial do sherpa-onnx. O arquivo de teste do fornecedor não é uma aula e não deve ser usado para concluir qualidade pedagógica.

## Limites

Esses runners não capturam áudio de abas, não acessam captions, não usam a fila de voz da S·IA e não modificam Coursera, Udemy ou YouTube. Eles existem apenas para medição offline e para reduzir o risco de uma integração prematura.
