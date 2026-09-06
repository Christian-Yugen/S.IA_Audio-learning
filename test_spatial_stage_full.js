// Complete simulation of SiaSpatialStage with distanceModel = "inverse"
const assert = require("assert");

class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue;
  }
  setValueAtTime(val) {
    this.value = val;
  }
}

class MockNode {
  constructor() {
    this.connections = [];
  }
  connect(dest) {
    this.connections.push(dest);
    return dest;
  }
}

class MockGainNode extends MockNode {
  constructor(defaultGain = 1.0) {
    super();
    this.gain = new MockAudioParam(defaultGain);
  }
}

class MockBiquadFilterNode extends MockNode {
  constructor() {
    super();
    this.type = "lowpass";
    this.frequency = new MockAudioParam(20000);
    this.Q = new MockAudioParam(1);
    this.gain = new MockAudioParam(0);
  }
}

class MockPannerNode extends MockNode {
  constructor() {
    super();
    this.panningModel = "equalpower";
    this.distanceModel = "inverse"; // Valid enum: "linear" | "inverse" | "exponential"
    this.refDistance = 1;
    this.maxDistance = 10000;
    this.rolloffFactor = 1;
    this.coneInnerAngle = 360;
    this.positionX = new MockAudioParam(0);
    this.positionY = new MockAudioParam(0);
    this.positionZ = new MockAudioParam(-1);
  }
}

class MockStereoPannerNode extends MockNode {
  constructor() {
    super();
    this.pan = new MockAudioParam(0);
  }
}

class MockAudioContext {
  constructor() {
    this.state = "running";
    this.currentTime = 0;
    this.destination = new MockNode();
    this.listener = {
      positionX: new MockAudioParam(0),
      positionY: new MockAudioParam(0),
      positionZ: new MockAudioParam(0),
      forwardX: new MockAudioParam(0),
      forwardY: new MockAudioParam(0),
      forwardZ: new MockAudioParam(-1),
      upX: new MockAudioParam(0),
      upY: new MockAudioParam(1),
      upZ: new MockAudioParam(0)
    };
  }
  createGain() { return new MockGainNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createPanner() { return new MockPannerNode(); }
  createStereoPanner() { return new MockStereoPannerNode(); }
}

// Now verify SiaSpatialStage implementation with all features
class SiaSpatialStage {
  constructor(audioContext) {
    this.context = audioContext;
    this.enabled = true;
    this.profileKey = "stage";
    this.angle = 0;
    this.distance = 1.0;
    this.input = null;
    this.output = null;
    this.pannerNode = null;
    this.stereoPanner = null;
    this.clarityFilter = null;
    this.distanceFilter = null;
    this.distanceGain = null;
    this.spatialGain = null;
    this.bypassGain = null;
    this.initNodes();
  }

  initNodes() {
    if (!this.context) return;
    try {
      this.input = this.context.createGain();
      this.output = this.context.createGain();
      this.spatialGain = this.context.createGain();
      this.bypassGain = this.context.createGain();
      this.distanceGain = this.context.createGain();

      // Filtro de absorção do ar (corte de agudos com a distância: 20kHz perto -> 7.5kHz longe)
      if (typeof this.context.createBiquadFilter === "function") {
        this.distanceFilter = this.context.createBiquadFilter();
        this.distanceFilter.type = "lowpass";
        this.distanceFilter.frequency.value = 20000;
        this.distanceFilter.Q.value = 0.7;

        // Filtro de presença vocal cristalina (peaking em 3.8kHz)
        this.clarityFilter = this.context.createBiquadFilter();
        this.clarityFilter.type = "peaking";
        this.clarityFilter.frequency.value = 3800;
        this.clarityFilter.Q.value = 0.9;
        this.clarityFilter.gain.value = 1.5;
      }

      // Panner 3D com modelo "inverse" 100% em conformidade com o Web Audio W3C (nunca "none")
      if (typeof this.context.createPanner === "function") {
        this.pannerNode = this.context.createPanner();
        this.pannerNode.panningModel = "equalpower";
        this.pannerNode.distanceModel = "inverse";
        this.pannerNode.refDistance = 1.0;
        this.pannerNode.maxDistance = 10000;
        this.pannerNode.rolloffFactor = 0.5;
        this.pannerNode.coneInnerAngle = 360;
      }

      // StereoPanner para separação estéreo absoluta e cirúrgica nos fones
      if (typeof this.context.createStereoPanner === "function") {
        this.stereoPanner = this.context.createStereoPanner();
      }

      this.connectNodes();
      this.applyPosition(this.angle, this.distance, this.enabled);
    } catch (err) {
      console.warn("[S·IA Spatial Stage] inicialização fallback", err);
    }
  }

  connectNodes() {
    if (!this.input || !this.output) return;
    try {
      // 1. Rota Bypass direto
      if (this.bypassGain) {
        this.input.connect(this.bypassGain);
        this.bypassGain.connect(this.output);
      }

      // 2. Rota 4K Espacial de Precisão:
      // input -> distanceFilter -> clarityFilter -> pannerNode -> stereoPanner -> distanceGain -> spatialGain -> output
      let currentNode = this.input;

      if (this.distanceFilter) {
        currentNode.connect(this.distanceFilter);
        currentNode = this.distanceFilter;
      }

      if (this.clarityFilter) {
        currentNode.connect(this.clarityFilter);
        currentNode = this.clarityFilter;
      }

      if (this.pannerNode) {
        currentNode.connect(this.pannerNode);
        currentNode = this.pannerNode;
      }

      if (this.stereoPanner) {
        currentNode.connect(this.stereoPanner);
        currentNode = this.stereoPanner;
      }

      if (this.distanceGain) {
        currentNode.connect(this.distanceGain);
        currentNode = this.distanceGain;
      }

      if (this.spatialGain) {
        currentNode.connect(this.spatialGain);
        this.spatialGain.connect(this.output);
      } else {
        currentNode.connect(this.output);
      }
    } catch (err) {
      try { this.input.connect(this.output); } catch {}
    }
  }

  applyPosition(angle = 0, distance = 1.0, enabled = true) {
    this.angle = Number.isFinite(Number(angle)) ? Number(angle) : 0;
    this.distance = Math.max(0.3, Math.min(2.5, Number.isFinite(Number(distance)) ? Number(distance) : 1.0));
    this.enabled = Boolean(enabled);

    const currentTime = Number(this.context?.currentTime) || 0;

    if (!this.enabled) {
      if (this.bypassGain?.gain?.setValueAtTime) {
        this.bypassGain.gain.setValueAtTime(1.0, currentTime);
      } else if (this.bypassGain?.gain) {
        this.bypassGain.gain.value = 1.0;
      }
      if (this.spatialGain?.gain?.setValueAtTime) {
        this.spatialGain.gain.setValueAtTime(0.0, currentTime);
      } else if (this.spatialGain?.gain) {
        this.spatialGain.gain.value = 0.0;
      }
      return;
    }

    if (this.bypassGain?.gain?.setValueAtTime) {
      this.bypassGain.gain.setValueAtTime(0.0, currentTime);
    } else if (this.bypassGain?.gain) {
      this.bypassGain.gain.value = 0.0;
    }

    if (this.spatialGain?.gain?.setValueAtTime) {
      this.spatialGain.gain.setValueAtTime(1.15, currentTime);
    } else if (this.spatialGain?.gain) {
      this.spatialGain.gain.value = 1.15;
    }

    // 1. Atenuação e Proximidade de Distância (Volume perceptível)
    // 0.3m -> 1.30x (alto/íntimo)
    // 1.0m -> 1.00x (padrão)
    // 2.0m -> 0.60x (afastado)
    // 2.5m -> 0.45x (profundo)
    let distVol = 1.0;
    if (this.distance <= 0.8) {
      distVol = 1.0 + (0.8 - this.distance) * 0.6; // 1.0 a 1.30
    } else {
      const norm = (this.distance - 0.8) / 1.7; // 0 a 1
      distVol = Math.max(0.4, 1.0 - norm * 0.55); // 1.0 a 0.45
    }
    if (this.distanceGain?.gain?.setValueAtTime) {
      this.distanceGain.gain.setValueAtTime(Number(distVol.toFixed(3)), currentTime);
    } else if (this.distanceGain?.gain) {
      this.distanceGain.gain.value = Number(distVol.toFixed(3));
    }

    // 2. Absorção do Ar (Filtro passa-baixa de profundidade acústica)
    // 0.3m -> 20.000 Hz (aberto total)
    // 2.5m -> 7.500 Hz (ar atmosférico)
    const normDist = Math.max(0, Math.min(1, (this.distance - 0.3) / 2.2));
    const cutoff = Math.round(20000 - normDist * 12500);
    if (this.distanceFilter?.frequency?.setValueAtTime) {
      this.distanceFilter.frequency.setValueAtTime(cutoff, currentTime);
    } else if (this.distanceFilter?.frequency) {
      this.distanceFilter.frequency.value = cutoff;
    }

    // 3. Realce de presença cristalina
    const clarity = Math.max(0.5, 2.5 * (1 - normDist * 0.8));
    if (this.clarityFilter?.gain?.setValueAtTime) {
      this.clarityFilter.gain.setValueAtTime(Number(clarity.toFixed(2)), currentTime);
    } else if (this.clarityFilter?.gain) {
      this.clarityFilter.gain.value = Number(clarity.toFixed(2));
    }

    // 4. Posicionamento 3D no PannerNode
    const rad = (this.angle * Math.PI) / 180;
    const x = Number((this.distance * Math.sin(rad)).toFixed(2));
    const y = 0.15;
    const z = Number((-this.distance * Math.cos(rad)).toFixed(2));

    if (this.pannerNode?.positionX?.setValueAtTime) {
      this.pannerNode.positionX.setValueAtTime(x, currentTime);
      this.pannerNode.positionY.setValueAtTime(y, currentTime);
      this.pannerNode.positionZ.setValueAtTime(z, currentTime);
    } else if (typeof this.pannerNode?.setPosition === "function") {
      this.pannerNode.setPosition(x, y, z);
    }

    // 5. Pan Estéreo de Precisão Absoluta no Fone
    // Math.sin(rad): -90° -> -1.0 (100% esquerda), 0° -> 0.0 (centro), +90° -> +1.0 (100% direita)
    const pan = Math.max(-1.0, Math.min(1.0, Math.sin(rad)));
    if (this.stereoPanner?.pan?.setValueAtTime) {
      this.stereoPanner.pan.setValueAtTime(Number(pan.toFixed(3)), currentTime);
    } else if (this.stereoPanner?.pan) {
      this.stereoPanner.pan.value = Number(pan.toFixed(3));
    }
  }
}

const ctx = new MockAudioContext();
const stage = new SiaSpatialStage(ctx);

// Test center:
stage.applyPosition(0, 1.0, true);
console.log("Center test:", {
  x: stage.pannerNode.positionX.value,
  z: stage.pannerNode.positionZ.value,
  pan: stage.stereoPanner.pan.value,
  distVol: stage.distanceGain.gain.value,
  cutoff: stage.distanceFilter.frequency.value
});
assert.equal(stage.stereoPanner.pan.value, 0);
assert.equal(stage.distanceGain.gain.value, 1.0);

// Test -61° (user screenshot position):
stage.applyPosition(-61, 1.3, true);
console.log("User screenshot -61°, 1.3m test:", {
  x: stage.pannerNode.positionX.value,
  z: stage.pannerNode.positionZ.value,
  pan: stage.stereoPanner.pan.value,
  distVol: stage.distanceGain.gain.value,
  cutoff: stage.distanceFilter.frequency.value
});
assert.equal(stage.stereoPanner.pan.value, -0.875);
assert.ok(stage.distanceGain.gain.value < 1.0);
assert.ok(stage.distanceFilter.frequency.value < 20000);

// Test close intimate 15°, 0.5m:
stage.applyPosition(15, 0.5, true);
console.log("Close intimate 15°, 0.5m:", {
  pan: stage.stereoPanner.pan.value,
  distVol: stage.distanceGain.gain.value,
  cutoff: stage.distanceFilter.frequency.value
});
assert.ok(stage.distanceGain.gain.value > 1.0); // louder!
assert.ok(stage.distanceFilter.frequency.value > 18000); // bright!

console.log("ALL TESTS PASSED SUCCESSFULLY!");
