function calc360(angle, distance) {
  // Normalize angle to [-180, 180]
  let deg = Number(angle) || 0;
  while (deg > 180) deg -= 360;
  while (deg < -180) deg += 360;

  const rad = (deg * Math.PI) / 180;
  const x = Math.sin(rad); // -1 (left) to +1 (right)
  const z = Math.cos(rad); // +1 (front) to -1 (behind)

  // 1. Interaural Level Difference (ILD) based on X
  let lGain, rGain;
  if (x <= 0) {
    // Sound on left
    lGain = 1.0;
    rGain = Math.pow(Math.max(0, 1.0 + x), 1.5);
  } else {
    // Sound on right
    lGain = Math.pow(Math.max(0, 1.0 - x), 1.5);
    rGain = 1.0;
  }

  // 2. Interaural Time Difference (ITD)
  const lDelay = x > 0 ? x * 0.00065 : 0;
  const rDelay = x < 0 ? Math.abs(x) * 0.00065 : 0;

  // 3. Rear Pinna Shadow (Front vs Behind)
  // When z < 0 (behind), rearDamp reduces high frequencies
  const isBehind = z < 0;
  const rearDamp = isBehind ? Math.abs(z) : 0; // 0 (front) to 1 (directly behind)
  // Rear filter cutoff: 10000Hz (front) down to 3600Hz (directly behind)
  const rearCutoff = Math.round(10000 - rearDamp * 6400);

  // 4. Distance attenuation & air absorption
  const dist = Math.max(0.3, Math.min(2.5, Number(distance) || 1.0));
  let distVol;
  if (dist <= 1.0) {
    distVol = 1.0 + (1.0 - dist) * 0.45;
  } else {
    const norm = (dist - 1.0) / 1.5;
    distVol = Math.max(0.40, 1.0 - norm * 0.55);
  }
  const normDist = Math.max(0, Math.min(1, (dist - 0.3) / 2.2));
  const airCutoff = Math.round(10000 - normDist * 5800);

  // Effective filter cutoff is minimum of air absorption and rear pinna shadow
  const effectiveCutoff = Math.min(rearCutoff, airCutoff);

  return {
    deg,
    x: Number(x.toFixed(3)),
    z: Number(z.toFixed(3)),
    lGain: Number(lGain.toFixed(3)),
    rGain: Number(rGain.toFixed(3)),
    lDelay: Number((lDelay * 1000).toFixed(2)) + "ms",
    rDelay: Number((rDelay * 1000).toFixed(2)) + "ms",
    distVol: Number(distVol.toFixed(3)),
    cutoff: effectiveCutoff + "Hz"
  };
}

console.log("Frente (0°):", calc360(0, 1.0));
console.log("Frente-Direita (45°):", calc360(45, 1.0));
console.log("Direita (+90°):", calc360(90, 1.0));
console.log("Trás-Direita (+135°):", calc360(135, 1.0));
console.log("Atrás (180°):", calc360(180, 1.0));
console.log("Trás-Esquerda (-135°):", calc360(-135, 1.0));
console.log("Esquerda (-90°):", calc360(-90, 1.0));
console.log("Frente-Esquerda (-45°):", calc360(-45, 1.0));
