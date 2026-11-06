import * as T from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// The screen-space half of Sensation: one fullscreen pass doing three cheap things, all strongest at the edges of the picture
// (where a real lens, and a real eye, smear first) and none of them touching the centre where the pilot is aiming.
//
//   uBlur        radial speed blur: smears the edges toward the centre as speed builds
//   uAberration  chromatic aberration: red and blue split apart, a brief fringing flash on dash, damage and blasts
//   uPressure    a dark, warm vignette that squeezes in on a hit or a nearby explosion
//
// It runs before OutputPass, so it works on linear HDR colour and keeps the bloom it sits on top of.
export const SensationShader = {
  uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 }, uAberration: { value: 0 }, uPressure: { value: 0 }, uTint: { value: new T.Vector3(.7, .16, .05) } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uBlur, uAberration, uPressure;
    uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);                              // 0 at the centre, 0.5 at a corner
      float blur = clamp(uBlur, 0.0, 0.06) * r2 * 0.55;                    // how far toward the centre the longest tap reaches
      float ca = uAberration * (0.003 + r2 * 0.05);      // colour split, growing toward the edges
      vec3 sum = vec3(0.0);
      for (int i = 0; i < 5; i++) {
        float s = 1.0 - blur * (float(i) / 4.0);
        sum.r += texture2D(tDiffuse, 0.5 + d * s * (1.0 + ca)).r;
        sum.g += texture2D(tDiffuse, 0.5 + d * s).g;
        sum.b += texture2D(tDiffuse, 0.5 + d * s * (1.0 - ca)).b;
      }
      vec3 c = sum / 5.0;
      float vig = smoothstep(0.1, 0.5, r2) * uPressure;
      c = c * (1.0 - vig * 0.6) + uTint * vig * 0.22;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function makeSensationPass() {
  const pass = new ShaderPass(SensationShader);
  pass.enabled = false; // off until there is something to draw: an idle pass would still cost a fullscreen read and write
  return pass;
}

const ACTIVE = .004;
// Push Sensation.out into the pass. Returns whether the pass is running this frame.
export function applySensation(pass, out) {
  const u = pass.uniforms;
  u.uBlur.value = out.blur; u.uAberration.value = out.aberration; u.uPressure.value = out.pressure;
  pass.enabled = out.blur > ACTIVE || out.aberration > ACTIVE || out.pressure > ACTIVE;
  return pass.enabled;
}
