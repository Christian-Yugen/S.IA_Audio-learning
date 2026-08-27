import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import ort from 'onnxruntime-node';
import { fft, ifft, getHannWindow } from './src/fft.js';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;
const HOP_SIZE = 1024;
const MODEL_BINS = 1024;
const FRAMES_PER_SPLIT = 512;

function readWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('entrada precisa ser WAV RIFF');
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'fmt ') fmt = buffer.subarray(start, start + size);
    if (id === 'data') data = buffer.subarray(start, start + size);
    offset = start + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV sem blocos fmt/data');
  const format = fmt.readUInt16LE(0);
  const channels = fmt.readUInt16LE(2);
  const sampleRate = fmt.readUInt32LE(4);
  const bits = fmt.readUInt16LE(14);
  if (format !== 1 || bits !== 16 || (channels !== 1 && channels !== 2)) {
    throw new Error(`WAV incompatível: formato=${format}, canais=${channels}, bits=${bits}`);
  }
  const frames = Math.floor(data.length / (channels * 2));
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    const base = frame * channels * 2;
    left[frame] = data.readInt16LE(base) / 32768;
    right[frame] = (channels === 2 ? data.readInt16LE(base + 2) : data.readInt16LE(base)) / 32768;
  }
  return { left, right, sampleRate };
}

function writeWav(left, right, sampleRate) {
  const frames = Math.min(left.length, right.length);
  const dataSize = frames * 4;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(sampleRate * 4, 28);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < frames; index += 1) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, left[index] || 0)) * 32767), 44 + index * 4);
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, right[index] || 0)) * 32767), 46 + index * 4);
  }
  return buffer;
}

function stftChannel(signal) {
  const frames = Math.floor((signal.length - FFT_SIZE) / HOP_SIZE) + 1;
  const bins = FFT_SIZE / 2 + 1;
  const window = getHannWindow(FFT_SIZE);
  const real = new Float32Array(frames * bins);
  const imag = new Float32Array(frames * bins);
  const frame = new Float32Array(FFT_SIZE);
  const fftReal = new Float32Array(FFT_SIZE);
  const fftImag = new Float32Array(FFT_SIZE);
  for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
    const start = frameIndex * HOP_SIZE;
    for (let i = 0; i < FFT_SIZE; i += 1) frame[i] = signal[start + i] * window[i];
    fft(fftReal, fftImag, frame, FFT_SIZE);
    for (let bin = 0; bin < bins; bin += 1) {
      real[frameIndex * bins + bin] = fftReal[bin];
      imag[frameIndex * bins + bin] = fftImag[bin];
    }
  }
  return { real, imag, frames, bins };
}

function istftChannel(real, imag, frames, targetLength) {
  const outputLength = Math.min(targetLength, (frames - 1) * HOP_SIZE + FFT_SIZE);
  const output = new Float32Array(outputLength);
  const windowSum = new Float32Array(outputLength);
  const window = getHannWindow(FFT_SIZE);
  const fullReal = new Float32Array(FFT_SIZE);
  const fullImag = new Float32Array(FFT_SIZE);
  const outReal = new Float32Array(FFT_SIZE);
  const outImag = new Float32Array(FFT_SIZE);
  for (let frameIndex = 0; frameIndex < frames; frameIndex += 1) {
    fullReal.fill(0);
    fullImag.fill(0);
    for (let bin = 0; bin < FFT_SIZE / 2 + 1; bin += 1) {
      fullReal[bin] = real[frameIndex * (FFT_SIZE / 2 + 1) + bin];
      fullImag[bin] = imag[frameIndex * (FFT_SIZE / 2 + 1) + bin];
    }
    for (let bin = 1; bin < FFT_SIZE / 2; bin += 1) {
      fullReal[FFT_SIZE - bin] = fullReal[bin];
      fullImag[FFT_SIZE - bin] = -fullImag[bin];
    }
    ifft(outReal, outImag, fullReal, fullImag, FFT_SIZE);
    const start = frameIndex * HOP_SIZE;
    for (let i = 0; i < FFT_SIZE && start + i < outputLength; i += 1) {
      output[start + i] += outReal[i] * window[i];
      windowSum[start + i] += window[i] * window[i];
    }
  }
  for (let i = 0; i < outputLength; i += 1) {
    if (windowSum[i] > 1e-8) output[i] /= windowSum[i];
  }
  return output;
}

function makeModelInput(leftStft, rightStft) {
  const numSplits = Math.ceil(leftStft.frames / FRAMES_PER_SPLIT);
  const input = new Float32Array(2 * numSplits * FRAMES_PER_SPLIT * MODEL_BINS);
  for (let channel = 0; channel < 2; channel += 1) {
    const spec = channel === 0 ? leftStft : rightStft;
    for (let frame = 0; frame < spec.frames; frame += 1) {
      const split = Math.floor(frame / FRAMES_PER_SPLIT);
      const frameInSplit = frame % FRAMES_PER_SPLIT;
      for (let bin = 0; bin < MODEL_BINS; bin += 1) {
        const source = frame * spec.bins + bin;
        const magnitude = Math.hypot(spec.real[source], spec.imag[source]);
        const target = ((channel * numSplits + split) * FRAMES_PER_SPLIT + frameInSplit) * MODEL_BINS + bin;
        input[target] = magnitude;
      }
    }
  }
  return { input, numSplits };
}

async function runModel(modelPath, input, numSplits) {
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'basic',
    enableCpuMemArena: false,
    enableMemPattern: false,
  });
  const tensor = new ort.Tensor('float32', input, [2, numSplits, FRAMES_PER_SPLIT, MODEL_BINS]);
  const result = await session.run({ [session.inputNames[0]]: tensor });
  return { data: result[session.outputNames[0]].data, session };
}

function buildMasks(vocals, accompaniment, numSplits, frames) {
  const total = 2 * numSplits * FRAMES_PER_SPLIT * MODEL_BINS;
  const vocalMask = new Float32Array(total);
  const accompanimentMask = new Float32Array(total);
  for (let index = 0; index < total; index += 1) {
    const v = vocals[index];
    const a = accompaniment[index];
    const denominator = v * v + a * a + 1e-10;
    vocalMask[index] = (v * v + 5e-11) / denominator;
    accompanimentMask[index] = (a * a + 5e-11) / denominator;
  }
  return { vocalMask, accompanimentMask, numSplits, frames };
}

function reconstruct(mask, leftStft, rightStft, targetLength) {
  const output = [];
  const frames = leftStft.frames;
  const bins = FFT_SIZE / 2 + 1;
  const numSplits = Math.ceil(frames / FRAMES_PER_SPLIT);
  for (let channel = 0; channel < 2; channel += 1) {
    const sourceStft = channel === 0 ? leftStft : rightStft;
    const real = new Float32Array(frames * bins);
    const imag = new Float32Array(frames * bins);
    for (let frame = 0; frame < frames; frame += 1) {
      const split = Math.floor(frame / FRAMES_PER_SPLIT);
      const frameInSplit = frame % FRAMES_PER_SPLIT;
      for (let bin = 0; bin < MODEL_BINS; bin += 1) {
        const maskIndex = ((channel * numSplits + split) * FRAMES_PER_SPLIT + frameInSplit) * MODEL_BINS + bin;
        const factor = mask[maskIndex];
        const sourceIndex = frame * sourceStft.bins + bin;
        const outputIndex = frame * bins + bin;
        real[outputIndex] = sourceStft.real[sourceIndex] * factor;
        imag[outputIndex] = sourceStft.imag[sourceIndex] * factor;
      }
    }
    output.push(istftChannel(real, imag, frames, targetLength));
  }
  return { left: output[0], right: output[1] };
}

async function main() {
  const [inputPath, vocalsPath, accompanimentPath, outputDir] = process.argv.slice(2);
  if (!inputPath || !vocalsPath || !accompanimentPath || !outputDir) {
    throw new Error('uso: node run-spleeter.mjs INPUT.wav VOCALS.onnx ACCOMPANIMENT.onnx OUTPUT_DIR');
  }
  const input = readWav(await fs.readFile(inputPath));
  if (input.sampleRate !== SAMPLE_RATE) throw new Error(`taxa ${input.sampleRate}; esperado ${SAMPLE_RATE}`);
  const paddedLength = input.left.length + FFT_SIZE;
  const leftPadded = new Float32Array(paddedLength);
  const rightPadded = new Float32Array(paddedLength);
  leftPadded.set(input.left);
  rightPadded.set(input.right);
  const started = process.hrtime.bigint();
  const leftStft = stftChannel(leftPadded);
  const rightStft = stftChannel(rightPadded);
  const prepared = makeModelInput(leftStft, rightStft);
  const modelStarted = process.hrtime.bigint();
  const [vocalsResult, accompanimentResult] = await Promise.all([
    runModel(vocalsPath, prepared.input, prepared.numSplits),
    runModel(accompanimentPath, prepared.input, prepared.numSplits),
  ]);
  const summarizeTensor = data => {
    let min = Infinity;
    let max = -Infinity;
    let sumSquares = 0;
    for (const value of data) {
      min = Math.min(min, value);
      max = Math.max(max, value);
      sumSquares += value * value;
    }
    return { min, max, rms: Math.sqrt(sumSquares / data.length), length: data.length };
  };
  console.error(JSON.stringify({
    vocalsOutput: summarizeTensor(vocalsResult.data),
    accompanimentOutput: summarizeTensor(accompanimentResult.data),
  }));
  const masks = buildMasks(vocalsResult.data, accompanimentResult.data, prepared.numSplits, leftStft.frames);
  const summarizeArray = data => {
    let min = Infinity;
    let max = -Infinity;
    let sumSquares = 0;
    let clipped = 0;
    for (const value of data) {
      min = Math.min(min, value);
      max = Math.max(max, value);
      sumSquares += value * value;
      if (Math.abs(value) > 1) clipped += 1;
    }
    return { min, max, rms: Math.sqrt(sumSquares / data.length), clipped, length: data.length };
  };
  console.error(JSON.stringify({
    vocalMask: summarizeArray(masks.vocalMask),
    accompanimentMask: summarizeArray(masks.accompanimentMask),
  }));
  const vocalStem = reconstruct(masks.vocalMask, leftStft, rightStft, input.left.length);
  const accompanimentStem = reconstruct(masks.accompanimentMask, leftStft, rightStft, input.left.length);
  console.error(JSON.stringify({
    vocalLeft: summarizeArray(vocalStem.left),
    accompanimentLeft: summarizeArray(accompanimentStem.left),
  }));
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'vocals.wav'), writeWav(vocalStem.left, vocalStem.right, SAMPLE_RATE));
  await fs.writeFile(path.join(outputDir, 'accompaniment.wav'), writeWav(accompanimentStem.left, accompanimentStem.right, SAMPLE_RATE));
  const separationSeconds = Number(process.hrtime.bigint() - modelStarted) / 1e9;
  const wallSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  const modelBytes = await Promise.all([fs.readFile(vocalsPath), fs.readFile(accompanimentPath)]);
  const metrics = {
    input: path.basename(inputPath),
    inputDurationSeconds: input.left.length / SAMPLE_RATE,
    frames: leftStft.frames,
    numSplits: prepared.numSplits,
    modelInputs: [path.basename(vocalsPath), path.basename(accompanimentPath)],
    modelSha256: modelBytes.map(bytes => crypto.createHash('sha256').update(bytes).digest('hex')),
    backend: 'onnxruntime-node-cpu',
    separationSeconds,
    wallSeconds,
    realtimeFactor: separationSeconds / (input.left.length / SAMPLE_RATE),
    maxRssKb: process.resourceUsage().maxRSS,
  };
  await fs.writeFile(path.join(outputDir, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
