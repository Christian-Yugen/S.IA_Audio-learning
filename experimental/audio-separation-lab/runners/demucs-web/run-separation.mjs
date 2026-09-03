import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import ort from 'onnxruntime-node';
import { DemucsProcessor } from './src/processor.js';
import { CONSTANTS } from './src/constants.js';

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
  const audioFormat = fmt.readUInt16LE(0);
  const channels = fmt.readUInt16LE(2);
  const sampleRate = fmt.readUInt32LE(4);
  const bitsPerSample = fmt.readUInt16LE(14);
  if (audioFormat !== 1 || bitsPerSample !== 16 || (channels !== 1 && channels !== 2)) {
    throw new Error(`WAV incompatível: formato=${audioFormat}, canais=${channels}, bits=${bitsPerSample}`);
  }
  const frameCount = Math.floor(data.length / (channels * 2));
  const left = new Float32Array(frameCount);
  const right = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const base = frame * channels * 2;
    left[frame] = data.readInt16LE(base) / 32768;
    right[frame] = (channels === 2 ? data.readInt16LE(base + 2) : data.readInt16LE(base)) / 32768;
  }
  return { left, right, channels, sampleRate };
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
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < frames; index += 1) {
    const leftValue = Math.max(-1, Math.min(1, left[index] || 0));
    const rightValue = Math.max(-1, Math.min(1, right[index] || 0));
    buffer.writeInt16LE(Math.round(leftValue * 32767), 44 + index * 4);
    buffer.writeInt16LE(Math.round(rightValue * 32767), 46 + index * 4);
  }
  return buffer;
}

async function main() {
  const [inputPath, modelPath, outputDir] = process.argv.slice(2);
  if (!inputPath || !modelPath || !outputDir) {
    throw new Error('uso: node run-separation.mjs INPUT.wav MODEL.onnx OUTPUT_DIR');
  }
  const input = readWav(await fs.readFile(inputPath));
  if (input.sampleRate !== CONSTANTS.SAMPLE_RATE) {
    throw new Error(`taxa de entrada ${input.sampleRate} Hz; esperado ${CONSTANTS.SAMPLE_RATE} Hz`);
  }
  const modelBuffer = await fs.readFile(modelPath);
  const modelSha256 = crypto.createHash('sha256').update(modelBuffer).digest('hex');
  await fs.mkdir(outputDir, { recursive: true });
  const started = process.hrtime.bigint();
  const stride = Math.floor(CONSTANTS.TRAINING_SAMPLES * (1 - CONSTANTS.SEGMENT_OVERLAP));
  const expectedSegments = Math.max(1, Math.ceil(input.left.length / stride));
  const processor = new DemucsProcessor({
    ort,
    onLog: (phase, message) => console.error(`[${phase}] ${message}`),
    onProgress: info => console.error(JSON.stringify({
      ...info,
      progress: info.currentSegment / expectedSegments,
      totalSegments: expectedSegments,
    })),
    sessionOptions: {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'basic',
      enableCpuMemArena: false,
      enableMemPattern: false,
    },
  });
  const loadStarted = process.hrtime.bigint();
  await processor.loadModel(modelBuffer.buffer.slice(modelBuffer.byteOffset, modelBuffer.byteOffset + modelBuffer.byteLength));
  const loadSeconds = Number(process.hrtime.bigint() - loadStarted) / 1e9;
  const result = await processor.separate(input.left, input.right);
  const separationSeconds = Number(process.hrtime.bigint() - loadStarted) / 1e9 - loadSeconds;
  const wallSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  const names = ['drums', 'bass', 'other', 'vocals'];
  for (const name of names) {
    await fs.writeFile(path.join(outputDir, `${name}.wav`), writeWav(result[name].left, result[name].right, CONSTANTS.SAMPLE_RATE));
  }
  const metrics = {
    model: path.basename(modelPath),
    modelSha256,
    input: path.basename(inputPath),
    sampleRate: input.sampleRate,
    inputDurationSeconds: input.left.length / input.sampleRate,
    loadSeconds,
    separationSeconds,
    wallSeconds,
    realtimeFactor: separationSeconds / (input.left.length / input.sampleRate),
    backend: 'onnxruntime-node-cpu',
    constants: { ...CONSTANTS, EXPECTED_SEGMENTS: expectedSegments },
    maxRssKb: process.resourceUsage().maxRSS,
  };
  await fs.writeFile(path.join(outputDir, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
