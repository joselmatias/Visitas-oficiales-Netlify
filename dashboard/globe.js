import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ---------- Constants ----------
const GLOBE_R = 1.0;
const GOLD = new THREE.Color('#E6C878');
const GOLD_DIM = new THREE.Color('#C9A24A');
const ORIGIN = { lat: -0.1807, lon: -78.4678 };

// ---------- Setup ----------
const canvas = document.getElementById('globe-canvas');
const scene = new THREE.Scene();
scene.background = null;

let stage = canvas.parentElement;
const camera = new THREE.PerspectiveCamera(38, stage.clientWidth / stage.clientHeight, 0.1, 100);
camera.position.set(0, 0.4, 2.8);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.setClearColor(0x000000, 0);

// Bloom composer
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(stage.clientWidth, stage.clientHeight),
  0.9, 0.7, 0.18
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.55;
controls.enablePan = false;
controls.minDistance = 1.6;
controls.maxDistance = 6.0;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.28;

// Start camera looking at Quito (origin) at a comfortable distance
// Quito: lat -0.18, lon -78.47 → compute direction vector
const _quito = latLonToVec3(-0.1807, -78.4678, 1).normalize().multiplyScalar(2.8);
camera.position.copy(_quito);
controls.update();
// Add a slight tilt
camera.position.y += 0.3;

// ---------- Helpers ----------
function latLonToVec3(lat, lon, r = GLOBE_R) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

// ---------- Globe Sphere (monochromatic dark) ----------
const globeGroup = new THREE.Group();
scene.add(globeGroup);

const globeGeo = new THREE.SphereGeometry(GLOBE_R, 96, 96);
const globeMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uBase: { value: new THREE.Color('#0D1628') },
    uHi: { value: new THREE.Color('#1F3159') },
    uGold: { value: new THREE.Color('#8a7238') }
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPos;
    void main(){
      vNormal = normalize(normalMatrix * normal);
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uBase;
    uniform vec3 uHi;
    uniform vec3 uGold;
    varying vec3 vNormal;
    varying vec3 vPos;
    void main(){
      vec3 viewDir = vec3(0.0, 0.0, 1.0);
      float fres = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 2.2);
      float light = max(dot(vNormal, normalize(vec3(0.55, 0.55, 0.9))), 0.0);
      vec3 col = mix(uBase, uHi, light * 0.6);
      col += uGold * fres * 0.22;
      gl_FragColor = vec4(col, 1.0);
    }
  `
});
const globe = new THREE.Mesh(globeGeo, globeMat);
globeGroup.add(globe);

// ---------- Graticule (lat/lon grid lines) ----------
function makeGraticule() {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({
    color: 0xC9A24A,
    transparent: true,
    opacity: 0.11
  });
  const R = GLOBE_R * 1.0015;
  // Latitudes
  for (let lat = -75; lat <= 75; lat += 15) {
    const pts = [];
    for (let lon = 0; lon <= 360; lon += 4) {
      pts.push(latLonToVec3(lat, lon - 180, R));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, mat);
    group.add(l);
  }
  // Equator accent
  {
    const pts = [];
    for (let lon = 0; lon <= 360; lon += 2) {
      pts.push(latLonToVec3(0, lon - 180, R * 1.001));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({
      color: 0xE6C878, transparent: true, opacity: 0.35
    }));
    group.add(l);
  }
  // Longitudes
  for (let lon = -180; lon < 180; lon += 15) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 4) {
      pts.push(latLonToVec3(lat, lon, R));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, mat);
    group.add(l);
  }
  return group;
}
globeGroup.add(makeGraticule());

// ---------- Continent outlines (coastlines only, no country borders) ----------
// Load natural-earth 110m land polygons via TopoJSON. Draws only continental coastlines.
async function loadContinentOutlines() {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({
    color: 0xE6C878, transparent: true, opacity: 1.0,
    depthWrite: false
  });
  try {
    const landUrl = (window.__resources && window.__resources.land_110m)
      || 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
    const res = await fetch(landUrl);
    const topo = await res.json();
    // Inline minimal topojson decoder: convert topology.objects.land to geojson
    const T = topo;
    const tx = T.transform;
    function arc(i) {
      const negate = i < 0;
      if (negate) i = ~i;
      const a = T.arcs[i];
      let x = 0, y = 0;
      const out = [];
      for (const p of a) {
        x += p[0]; y += p[1];
        out.push([x * tx.scale[0] + tx.translate[0], y * tx.scale[1] + tx.translate[1]]);
      }
      return negate ? out.reverse() : out;
    }
    function ringCoords(arcIdxs) {
      const coords = [];
      arcIdxs.forEach((ai, k) => {
        const pts = arc(ai);
        coords.push(...(k === 0 ? pts : pts.slice(1)));
      });
      return coords;
    }
    const land = T.objects.land;
    const polygons = [];
    function collect(g) {
      if (!g) return;
      if (g.type === 'Polygon') polygons.push(g.arcs);
      else if (g.type === 'MultiPolygon') g.arcs.forEach(p => polygons.push(p));
      else if (g.type === 'GeometryCollection') g.geometries.forEach(collect);
    }
    collect(land);
    console.log('[globe] polygons found:', polygons.length);
    let lineCount = 0;
    // Filled land polygons (semi-transparent) for mass
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x2b3a5a,
      transparent: true, opacity: 0.55,
      side: THREE.DoubleSide, depthWrite: false
    });
    for (const poly of polygons) {
      // First ring is outer; others are holes. For simplicity treat each ring as its own filled shape.
      for (const ring of poly) {
        const coords = ringCoords(ring);
        const pts3 = coords.map(([lon, lat]) => latLonToVec3(lat, lon, GLOBE_R * 1.006));
        // Line outline
        const g = new THREE.BufferGeometry().setFromPoints(pts3);
        group.add(new THREE.Line(g, mat));
        lineCount++;

        // Tessellate ring into triangle fan from centroid for fill
        if (coords.length >= 3) {
          const n = coords.length;
          let cx = 0, cy = 0;
          for (const [lo, la] of coords) { cx += lo; cy += la; }
          cx /= n; cy /= n;
          const center3 = latLonToVec3(cy, cx, GLOBE_R * 1.004);
          const positions = new Float32Array((n) * 3 * 3);
          let pi = 0;
          for (let i = 0; i < n - 1; i++) {
            const a = pts3[i];
            const b = pts3[i + 1];
            positions[pi++] = center3.x; positions[pi++] = center3.y; positions[pi++] = center3.z;
            positions[pi++] = a.x; positions[pi++] = a.y; positions[pi++] = a.z;
            positions[pi++] = b.x; positions[pi++] = b.y; positions[pi++] = b.z;
          }
          const fg = new THREE.BufferGeometry();
          fg.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, pi), 3));
          const mesh = new THREE.Mesh(fg, fillMat);
          mesh.renderOrder = -1;
          group.add(mesh);
        }
      }
    }
    console.log('[globe] continent lines added:', lineCount);
  } catch (e) {
    console.warn('Continent outlines failed:', e);
  }
  return group;
}
loadContinentOutlines().then(g => globeGroup.add(g));

function makeLandDots() {
  return new THREE.Group(); // disabled
}
function _oldMakeLandDots() {
  const group = new THREE.Group();
  const mat = new THREE.PointsMaterial({
    color: 0xC9A24A,
    size: 0.0075,
    transparent: true,
    opacity: 0.42,
    sizeAttenuation: true,
    depthWrite: false
  });
  // Rough continent polygons (simplified bboxes + carvings)
  const regions = [
    // [lat min, lat max, lon min, lon max, density]
    // North America main
    { lat:[25,72], lon:[-168,-55], d: 600 },
    // Central America
    { lat:[7,25], lon:[-106,-78], d: 90 },
    // South America
    { lat:[-56,12], lon:[-82,-34], d: 520 },
    // Europe
    { lat:[36,71], lon:[-10,40], d: 380 },
    // North Africa
    { lat:[10,36], lon:[-17,35], d: 320 },
    // Sub-Saharan Africa
    { lat:[-35,10], lon:[10,42], d: 360 },
    // Middle East
    { lat:[12,42], lon:[35,60], d: 180 },
    // Russia/N Asia
    { lat:[45,78], lon:[40,180], d: 700 },
    // India
    { lat:[7,35], lon:[68,92], d: 200 },
    // SE Asia/China
    { lat:[18,50], lon:[92,140], d: 420 },
    // Indonesia
    { lat:[-10,7], lon:[95,141], d: 140 },
    // Japan
    { lat:[30,46], lon:[128,146], d: 60 },
    // Australia
    { lat:[-40,-10], lon:[112,154], d: 280 },
    // Greenland
    { lat:[60,83], lon:[-55,-20], d: 180 },
    // UK/Ireland
    { lat:[50,59], lon:[-10,2], d: 40 },
    // Madagascar
    { lat:[-26,-12], lon:[43,51], d: 28 },
    // New Zealand
    { lat:[-47,-34], lon:[166,179], d: 40 },
    // Iceland
    { lat:[63,66], lon:[-24,-13], d: 14 },
  ];
  const positions = [];
  function rand(seed) { return Math.abs(Math.sin(seed * 9999.17)) % 1; }
  let s = 1;
  for (const r of regions) {
    for (let i = 0; i < r.d; i++) {
      const lat = r.lat[0] + Math.random() * (r.lat[1] - r.lat[0]);
      const lon = r.lon[0] + Math.random() * (r.lon[1] - r.lon[0]);
      // Carve: drop Caspian, Great Lakes, Mediterranean, Sahara gulfs — approx skip zones
      if (lat>36 && lat<47 && lon>45 && lon<55) continue; // caspian
      if (lat>32 && lat<46 && lon>-6 && lon<36 && !((lat>36 && lon<-5) || (lat>40 && lon>7))) {
        // keep european shores, let Mediterranean carve by region overlap gaps
      }
      const v = latLonToVec3(lat, lon, GLOBE_R * 1.003);
      positions.push(v.x, v.y, v.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const pts = new THREE.Points(geo, mat);
  group.add(pts);
  return group;
}
globeGroup.add(makeLandDots());

// ---------- Atmosphere halo ----------
function makeAtmosphere() {
  const geo = new THREE.SphereGeometry(GLOBE_R * 1.18, 64, 64);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#C9A24A') }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main(){
        vNormal = normalize(normalMatrix * normal);
        vWorld = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main(){
        float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.4);
        float swirl = 0.5 + 0.5 * sin(vWorld.y * 6.0 + uTime * 0.6);
        vec3 col = uColor * intensity * (0.5 + 0.2 * swirl);
        gl_FragColor = vec4(col, intensity * 0.6);
      }
    `,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  });
  return new THREE.Mesh(geo, mat);
}
const atmosphere = makeAtmosphere();
scene.add(atmosphere);

// Outer faint halo ring
function makeHaloRing() {
  const geo = new THREE.RingGeometry(GLOBE_R * 1.35, GLOBE_R * 1.9, 128);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#C9A24A') } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPos;
      void main(){
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vPos;
      void main(){
        float d = length(vPos);
        float a = smoothstep(1.9, 1.35, d) * smoothstep(1.34, 1.5, d);
        gl_FragColor = vec4(uColor, a * 0.12);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(geo, mat);
  m.lookAt(new THREE.Vector3(0, 0, 1));
  return m;
}
// Place the ring facing camera axis — but we want it billboarded; skip to keep frame clean
// scene.add(makeHaloRing());

// ---------- Starfield backdrop ----------
function makeStars() {
  const count = 900;
  const positions = [];
  for (let i = 0; i < count; i++) {
    const r = 40 + Math.random() * 20;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.push(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xEDE6D3,
    size: 0.08,
    transparent: true,
    opacity: 0.5,
    sizeAttenuation: true
  });
  return new THREE.Points(geo, mat);
}
scene.add(makeStars());

// ---------- Origin marker (Quito) ----------
const markerGroup = new THREE.Group();
globeGroup.add(markerGroup);

function makeOriginMarker() {
  const group = new THREE.Group();
  const pos = latLonToVec3(ORIGIN.lat, ORIGIN.lon, GLOBE_R * 1.005);
  // Core dot
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.014, 16, 16),
    new THREE.MeshBasicMaterial({ color: GOLD })
  );
  core.position.copy(pos);
  group.add(core);
  // Outer ring
  const ringGeo = new THREE.RingGeometry(0.02, 0.024, 48);
  const ringMat = new THREE.MeshBasicMaterial({
    color: GOLD, side: THREE.DoubleSide, transparent: true, opacity: 0.8
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.copy(pos);
  ring.lookAt(pos.clone().multiplyScalar(2));
  group.add(ring);
  // Pulsing ring
  const pulseGeo = new THREE.RingGeometry(0.024, 0.03, 48);
  const pulseMat = new THREE.MeshBasicMaterial({
    color: GOLD, side: THREE.DoubleSide, transparent: true, opacity: 0.5
  });
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);
  pulse.position.copy(pos);
  pulse.lookAt(pos.clone().multiplyScalar(2));
  pulse.userData.pulse = true;
  group.add(pulse);
  return group;
}
markerGroup.add(makeOriginMarker());

// ---------- Destination markers + arcs ----------
const arcsGroup = new THREE.Group();
globeGroup.add(arcsGroup);

const destinationMarkers = []; // { mesh, data, ringMesh }
const arcs = []; // { curve, line, progress, total, data, particle }

function makeGreatCircleArc(startLL, endLL, data) {
  const start = latLonToVec3(startLL.lat, startLL.lon, GLOBE_R * 1.002);
  const end = latLonToVec3(endLL.lat, endLL.lon, GLOBE_R * 1.002);
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const dist = start.distanceTo(end);
  // Altitude proportional to distance for nice arcs
  const altitude = GLOBE_R + Math.min(0.7, 0.22 + dist * 0.45);
  mid.normalize().multiplyScalar(altitude);
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
  return { curve, start, end };
}

function buildArcsAndMarkers() {
  const VISITS = window.VISITS;
  VISITS.forEach((v, i) => {
    const { curve, end } = makeGreatCircleArc(ORIGIN, { lat: v.lat, lon: v.lon }, v);
    const divisions = 80;
    const points = curve.getPoints(divisions);
    const positions = new Float32Array(points.length * 3);
    const alphas = new Float32Array(points.length);
    points.forEach((p, k) => {
      positions[k*3] = p.x;
      positions[k*3+1] = p.y;
      positions[k*3+2] = p.z;
      alphas[k] = k / (points.length - 1);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));

    const arcMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: GOLD.clone() },
        uProgress: { value: 0 },
        uHighlight: { value: 0 }
      },
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        void main(){
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uProgress;
        uniform float uHighlight;
        varying float vAlpha;
        void main(){
          if (vAlpha > uProgress) discard;
          // moving sparkle
          float head = smoothstep(uProgress - 0.12, uProgress, vAlpha);
          float tail = smoothstep(0.0, 0.35, vAlpha);
          float base = tail * (0.35 + 0.65 * head);
          float highlight = 1.0 + uHighlight * 1.4;
          vec3 col = uColor * (0.5 + 0.5 * head) * highlight;
          gl_FragColor = vec4(col, base * (0.55 + 0.45 * highlight));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const line = new THREE.Line(geo, arcMat);
    arcsGroup.add(line);

    // Destination marker
    const markerMat = new THREE.MeshBasicMaterial({ color: GOLD });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 12), markerMat);
    dot.position.copy(end);
    dot.userData.visit = v;
    dot.userData.isDest = true;
    arcsGroup.add(dot);

    // Ring around marker
    const ringGeo = new THREE.RingGeometry(0.017, 0.021, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: GOLD, side: THREE.DoubleSide, transparent: true, opacity: 0.55
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(end);
    ring.lookAt(end.clone().multiplyScalar(2));
    arcsGroup.add(ring);

    // Small shaft from surface outward (flag pole hint)
    const shaftGeo = new THREE.CylinderGeometry(0.0008, 0.0008, 0.04, 6);
    const shaftMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.5 });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.copy(end.clone().multiplyScalar(1.02));
    shaft.lookAt(end.clone().multiplyScalar(3));
    shaft.rotateX(Math.PI/2);
    arcsGroup.add(shaft);

    destinationMarkers.push({ mesh: dot, ring, data: v });
    arcs.push({
      line, material: arcMat, progress: 0, offset: i * 0.7,
      data: v, end, curve
    });
  });
}
buildArcsAndMarkers();

// ---------- Airplane marker ----------
function makePlaneMarker() {
  const g = new THREE.Group();
  // depthTest: false → el avión es visible incluso cuando está detrás del globo
  const mat = new THREE.MeshBasicMaterial({ color: GOLD, depthTest: false });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.042), mat));
  const wings = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.0015, 0.013), mat);
  wings.position.z = 0.004;
  g.add(wings);
  const hStab = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.0015, 0.008), mat);
  hStab.position.z = -0.018;
  g.add(hStab);
  const vStab = new THREE.Mesh(new THREE.BoxGeometry(0.0015, 0.013, 0.008), mat);
  vStab.position.z = -0.018;
  g.add(vStab);
  return g;
}
const planeMarker = makePlaneMarker();
// renderOrder alto → se renderiza después del globo, siempre visible encima
planeMarker.traverse(obj => { if (obj.isMesh) obj.renderOrder = 999; });
planeMarker.visible = false;
globeGroup.add(planeMarker);

let planeAnim = null;
let planeHideTimeout = null;
const PLANE_SPEED = 0.38;

let cameraPhase = null;     // 'to-ecuador' | 'to-dest' | null
let cameraDestTarget = null;

// ---------- Hit-testing ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
let hovered = null;

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(destinationMarkers.map(d => d.mesh), false);
  if (hits.length) {
    const v = hits[0].object.userData.visit;
    hovered = v;
    canvas.style.cursor = 'pointer';
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX - rect.left) + 'px';
    tooltip.style.top = (e.clientY - rect.top) + 'px';
    tooltip.querySelector('.tt-name').textContent = v.name + ' · ' + v.capital;
    tooltip.querySelector('.tt-date').textContent = v.dateLong + ' · ' + v.type.toUpperCase();
  } else {
    hovered = null;
    canvas.style.cursor = 'grab';
    tooltip.style.display = 'none';
  }
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(destinationMarkers.map(d => d.mesh), false);
  if (hits.length) {
    const v = hits[0].object.userData.visit;
    window.dispatchEvent(new CustomEvent('visit:selected', { detail: v.code }));
  }
});

// ---------- Camera zoom-to-country ----------
let zoomTarget = null;
let zoomStart = null;
let zoomT = 0;
let highlightedCode = null;

// Calcula la posición de cámara óptima para ver la ruta Ecuador → destino.
// Rutas cortas (≤90°): 70 % hacia el destino — el destino queda prominente.
// Rutas largas (>90°): desplaza el bias según la distancia para que Ecuador
// siga siendo visible dentro del hemisferio de la cámara.
function routeCamPos(destLat, destLon) {
  const origDir = latLonToVec3(ORIGIN.lat, ORIGIN.lon, 1).normalize();
  const destDir = latLonToVec3(destLat, destLon, 1).normalize();
  const theta = Math.acos(Math.max(-1, Math.min(1, origDir.dot(destDir))));
  // Peso hacia destino: 70 % para rutas cortas, baja linealmente a 50 % a 180°
  const dw = Math.max(0.50, 0.70 - 0.20 * (theta / Math.PI));
  const blend = origDir.clone().multiplyScalar(1 - dw).add(destDir.clone().multiplyScalar(dw));
  if (blend.length() < 0.01) return new THREE.Vector3(0, 4.5, 0);
  blend.normalize();
  // Distancia mínima para que Ecuador quede dentro del hemisferio visible
  const cosHalf = Math.max(0.05, origDir.dot(blend));
  const camDist = Math.min(4.5, Math.max(2.3, (1.0 / cosHalf) + 0.5));
  return blend.multiplyScalar(camDist);
}

function setHighlight(code) {
  highlightedCode = code;
  arcs.forEach(a => {
    a.material.uniforms.uHighlight.value = (a.data.code === code) ? 1 : 0;
  });
  destinationMarkers.forEach(d => {
    const hl = d.data.code === code;
    d.mesh.scale.setScalar(hl ? 1.6 : 1);
    d.ring.material.opacity = hl ? 1 : 0.55;
  });
}

window.addEventListener('visit:focus', (e) => {
  const code = e.detail;
  const visit = window.VISITS.find(v => v.code === code);
  if (!visit) return;
  setHighlight(code);

  // Si hay animación de avión activa, ella maneja la cámara
  if (cameraPhase) return;

  controls.autoRotate = false;
  zoomStart = camera.position.clone();
  zoomTarget = routeCamPos(visit.lat, visit.lon);
  zoomT = 0;
});

window.addEventListener('plane:launch', (e) => {
  const arc = arcs.find(a => a.data.code === e.detail);
  if (!arc) return;
  if (planeHideTimeout !== null) {
    clearTimeout(planeHideTimeout);
    planeHideTimeout = null;
  }

  // Cámara fase 1: ir rápido a Ecuador
  const origDir = latLonToVec3(ORIGIN.lat, ORIGIN.lon, 1).normalize();
  const ecuadorCam = origDir.clone().multiplyScalar(2.3);

  // Cámara fase 2: posición óptima según distancia de la ruta
  const destCam = routeCamPos(arc.data.lat, arc.data.lon);

  zoomStart = camera.position.clone();
  zoomTarget = ecuadorCam;
  zoomT = 0;
  cameraPhase = 'to-ecuador';
  cameraDestTarget = destCam;
  controls.autoRotate = false;

  // Avión: reiniciar desde Ecuador
  planeAnim = null;
  planeMarker.visible = true;
  planeAnim = { curve: arc.curve, t: 0 };
  planeMarker.position.copy(arc.curve.getPoint(0));
});

window.addEventListener('visit:resetview', () => {
  controls.autoRotate = true;
  zoomStart = camera.position.clone();
  zoomTarget = new THREE.Vector3(0, 0.4, 2.8);
  zoomT = 0;
  cameraPhase = null;
  cameraDestTarget = null;
  setHighlight(null);
  if (planeHideTimeout !== null) {
    clearTimeout(planeHideTimeout);
    planeHideTimeout = null;
  }
  planeMarker.visible = false;
  planeAnim = null;
});

// ---------- Resize ----------
function onResize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ---------- Animate ----------
const clock = new THREE.Clock();
function animate() {
  const dt = clock.getDelta();
  const t = clock.elapsedTime;

  globeMat.uniforms.uTime.value = t;
  atmosphere.material.uniforms.uTime.value = t;

  // Arc progress — travels forward, loops
  arcs.forEach((a, i) => {
    const speed = 0.25;
    const cycle = ((t * speed + a.offset) % 1.6);
    // head travels 0..1 then rests at 1 for a moment
    const prog = Math.min(1, cycle);
    a.material.uniforms.uProgress.value = prog;
    a.material.uniforms.uTime.value = t;
  });

  // Pulsing origin ring
  markerGroup.traverse(obj => {
    if (obj.userData && obj.userData.pulse) {
      const s = 1 + 0.5 * Math.sin(t * 2.4);
      obj.scale.setScalar(s);
      obj.material.opacity = 0.45 * (1 - (s - 1));
    }
  });

  // Airplane animation
  if (planeAnim) {
    planeAnim.t = Math.min(1, planeAnim.t + dt * PLANE_SPEED);
    const p = planeAnim.curve.getPoint(planeAnim.t);
    const tangent = planeAnim.curve.getTangent(planeAnim.t).normalize();
    planeMarker.position.copy(p);
    const up = p.clone().normalize();
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const corrUp = new THREE.Vector3().crossVectors(right, tangent).normalize();
    planeMarker.setRotationFromMatrix(new THREE.Matrix4().makeBasis(right, corrUp, tangent));
    if (planeAnim.t >= 1) {
      planeAnim = null;
      planeHideTimeout = setTimeout(() => {
        planeHideTimeout = null;
        if (!planeAnim) planeMarker.visible = false;
      }, 700);
    }
  }

  // Zoom camera lerp (dos fases cuando hay animación de avión)
  if (zoomTarget && zoomStart) {
    const zoomSpeed = cameraPhase === 'to-ecuador' ? 3.0 : 0.9;
    zoomT = Math.min(1, zoomT + dt * zoomSpeed);
    const ease = 1 - Math.pow(1 - zoomT, 3);
    camera.position.lerpVectors(zoomStart, zoomTarget, ease);
    controls.update();
    if (zoomT >= 1) {
      if (cameraPhase === 'to-ecuador' && cameraDestTarget) {
        // Fase 2: Ecuador → destino
        zoomStart = camera.position.clone();
        zoomTarget = cameraDestTarget;
        cameraDestTarget = null;
        cameraPhase = 'to-dest';
        zoomT = 0;
      } else {
        zoomStart = null;
        zoomTarget = null;
        cameraPhase = null;
      }
    }
  } else {
    controls.update();
  }

  composer.render();
  requestAnimationFrame(animate);
}
animate();

// signal ready
window.__globeReady = true;
window.__scene = scene;
window.__globeGroup = globeGroup;
window.dispatchEvent(new Event('globe:ready'));
