(function (root) {
  "use strict";
  const profiles = {
    stage: { name: "Frente", angle: 0, distance: 1.0 },
    interpreter: { name: "Intérprete", angle: 25, distance: 1.0 },
    intimate: { name: "Proximidade", angle: 15, distance: 0.6 },
    vip: { name: "Foco frontal", angle: 0, distance: 0.5 },
    colleague: { name: "Ao lado esquerdo", angle: -45, distance: 0.8 },
    side: { name: "Lado direito", angle: 60, distance: 1.2 },
    left: { name: "Canal esquerdo", angle: -90, distance: 0.8 },
    right: { name: "Canal direito", angle: 90, distance: 0.8 },
    back: { name: "Atrás (experimental)", angle: 180, distance: 1.0 }
  };
  for (const profile of Object.values(profiles)) {
    const rad = profile.angle * Math.PI / 180;
    Object.assign(profile, { x: profile.distance * Math.sin(rad), y: 0.15,
      z: -profile.distance * Math.cos(rad), clarityBoost: profile === profiles.intimate ? 2.0 : profile === profiles.back ? 1.0 : 1.5 });
    Object.freeze(profile);
  }
  const aliases = { center: "stage", onu: "interpreter", bilingual: "right" };
  function keyFor(key) { const canonical = aliases[key] || key; return profiles[canonical] ? canonical : "stage"; }
  function profileFor(key) { return profiles[keyFor(key)]; }
  const defaults = Object.freeze({
    sia_spatial_audio: true, sia_spatial_profile: "stage",
    sia_spatial_angle: 0, sia_spatial_distance: 1.0,
    sia_neuro_director_active: false, sia_neuro_preset: "stage"
  });
  root.SiaAudioSettings = Object.freeze({ profiles: Object.freeze(profiles), defaults, profileFor, keyFor });
})(typeof globalThis !== "undefined" ? globalThis : this);
