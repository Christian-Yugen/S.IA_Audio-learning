const assert = require("node:assert/strict");

function calcGains(angle) {
  const pan = Math.max(-1.0, Math.min(1.0, angle / 90));
  let leftGain, rightGain;
  if (pan <= 0) {
    leftGain = 1.0;
    rightGain = Math.pow(Math.max(0, 1.0 + pan), 1.5);
  } else {
    leftGain = Math.pow(Math.max(0, 1.0 - pan), 1.5);
    rightGain = 1.0;
  }
  return {
    pan: Number(pan.toFixed(3)),
    leftGain: Number(leftGain.toFixed(3)),
    rightGain: Number(rightGain.toFixed(3)),
    leftDelay: Number((pan > 0 ? pan * 0.0006 : 0).toFixed(6)),
    rightDelay: Number((pan < 0 ? Math.abs(pan) * 0.0006 : 0).toFixed(6))
  };
}

console.log("-90 deg (Full Left):", calcGains(-90));
console.log("-60 deg (Strong Left):", calcGains(-60));
console.log("-30 deg (Mild Left):", calcGains(-30));
console.log("0 deg (Center):", calcGains(0));
console.log("+30 deg (Mild Right):", calcGains(30));
console.log("+60 deg (Strong Right):", calcGains(60));
console.log("+90 deg (Full Right):", calcGains(90));

// Test Nyquist safe cutoff
function calcCutoff(sampleRate, distance) {
  const nyquist = (sampleRate || 22050) / 2;
  const maxFreq = Math.min(10000, Math.floor(nyquist * 0.92));
  const minFreq = Math.max(3000, Math.floor(maxFreq * 0.42));
  const normDist = Math.max(0, Math.min(1, (distance - 0.3) / 2.2));
  return Math.round(maxFreq - normDist * (maxFreq - minFreq));
}

console.log("Cutoff at 0.3m (22050 Hz):", calcCutoff(22050, 0.3));
console.log("Cutoff at 1.0m (22050 Hz):", calcCutoff(22050, 1.0));
console.log("Cutoff at 2.5m (22050 Hz):", calcCutoff(22050, 2.5));
console.log("All cutoffs < 11025:", calcCutoff(22050, 0.3) < 11025);
