import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../caption-input.js', import.meta.url), 'utf8');

function createInput() {
  const context = vm.createContext({ console, Date });
  context.globalThis = context;
  vm.runInContext(source, context);
  const input = context.SiaCaptionInput;
  input.setActivePlayer({ videoId: 'lecture-1', containerId: 'shaka-video-container-1' });
  return input;
}

function validCue(overrides = {}) {
  return {
    platformId: 'udemy',
    adapterVersion: 'udemy-v0-experimental',
    text: 'Uma legenda temporal válida.',
    startTime: 10,
    endTime: 12,
    source: 'texttrack',
    sourceConfidence: 'high',
    playerIdentity: { videoId: 'lecture-1', containerId: 'shaka-video-container-1' },
    safeToSpeak: true,
    ...overrides,
  };
}

test('H0 aceita cue temporal segura para o player ativo', () => {
  const input = createInput();
  const events = [];
  input.subscribe(event => events.push(event));
  const result = input.push(validCue());
  assert.equal(result.accepted, true);
  assert.equal(result.type, input.EVENTS.ACCEPTED);
  assert.equal(result.cue.sourceConfidence, 'high');
  assert.equal(events.length, 1);
});

test('H0 rejeita legenda DOM sem timing e nunca a transforma em entrada segura', () => {
  const input = createInput();
  const result = input.push(validCue({
    source: 'dom-caption',
    sourceConfidence: 'low',
    startTime: null,
    endTime: null,
    safeToSpeak: false,
  }));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, input.REASONS.UNSAFE_CUE);
});

test('H0 rejeita confiança baixa mesmo quando há tempos numéricos', () => {
  const input = createInput();
  const result = input.push(validCue({ sourceConfidence: 'medium' }));
  assert.equal(result.accepted, false);
  assert.equal(result.reason, input.REASONS.LOW_CONFIDENCE);
});

test('H0 rejeita timing inválido e player incompatível', () => {
  const input = createInput();
  const invalidTiming = input.push(validCue({ endTime: 10 }));
  assert.equal(invalidTiming.accepted, false);
  assert.equal(invalidTiming.reason, input.REASONS.INVALID_TIMING);
  const wrongPlayer = input.push(validCue({
    playerIdentity: { videoId: 'lecture-2', containerId: 'shaka-video-container-2' },
  }));
  assert.equal(wrongPlayer.accepted, false);
  assert.equal(wrongPlayer.reason, input.REASONS.PLAYER_MISMATCH);
});

test('H1 deduplica a mesma cue e aceita novo intervalo', () => {
  const input = createInput();
  const first = input.push(validCue());
  const duplicate = input.push(validCue());
  const next = input.push(validCue({ text: 'Próxima legenda.', startTime: 12, endTime: 14 }));
  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.reason, input.REASONS.DUPLICATE);
  assert.equal(next.accepted, true);
  assert.equal(next.sequence, 2);
});

test('H1 troca de player limpa a deduplicação e muda a identidade ativa', () => {
  const input = createInput();
  assert.equal(input.push(validCue()).accepted, true);
  input.setActivePlayer({ videoId: 'lecture-2', containerId: 'shaka-video-container-2' });
  const result = input.push(validCue({
    playerIdentity: { videoId: 'lecture-2', containerId: 'shaka-video-container-2' },
  }));
  assert.equal(result.accepted, true);
  const activePlayer = input.getStatus().activePlayer;
  assert.equal(activePlayer.videoId, 'lecture-2');
  assert.equal(activePlayer.containerId, 'shaka-video-container-2');
});

test('H2 pausa rejeita nova cue e retomada permite cue segura', () => {
  const input = createInput();
  input.setPaused(true);
  const paused = input.push(validCue());
  assert.equal(paused.accepted, false);
  assert.equal(paused.reason, input.REASONS.PAUSED);
  input.setPaused(false);
  const resumed = input.push(validCue());
  assert.equal(resumed.accepted, true);
});

test('H2 destroy encerra o hook e rejeita entradas posteriores', () => {
  const input = createInput();
  input.destroy();
  const result = input.push(validCue());
  assert.equal(result.accepted, false);
  assert.equal(result.reason, input.REASONS.DESTROYED);
  assert.equal(input.getStatus().destroyed, true);
});
