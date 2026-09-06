// Test Web Audio PannerNode distanceModel and panning calculations
const assert = require("assert");

// Valid distance models in Web Audio API:
const validDistanceModels = ["linear", "inverse", "exponential"];

console.log("Valid Distance Models:", validDistanceModels);

// Calculate azimuth and gains for angle in degrees
function calculateSpatialPanner(angleDeg, distanceMeters) {
  const rad = (angleDeg * Math.PI) / 180;
  const x = distanceMeters * Math.sin(rad);
  const y = 0.15;
  const z = -distanceMeters * Math.cos(rad);

  // Azimuth calculation:
  const azimuth = Math.atan2(x, -z) * (180 / Math.PI);
  
  // Equal power panning curve:
  // normalized from -90 to +90 -> 0 to 1
  const clampedAzimuth = Math.max(-90, Math.min(90, azimuth));
  const norm = (clampedAzimuth + 90) / 180;
  const gainL = Math.cos(norm * Math.PI / 2);
  const gainR = Math.sin(norm * Math.PI / 2);

  // Distance attenuation:
  // Inverse distance model: gain = refDistance / (refDistance + rolloff * (dist - refDistance))
  const refDist = 0.8;
  const rolloff = 0.7;
  const distGain = distanceMeters <= refDist 
    ? 1.0 + (refDist - distanceMeters) * 0.5 // Proximity boost up to 1.25x when closer than refDist!
    : refDist / (refDist + rolloff * (distanceMeters - refDist));

  // High frequency cutoff (air absorption):
  // Close (0.5m) -> 20000Hz, Far (2.5m) -> 8000Hz
  const cutoffFreq = Math.round(20000 - Math.min(1, (distanceMeters - 0.3) / 2.2) * 12000);

  return {
    coordinates: { x: Number(x.toFixed(2)), y, z: Number(z.toFixed(2)) },
    azimuth: Math.round(azimuth),
    gainL: Number((gainL * distGain).toFixed(3)),
    gainR: Number((gainR * distGain).toFixed(3)),
    distGain: Number(distGain.toFixed(3)),
    cutoffFreq
  };
}

console.log("Center 0°, 1.0m:", calculateSpatialPanner(0, 1.0));
console.log("Left -61°, 1.3m (User screenshot):", calculateSpatialPanner(-61, 1.3));
console.log("Full Left -90°, 1.0m:", calculateSpatialPanner(-90, 1.0));
console.log("Close Intimate 15°, 0.5m:", calculateSpatialPanner(15, 0.5));
console.log("Far Stage 45°, 2.5m:", calculateSpatialPanner(45, 2.5));
