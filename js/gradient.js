/*
  Cursor-reactive grey gradient background.

  Original WebGL fragment shader, purely decorative. It is an enhancement
  only: with JavaScript or WebGL unavailable, the CSS fallback gradient on
  #bg stays visible and everything else on the page works unchanged.
*/
(function () {
  "use strict";

  var canvas = document.getElementById("bg");
  if (!canvas) return;

  var reduceMotion = !!(window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  var gl = canvas.getContext("webgl", {
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power"
  });
  if (!gl) return;

  var VERT = "attribute vec2 a_pos;\nvoid main() { gl_Position = vec4(a_pos, 0.0, 1.0); }";

  var FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_m1;      // fast cursor follower, 0..1, y up
uniform vec2  u_m2;      // slow trailing follower
uniform float u_energy;  // 0..1, how much the pointer moved recently

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(11.7, 3.1);
    a *= 0.5;
  }
  return v;
}

float blob(vec2 p, vec2 c, float r) {
  vec2 d = p - c;
  return exp(-dot(d, d) / (r * r));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  float narrow = smoothstep(0.4, 1.0, aspect);  // 0 on tall phones .. 1 on wide screens
  float amb = mix(0.7, 1.0, narrow);            // calmer ambient light on phones
  float cr  = mix(0.7, 1.0, narrow);            // tighter cursor light on phones
  vec2 p  = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 c1 = (u_m1 - 0.5) * vec2(aspect, 1.0);
  vec2 c2 = (u_m2 - 0.5) * vec2(aspect, 1.0);
  float t = u_time * 0.07;

  // the cursor bends the space around it
  vec2 d1 = p - c1;
  float lens = exp(-dot(d1, d1) * 7.0 / (cr * cr));
  vec2 warp = p - d1 * lens * (0.30 + 0.35 * u_energy);

  // slow domain warp gives the field liquid, organic edges
  vec2 q = vec2(fbm(warp * 1.4 + vec2(0.0, t)),
                fbm(warp * 1.4 + vec2(5.2, 1.3 - t)));
  vec2 w = warp + (q - 0.5) * 0.6;

  // ambient light pools drifting on slow orbits
  float f = 0.0;
  f += amb * 0.85 * blob(w, vec2(-0.32 * aspect + 0.10 * sin(t * 1.3),  0.16 + 0.12 * cos(t * 1.1)), 0.46);
  f += amb * 0.75 * blob(w, vec2( 0.34 * aspect + 0.12 * cos(t * 0.9), -0.14 + 0.14 * sin(t * 1.2)), 0.52);
  f += amb * 0.50 * blob(w, vec2( 0.06 * sin(t * 0.7),                  0.44 + 0.06 * cos(t * 1.4)), 0.36);

  // cursor light: a quick core and a slower, wider wake
  f += (0.55 + 0.45 * u_energy) * blob(w, c1, (0.20 + 0.08 * u_energy) * cr);
  f += 0.55 * blob(w, c2, 0.40 * cr);

  // cloudy texture from the warp field
  f += (q.x - 0.5) * 0.5;

  float g = mix(0.030, 0.230, smoothstep(0.0, 1.5, f));

  // soft vignette keeps the edges deep
  float vig = 1.0 - smoothstep(0.20, 0.95, length(uv - 0.5));
  g *= mix(0.55, 1.0, vig);

  // fine grain: adds texture and hides banding in dark gradients
  g += (hash(gl_FragCoord.xy + fract(u_time) * 61.7) - 0.5) * 0.012;

  gl_FragColor = vec4(vec3(g), 1.0);
}
`;

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      if (window.console) console.warn("gradient shader:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    if (window.console) console.warn("gradient program:", gl.getProgramInfoLog(prog));
    return;
  }
  gl.useProgram(prog);

  // one oversized triangle covers the whole viewport
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "u_res");
  var uTime = gl.getUniformLocation(prog, "u_time");
  var uM1 = gl.getUniformLocation(prog, "u_m1");
  var uM2 = gl.getUniformLocation(prog, "u_m2");
  var uEnergy = gl.getUniformLocation(prog, "u_energy");

  var MAX_DIM = 720;        // render small, the gradient is soft anyway
  var IDLE_AFTER = 2500;    // ms without pointer input before it wanders alone

  var target = { x: 0.5, y: 0.5 };
  var m1 = { x: 0.5, y: 0.5 };
  var m2 = { x: 0.5, y: 0.5 };
  var energy = 0;
  var lastMove = -1e9;
  var raf = 0;
  var last = 0;
  var t0 = performance.now();
  var viewW = 0;
  var viewH = 0;

  function draw(t, e) {
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t);
    gl.uniform2f(uM1, m1.x, m1.y);
    gl.uniform2f(uM2, m2.x, m2.y);
    gl.uniform1f(uEnergy, e);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawStatic() {
    m1.x = 0.66; m1.y = 0.58;
    m2.x = 0.60; m2.y = 0.52;
    draw(9, 0.25);
  }

  function resize(force) {
    var w = window.innerWidth;
    var h = window.innerHeight;
    // mobile toolbars change the height a little while scrolling: ignore that
    if (!force && w === viewW && Math.abs(h - viewH) < 150) return;
    viewW = w;
    viewH = h;
    var s = Math.min(1, MAX_DIM / Math.max(w, h));
    canvas.width = Math.max(2, Math.round(w * s));
    canvas.height = Math.max(2, Math.round(h * s));
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (reduceMotion) drawStatic();
  }

  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    var t = (now - t0) / 1000;

    var idle = now - lastMove > IDLE_AFTER;
    var tx = target.x;
    var ty = target.y;
    if (idle) {
      tx = 0.5 + 0.30 * Math.sin(t * 0.31);
      ty = 0.5 + 0.22 * Math.sin(t * 0.23 + 1.7);
    }

    var k1 = 1 - Math.pow(1 - 0.12, dt * 60);
    var k2 = 1 - Math.pow(1 - 0.035, dt * 60);
    m1.x += (tx - m1.x) * k1;
    m1.y += (ty - m1.y) * k1;
    m2.x += (tx - m2.x) * k2;
    m2.y += (ty - m2.y) * k2;

    energy *= Math.pow(0.5, dt / 0.6);
    draw(t, idle ? Math.max(energy, 0.18) : energy);

    raf = requestAnimationFrame(frame);
  }

  function onPointer(e) {
    var nx = e.clientX / window.innerWidth;
    var ny = 1 - e.clientY / window.innerHeight;
    energy = Math.min(1, energy + Math.hypot(nx - target.x, ny - target.y) * 4);
    target.x = nx;
    target.y = ny;
    lastMove = performance.now();
  }

  resize(true);
  window.addEventListener("resize", function () { resize(false); });

  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
  });

  if (!reduceMotion) {
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    raf = requestAnimationFrame(frame);
  }
})();
