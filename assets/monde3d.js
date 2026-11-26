/* The world of the calendar, in 3D: a floating snowy island, one village per
 * theme, twenty-four houses, and a door on each that really opens.
 *
 * One engine, two calendars. A calendar gives the engine its data (the page's
 * JSON block): a `world` (theme `night` or `dawn`, and four villages with a
 * name, a tone, a house style and a landmark) and its days (each with its
 * village). The engine draws, the page decides: whether a door may open, and
 * what is behind it, belong to advent.js (`window.AdventPage`).
 *
 * What a reader sees:
 *   - the island turns slowly; dragging turns it by hand;
 *   - a click on a village flies there, a click on a house flies to its door;
 *   - a door that may open swings on its hinge, light pours out, and the stage
 *     opens; a locked one rattles, and the page says when it opens;
 *   - an opened house keeps its windows lit, and lights one bulb on the big
 *     tree in the middle: the island lights up as December goes.
 *
 * Needs three.js r128 (global `THREE`). Without WebGL the page keeps its
 * cabinet of doors, which is also the keyboard and screen-reader path.
 */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;

  var THEMES = {
    night: {sky: 0x8ea6ff, ground: 0x1c2452, hemi: 0.4, sun: 0xb7c8ff, sunI: 0.52, sunPos: [-28, 46, 18],
            snow: 0xd2dcfb, rock: 0x39437a, rock2: 0x161c3e, fog: 0x0b1433, fogD: 0.0042, ice: 0x2b5fa3,
            trunk: 0x4a342a, pine: 0x1f6a58, pine2: 0x2c8068, flake: 0xffffff, lit: 0xffc15a, dark: 0x1a2446,
            stone: 0x8e9bc9, glowTree: 0xffc27a, lift: 0.16, glowK: 1, lampI: 0.9},
    dawn:  {sky: 0xd9d4ff, ground: 0x6a5488, hemi: 0.52, sun: 0xffc9a0, sunI: 0.6, sunPos: [30, 17, -30],
            snow: 0xffffff, rock: 0x8a5f72, rock2: 0x4a3150, fog: 0xf0b592, fogD: 0.0032, ice: 0x6fa9dc,
            trunk: 0x5a3a2c, pine: 0x2f7a60, pine2: 0x44906f, flake: 0xfffaf4, lit: 0xffd27a, dark: 0x4a3a58,
            stone: 0xb98f94, glowTree: 0xffd9a0, lift: 0.03, glowK: 0.42, lampI: 0.22}
  };

  /* how the houses of a village are built */
  var STYLES = {
    paper:    {walls: [0xf2e3bf, 0xe9d3a0, 0xf6ead0], roof: 0xb9862a, roofType: 'gable', w: 2.3, h: 1.9, d: 2.0},
    harbour:  {walls: [0xe9d9ee, 0xd9c2e6, 0xf3e6f5], roof: 0xb23a94, roofType: 'steep', w: 1.9, h: 2.3, d: 1.9},
    works:    {walls: [0xd9d2f2, 0xc7bdf0, 0xe6e1f8], roof: 0x5d45b8, roofType: 'pyramid', w: 2.2, h: 2.0, d: 2.2},
    station:  {walls: [0xe2f0c8, 0xd2e6ae, 0xedf6dc], roof: 0x4f8a2a, roofType: 'flat', w: 2.5, h: 1.8, d: 2.0},
    words:    {walls: [0xf6c9a4, 0xf0b48c, 0xfad9bc], roof: 0xc65f3e, roofType: 'gable', w: 2.3, h: 1.9, d: 2.0},
    proof:    {walls: [0xbfd6f2, 0xa9c6ea, 0xd3e3f6], roof: 0x3d6ea8, roofType: 'pyramid', w: 2.1, h: 2.1, d: 2.1},
    memory:   {walls: [0xf0d99a, 0xe6c878, 0xf5e4b4], roof: 0x9a7a2c, roofType: 'steep', w: 2.0, h: 2.2, d: 1.9},
    together: {walls: [0xd9c2ee, 0xc8ace4, 0xe6d6f4], roof: 0x7a4a9c, roofType: 'flat', w: 2.5, h: 1.8, d: 2.0}
  };

  function mount(host, data, page) {
    var THREE = global.THREE;
    if (!THREE || !host || !data.world) return null;
    var theme = THEMES[data.world.theme] || THEMES.night;
    var reduced = global.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'high-performance'});
    } catch (e) { return null; }
    renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    var canvas = renderer.domElement;
    canvas.className = 'monde-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(theme.fog, theme.fogD);
    var camera = new THREE.PerspectiveCamera(36, 2, 0.5, 400);

    scene.add(new THREE.HemisphereLight(theme.sky, theme.ground, theme.hemi));
    var sun = new THREE.DirectionalLight(theme.sun, theme.sunI);
    sun.position.set(theme.sunPos[0], theme.sunPos[1], theme.sunPos[2]);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -38; sun.shadow.camera.right = 38;
    sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0006;
    scene.add(sun);

    var island = new THREE.Group();
    scene.add(island);

    var spinners = [];

    /* --- small helpers ---------------------------------------------------- */

    var seed = 20261201;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    function mat(color, o) {
      o = o || {};
      return new THREE.MeshStandardMaterial({color: color, flatShading: true, roughness: o.rough == null ? 0.85 : o.rough,
        metalness: o.metal || 0, emissive: o.own ? color : (o.emissive || 0x000000),
        emissiveIntensity: o.own ? theme.lift * o.own : (o.ei == null ? 1 : o.ei),
        transparent: !!o.alpha, opacity: o.alpha || 1});
    }
    function mesh(geo, material, x, y, z, shadow) {
      var m = new THREE.Mesh(geo, material);
      m.position.set(x || 0, y || 0, z || 0);
      if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
      return m;
    }
    function box(w, h, d, material, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z); }
    function cyl(rt, rb, h, seg, material, x, y, z) { return mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material, x, y, z); }
    function prism(w, h, d) {
      var A = [-w, 0, d], B = [w, 0, d], C = [0, h, d], D = [-w, 0, -d], E = [w, 0, -d], F = [0, h, -d];
      var tri = [A, B, C, E, D, F, A, C, F, A, F, D, B, E, F, B, F, C];
      var pos = [];
      tri.forEach(function (p) { pos.push(p[0], p[1], p[2]); });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      return g;
    }
    function hex(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
    function toneOf(v) { return new THREE.Color(v.tone); }

    var roomTex = (function () {
      var c = document.createElement('canvas'); c.width = 64; c.height = 112;
      var g = c.getContext('2d'), r = g.createRadialGradient(32, 62, 2, 32, 62, 70);
      r.addColorStop(0, '#f6cf8c'); r.addColorStop(0.5, '#e2a257'); r.addColorStop(1, '#b96a2a');
      g.fillStyle = r; g.fillRect(0, 0, 64, 112);
      g.fillStyle = 'rgba(120,50,10,.5)'; g.fillRect(0, 96, 64, 16);
      return new THREE.CanvasTexture(c);
    })();
    var glowTex = (function () {
      var c = document.createElement('canvas'); c.width = c.height = 128;
      var g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.55)');
      r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    function glow(color, size, opacity) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({map: glowTex, color: color, transparent: true,
        opacity: (opacity == null ? 0.9 : opacity) * theme.glowK, blending: THREE.AdditiveBlending, depthWrite: false}));
      s.scale.set(size, size, 1);
      return s;
    }

    /* --- the ground: hills, flat where a village stands -------------------- */

    var R = 32, VR = 17.5;
    function rim(a) { return R * (1 + 0.055 * Math.sin(3 * a + 0.7) + 0.035 * Math.sin(5 * a + 2.1) + 0.018 * Math.sin(9 * a)); }
    var villages = data.world.villages.map(function (v, i) {
      var a = Math.PI / 4 + i * Math.PI / 2;
      return {def: v, i: i, a: a, x: Math.cos(a) * VR, z: Math.sin(a) * VR, houses: [], style: STYLES[v.style] || STYLES.paper};
    });
    villages.forEach(function (v) {
      var days = data.days.filter(function (d) { return d.band === v.def.id; });
      var n = days.length, span = Math.min(2.5, 0.5 * (n - 1));
      v.plots = days.map(function (d, i) {
        var big = d.day === 24 ? 1.38 : d.day === 1 ? 1.16 : 1;
        var off = n > 1 ? -span / 2 + span * i / (n - 1) : 0;
        var dir = v.a + off, rad = 8.0 + (i % 2 ? 1.0 : 0) + (big > 1.2 ? 0.3 : 0);
        return {day: d.day, big: big, x: v.x + Math.cos(dir) * rad, z: v.z + Math.sin(dir) * rad, face: v.a + off * 0.8};
      });
    });
    function smooth(e0, e1, x) { var t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
    function heightAt(x, z) {
      var h = 1.3 * Math.sin(x * 0.21 + 1.3) * Math.cos(z * 0.17 - 0.4) + 0.9 * Math.sin(x * 0.09 - z * 0.13 + 2.1) + 0.9;
      var keep = smooth(7.5, 11.5, Math.sqrt(x * x + z * z));
      villages.forEach(function (v) {
        keep = Math.min(keep, smooth(10.6, 14.5, Math.sqrt((x - v.x) * (x - v.x) + (z - v.z) * (z - v.z))));
      });
      villages.forEach(function (v) {
        v.plots.forEach(function (pl) {
          var cx = Math.cos(pl.face), cz = Math.sin(pl.face);
          var along = Math.max(0, Math.min(9, (x - pl.x) * cx + (z - pl.z) * cz));
          var ox = x - pl.x - cx * along, oz = z - pl.z - cz * along;
          keep = Math.min(keep, smooth(2.2, 5, Math.sqrt(ox * ox + oz * oz)));
        });
      });
      var rr = rim(Math.atan2(z, x));
      var edge = 1 - smooth(rr - 4, rr, Math.sqrt(x * x + z * z));
      return Math.max(0, h) * keep * edge;
    }
    (function ground() {
      var rings = 30, segs = 80, pos = [], idx = [];
      pos.push(0, 0, 0);
      for (var r = 1; r <= rings; r++) {
        for (var s = 0; s < segs; s++) {
          var a = TAU * s / segs + (r % 2 ? 0 : Math.PI / segs), rr = rim(a) * r / rings;
          var x = Math.cos(a) * rr, z = Math.sin(a) * rr;
          pos.push(x, heightAt(x, z), z);
        }
      }
      for (var s2 = 0; s2 < segs; s2++) idx.push(0, 1 + (s2 + 1) % segs, 1 + s2);
      for (var r2 = 1; r2 < rings; r2++) {
        for (var s3 = 0; s3 < segs; s3++) {
          var a0 = 1 + (r2 - 1) * segs + s3, a1 = 1 + (r2 - 1) * segs + (s3 + 1) % segs;
          var b0 = a0 + segs, b1 = a1 + segs;
          idx.push(a0, a1, b0, a1, b1, b0);
        }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g = g.toNonIndexed();
      g.computeVertexNormals();
      var top = mesh(g, mat(theme.snow, {rough: 0.95}), 0, 0, 0);
      top.castShadow = false;
      island.add(top);

      /* under the snow: a band of snow, then the rock, narrowing to a point */
      var F = [1, 0.992, 0.95, 0.8, 0.6, 0.4, 0.2, 0.0], Y = [0, -0.9, -2.4, -6, -10.5, -15, -19.5, -23], S = 40;
      var rp = [], rc = [], ri = [], top = new THREE.Color(theme.snow), hi = new THREE.Color(theme.rock), lo = new THREE.Color(theme.rock2);
      for (var k = 0; k < F.length; k++) {
        for (var q = 0; q < S; q++) {
          var a3 = TAU * q / S + (k % 2 ? Math.PI / S : 0), j = k > 1 && k < F.length - 1 ? 1 : 0;
          var rad = (k === F.length - 1 ? 0 : rim(a3) * F[k] * (1 + j * (rnd() - 0.5) * 0.22));
          rp.push(Math.cos(a3) * rad, Y[k] + j * (rnd() - 0.5) * 2.2, Math.sin(a3) * rad);
          var c = k < 2 ? top : hi.clone().lerp(lo, (k - 2) / (F.length - 3));
          rc.push(c.r, c.g, c.b);
        }
      }
      for (var k2 = 0; k2 < F.length - 1; k2++) {
        for (var q2 = 0; q2 < S; q2++) {
          var p0 = k2 * S + q2, p1 = k2 * S + (q2 + 1) % S, p2 = p0 + S, p3 = p1 + S;
          ri.push(p0, p2, p1, p1, p2, p3);
        }
      }
      var rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      rg.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
      rg.setIndex(ri);
      rg = rg.toNonIndexed();
      rg.computeVertexNormals();
      var rockM = mat(0xffffff, {rough: 1});
      rockM.vertexColors = true; rockM.side = THREE.DoubleSide;
      island.add(mesh(rg, rockM, 0, 0.02, 0, false));

      /* a few rocks that float beside it */
      [[1.9, 39, -5, 0.4], [1.2, 43, -9, 2.6], [2.6, 41, -12, 4.1], [1.0, 37, -3, 5.3]].forEach(function (f, i) {
        var g2 = new THREE.Group();
        var st = mesh(new THREE.DodecahedronGeometry(f[0], 0), mat(theme.rock), 0, 0, 0, false); st.scale.y = 1.5; g2.add(st);
        var sn = mesh(new THREE.CylinderGeometry(f[0] * 0.78, f[0] * 0.92, f[0] * 0.4, 7), mat(theme.snow), 0, f[0] * 1.02, 0, false); g2.add(sn);
        g2.add(mesh(new THREE.ConeGeometry(f[0] * 0.3, f[0] * 0.9, 6), mat(theme.pine), 0, f[0] * 1.6, 0, false));
        g2.position.set(Math.cos(f[3]) * f[1], f[2], Math.sin(f[3]) * f[1]);
        island.add(g2);
        spinners.push(function (t) { g2.position.y = f[2] + Math.sin(t * 0.6 + i * 1.7) * 0.7; g2.rotation.y = t * 0.08 * (i % 2 ? 1 : -1); });
      });
    })();

    /* --- the lake, the big tree and its twenty-four bulbs ------------------- */

    var bulbs = {};
    var star, starGlow;
    (function centre() {
      var ice = mesh(new THREE.CircleGeometry(6.6, 48), mat(theme.ice, {rough: 0.18, metal: 0.25}), 0, 0.05, 0, false);
      ice.rotation.x = -Math.PI / 2; ice.receiveShadow = true;
      island.add(ice);
      island.add(cyl(1.5, 1.9, 0.5, 9, mat(theme.snow), 0, 0.25, 0));
      island.add(cyl(0.32, 0.4, 1.4, 7, mat(theme.trunk), 0, 1.1, 0));
      var tiers = [[2.9, 3.2, 3.2], [2.3, 2.8, 5.0], [1.7, 2.5, 6.7], [1.1, 2.2, 8.3]];
      tiers.forEach(function (t, i) {
        island.add(mesh(new THREE.ConeGeometry(t[0], t[1], 9), mat(i % 2 ? theme.pine2 : theme.pine), 0, t[2], 0));
        island.add(mesh(new THREE.ConeGeometry(t[0] * 0.55, t[1] * 0.5, 9), mat(theme.snow), 0, t[2] + t[1] * 0.27, 0, false));
      });
      star = mesh(new THREE.OctahedronGeometry(0.55), new THREE.MeshBasicMaterial({color: 0x6b5a2a}), 0, 9.9, 0, false);
      island.add(star);
      starGlow = glow(0xffd66b, 6, 0); starGlow.position.set(0, 9.9, 0);
      island.add(starGlow);
      for (var d = 1; d <= 24; d++) {
        var t2 = (d - 0.5) / 24, y = 2.0 + t2 * 6.6, rad = 2.75 * (1 - t2 * 0.74) + 0.12, a = d * 2.4;
        var b = mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({color: 0x2a3350}),
                     Math.cos(a) * rad, y, Math.sin(a) * rad, false);
        var g = glow(0xffffff, 1.5, 0); g.position.copy(b.position);
        island.add(b); island.add(g);
        bulbs[d] = {mesh: b, glow: g};
      }
    })();

    /* --- the forest --------------------------------------------------------- */

    (function forest() {
      var spots = [];
      for (var tries = 0; tries < 900 && spots.length < 120; tries++) {
        var a = rnd() * TAU, r = 9.5 + rnd() * (R - 13.5), x = Math.cos(a) * r, z = Math.sin(a) * r, ok = true;
        if (Math.abs(((a - Math.PI / 4) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2)) < 0.11 && r < VR) ok = false;
        villages.forEach(function (v) {
          var dx = x - v.x, dz = z - v.z, dist = Math.sqrt(dx * dx + dz * dz);
          /* nothing in a village, and nothing between a village and the one who looks at it */
          var out = (dx * Math.cos(v.a) + dz * Math.sin(v.a));
          if (dist < 11.4 || (out > 0 && dist < 17 && Math.abs(-dx * Math.sin(v.a) + dz * Math.cos(v.a)) < 11)) ok = false;
          v.plots.forEach(function (pl) {
            var along = (x - pl.x) * Math.cos(pl.face) + (z - pl.z) * Math.sin(pl.face);
            var across = Math.abs(-(x - pl.x) * Math.sin(pl.face) + (z - pl.z) * Math.cos(pl.face));
            if (along > 0 && along < 22 && across < 3.5 + along * 0.4) ok = false;
          });
        });
        if (ok) spots.push([x, z, 0.7 + rnd() * 0.9]);
      }
      var trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 0.7, 5), mat(theme.trunk), spots.length);
      var low = new THREE.InstancedMesh(new THREE.ConeGeometry(0.85, 1.5, 7), mat(theme.pine), spots.length);
      var high = new THREE.InstancedMesh(new THREE.ConeGeometry(0.6, 1.3, 7), mat(theme.pine2), spots.length);
      var cap = new THREE.InstancedMesh(new THREE.ConeGeometry(0.36, 0.7, 7), mat(theme.snow), spots.length);
      var m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      spots.forEach(function (t, i) {
        var y = heightAt(t[0], t[1]);
        s.set(t[2], t[2], t[2]);
        trunk.setMatrixAt(i, m.compose(p.set(t[0], y + 0.35 * t[2], t[1]), q, s));
        low.setMatrixAt(i, m.compose(p.set(t[0], y + 1.35 * t[2], t[1]), q, s));
        high.setMatrixAt(i, m.compose(p.set(t[0], y + 2.2 * t[2], t[1]), q, s));
        cap.setMatrixAt(i, m.compose(p.set(t[0], y + 2.56 * t[2], t[1]), q, s));
      });
      [trunk, low, high, cap].forEach(function (im) { im.castShadow = true; im.receiveShadow = true; island.add(im); });
    })();

    /* --- the number of a door, drawn on a canvas ------------------------------------------- */

    function badge(day, tone) {
      var c = document.createElement('canvas'); c.width = c.height = 160;
      var tex = new THREE.CanvasTexture(c);
      function draw(state) {
        var g = c.getContext('2d');
        g.clearRect(0, 0, 160, 160);
        g.beginPath(); g.arc(80, 80, 66, 0, TAU);
        g.fillStyle = state === 'open' ? hex(tone) : state === 'ready' ? '#fff3cf' : 'rgba(16,24,52,.92)';
        g.fill();
        g.lineWidth = 7;
        g.strokeStyle = state === 'locked' ? 'rgba(160,172,210,.55)' : state === 'ready' ? '#f6c85f' : '#ffffff';
        g.stroke();
        g.fillStyle = state === 'locked' ? 'rgba(200,210,240,.75)' : '#0b1026';
        g.font = 'italic 800 ' + (day > 9 ? 78 : 88) + 'px Fraunces, Georgia, serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(day), 80, 86);
        tex.needsUpdate = true;
      }
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, transparent: true, depthWrite: false}));
      sp.userData.draw = draw;
      return sp;
    }
    /* --- a house -------------------------------------------------------------- */

    var houses = {}, pickables = [], redraw = [];
    function house(day, v, scale) {
      var st = v.style, tone = toneOf(v.def);
      var g = new THREE.Group();
      var w = st.w, h = st.h, d = st.d;
      var wallC = st.walls[day % st.walls.length];
      var dw = 0.84, dh = 1.3, t = 0.12, wallM = mat(wallC, {own: 1});
      g.add(box(w, h, t, wallM, 0, h / 2, -d / 2 + t / 2));
      g.add(box(t, h, d, wallM, -w / 2 + t / 2, h / 2, 0));
      g.add(box(t, h, d, wallM, w / 2 - t / 2, h / 2, 0));
      g.add(box((w - dw) / 2, h, t, wallM, -(w + dw) / 4, h / 2, d / 2 - t / 2));
      g.add(box((w - dw) / 2, h, t, wallM, (w + dw) / 4, h / 2, d / 2 - t / 2));
      g.add(box(dw, h - dh - 0.16, t, wallM, 0, (h + dh + 0.16) / 2, d / 2 - t / 2));
      g.add(box(w, t, d, wallM, 0, h - t / 2, 0));
      g.add(box(w + 0.16, 0.16, d + 0.16, mat(theme.snow), 0, 0.08, 0));

      /* the room: warm, and seen only through the open door */
      var rw = w - 2 * t - 0.02, rd = d - 2 * t - 0.02, rh0 = h - t - 0.17;
      function wall(wd, ht, color, x, y, z, ry, rx) {
        var m = mesh(new THREE.PlaneGeometry(wd, ht), typeof color === 'number' ? new THREE.MeshBasicMaterial({color: color}) : color, x, y, z, false);
        m.rotation.y = ry || 0; m.rotation.x = rx || 0; g.add(m);
      }
      wall(rw, rh0, new THREE.MeshBasicMaterial({map: roomTex}), 0, 0.165 + rh0 / 2, -rd / 2, 0);
      wall(rd, rh0, 0xc47f3a, -rw / 2, 0.165 + rh0 / 2, 0, Math.PI / 2);
      wall(rd, rh0, 0xc47f3a, rw / 2, 0.165 + rh0 / 2, 0, -Math.PI / 2);
      wall(rw, rd, 0x7a4e34, 0, 0.165, 0, 0, -Math.PI / 2);
      wall(rw * 0.7, rd * 0.62, 0x9a3434, 0, 0.168, 0.1, 0, -Math.PI / 2);

      /* what the house holds: one thing, taken from the week's theme, which opens after the door */
      var held = null, kind = v.def.inside;
      if (THINGS[kind]) {
        var inner = new THREE.Group();
        held = THINGS[kind](inner, tone.getHex(), day);
        inner.scale.setScalar(Math.min(1.05 / held.h, 1.0 / held.w, 0.95 / held.d * 1.4));
        inner.position.set(0, 0.17, Math.min(0.25, d / 2 - 0.75));
        inner.traverse(function (m) {
          if (!m.isMesh) return;
          m.castShadow = false; m.receiveShadow = false;
          if (m.material.isMeshStandardMaterial) { m.material.emissive.copy(m.material.color); m.material.emissiveIntensity = 0.42; }
        });
        g.add(inner);
      }

      var roofM = mat(st.roof, {own: 1.6}), snowM = mat(theme.snow);
      var rh = st.roofType === 'steep' ? 1.9 : st.roofType === 'flat' ? 0.34 : 1.25;
      if (st.roofType === 'pyramid') {
        var py = mesh(new THREE.ConeGeometry(w * 0.82, rh, 4), roofM, 0, h + rh / 2, 0); py.rotation.y = Math.PI / 4; g.add(py);
        var pc = mesh(new THREE.ConeGeometry(w * 0.47, rh * 0.57, 4), snowM, 0, h + rh * 0.45 + rh * 0.285 + 0.03, 0, false);
        pc.rotation.y = Math.PI / 4; g.add(pc);
      } else if (st.roofType === 'flat') {
        g.add(box(w + 0.3, rh, d + 0.3, roofM, 0, h + rh / 2, 0));
        g.add(box(w + 0.1, 0.16, d + 0.1, snowM, 0, h + rh + 0.08, 0));
        g.add(box(w * 0.45, 0.5, d * 0.5, mat(wallC, {own: 1}), -w * 0.18, h + rh + 0.25, 0));
        g.add(box(w * 0.45 + 0.1, 0.12, d * 0.5 + 0.1, snowM, -w * 0.18, h + rh + 0.56, 0));
      } else {
        g.add(mesh(prism(w / 2 + 0.2, rh, d / 2 + 0.16), roofM, 0, h, 0));
        g.add(mesh(prism((w / 2 + 0.2) * 0.58, rh * 0.57, d / 2 + 0.2), snowM, 0, h + rh * 0.45 + 0.02, 0, false));
      }
      g.add(box(0.34, 0.9, 0.34, mat(0x6b4a3a), w * 0.28, h + rh * 0.55, -d * 0.2));
      g.add(box(0.42, 0.1, 0.42, snowM, w * 0.28, h + rh * 0.55 + 0.5, -d * 0.2));

      /* windows: dark until the door has been opened */
      var winM = new THREE.MeshBasicMaterial({color: theme.dark});
      var wy = h * 0.62;
      [[-w * 0.36, wy, d / 2 + 0.011, 0], [w * 0.36, wy, d / 2 + 0.011, 0],
       [w / 2 + 0.011, wy, 0, Math.PI / 2], [-w / 2 - 0.011, wy, 0, -Math.PI / 2]].forEach(function (p) {
        var frame = mesh(new THREE.PlaneGeometry(0.44, 0.56), mat(0x4a3a30), p[0], p[1], p[2], false);
        var pane = mesh(new THREE.PlaneGeometry(0.32, 0.44), winM, p[0], p[1], p[2], false);
        frame.rotation.y = pane.rotation.y = p[3];
        pane.position.x += Math.sin(p[3]) * 0.006; pane.position.z += Math.cos(p[3]) * 0.006;
        g.add(frame); g.add(pane);
      });

      /* the door, on its hinge, in its frame */
      var frameM = mat(0x3a2a22);
      g.add(box(0.1, dh + 0.06, 0.1, frameM, -dw / 2 - 0.05, 0.16 + (dh + 0.06) / 2, d / 2 + 0.02));
      g.add(box(0.1, dh + 0.06, 0.1, frameM, dw / 2 + 0.05, 0.16 + (dh + 0.06) / 2, d / 2 + 0.02));
      g.add(box(dw + 0.2, 0.1, 0.1, frameM, 0, 0.16 + dh + 0.05, d / 2 + 0.02));
      var hinge = new THREE.Group();
      hinge.position.set(-dw / 2, 0.16, d / 2 + 0.07);
      var leaf = box(dw, dh, 0.07, mat(v.def.tone, {rough: 0.6, own: 2.2}), dw / 2, dh / 2, 0);
      hinge.add(box(dw * 0.62, dh * 0.3, 0.02, mat(v.def.tone, {rough: 0.5, own: 3.2}), dw / 2, dh * 0.72, 0.04));
      hinge.add(box(dw * 0.62, dh * 0.3, 0.02, mat(v.def.tone, {rough: 0.5, own: 3.2}), dw / 2, dh * 0.3, 0.04));
      hinge.add(leaf);
      hinge.add(mesh(new THREE.SphereGeometry(0.05, 8, 6), mat(0xf6c85f, {metal: 0.6, rough: 0.3}), dw - 0.12, dh / 2, 0.06, false));
      g.add(hinge);
      g.add(box(dw + 0.5, 0.14, 0.5, mat(theme.snow), 0, 0.1, d / 2 + 0.28));
      var pool = mesh(new THREE.PlaneGeometry(3.2, 4.2), new THREE.MeshBasicMaterial({map: glowTex, color: theme.lit, transparent: true,
        opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false}), 0, 0.2, d / 2 + 1.5, false);
      pool.rotation.x = -Math.PI / 2; g.add(pool);

      /* the lantern by the door: lit when the door may open */
      g.add(box(0.05, 0.9, 0.05, mat(0x2a2a30), dw / 2 + 0.6, 0.6, d / 2 + 0.3));
      var lampM = new THREE.MeshBasicMaterial({color: 0x30344a});
      g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), lampM, dw / 2 + 0.6, 1.12, d / 2 + 0.3, false));
      var lampGlow = glow(0xffd66b, 1.1, 0); lampGlow.position.set(dw / 2 + 0.6, 1.12, d / 2 + 0.3); g.add(lampGlow);

      var b = badge(day, tone.getHex());
      b.position.set(0, h + rh + 1.05, 0);
      b.scale.set(1.3, 1.3, 1);
      g.add(b);
      redraw.push(function () { b.userData.draw(rec.state); });

      var hit = mesh(new THREE.BoxGeometry(w + 0.5, h + rh + 0.4, d + 0.9), new THREE.MeshBasicMaterial({visible: false}), 0, (h + rh) / 2, 0.2, false);
      hit.userData.day = day;
      g.add(hit);
      pickables.push(hit);

      g.scale.setScalar(scale);
      var rec = {day: day, group: g, village: v, hinge: hinge, win: winM, lamp: lampM, lampGlow: lampGlow, pool: pool, badge: b, scale: scale, state: 'locked', open: 0, openGoal: 0, shake: 0, h: (h + rh) * scale, d: d * scale};
      rec.light = function (st) {
        winM.color.setHex(st === 'open' ? theme.lit : theme.dark);
        lampM.color.setHex(st === 'locked' ? 0x30344a : 0xffe7a8);
        lampGlow.material.opacity = st === 'locked' ? 0 : 0.85 * theme.glowK;
        pool.material.opacity = st === 'open' ? 0.5 * theme.glowK : 0;
        if (held) held.light(st);
      };
      /* the door first; what is inside opens once the door is half-way */
      rec.move = function (open, rattle) {
        hinge.rotation.y = -open * 1.95 + rattle;
        if (held) held.move(Math.max(0, Math.min(1, (open - 0.45) * 2.2)));
      };
      houses[day] = rec;
      v.houses.push(rec);
      return rec;
    }

    /* --- what a house holds -------------------------------------------------------
     * One thing per village, taken from the week's theme, standing in the room
     * behind the door. A builder draws into `b`, front towards +z, at its own
     * scale (the house shrinks it to the room), and returns its size, how it
     * moves from closed (0) to open (1), and what changes with its state. */

    function drawn(w, h, paint) {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      paint(c.getContext('2d'), w, h);
      return new THREE.CanvasTexture(c);
    }
    var pageTex = drawn(128, 160, function (g, w, h) {
      g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3a3550'; g.fillRect(14, 16, 62, 9);
      g.fillStyle = '#b9b3c6';
      for (var y = 38; y < h - 16; y += 11) g.fillRect(14, y, y % 33 === 5 ? 64 : 100, 4);
      g.fillStyle = '#ffc15a'; g.fillRect(14, 82, 100, 8);
    });
    var screens = {};
    function screenTex(tone) {
      return screens[tone] || (screens[tone] = drawn(256, 170, function (g, w, h) {
        g.fillStyle = '#15121f'; g.fillRect(0, 0, w, h);
        g.strokeStyle = hex(tone); g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(22, 30); g.lineTo(38, 42); g.lineTo(22, 54); g.stroke();
        g.fillStyle = '#f4f1ff'; g.fillRect(54, 37, 96, 10);
        g.fillStyle = 'rgba(244,241,255,.5)';
        [[22, 76, 150], [22, 96, 196], [22, 116, 120]].forEach(function (r) { g.fillRect(r[0], r[1], r[2], 8); });
        g.fillStyle = hex(tone); g.fillRect(22, 140, 16, 10);
        g.strokeStyle = '#7dffb0'; g.beginPath(); g.moveTo(196, 124); g.lineTo(208, 136); g.lineTo(232, 110); g.stroke();
      }));
    }
    function dim(color, k) { return new THREE.Color(color).multiplyScalar(k); }
    var BRASS = {metal: 0.5, rough: 0.4};

    var THINGS = {
      /* documents: a file folder; its flap tips forward and a page comes up */
      folder: function (b, tone) {
        var back = box(2.2, 2.3, 0.1, mat(0xe8c98a, {own: 1}), 0, 1.33, -0.34); back.rotation.x = -0.1; b.add(back);
        var tab = box(0.8, 0.34, 0.1, mat(tone, {own: 2.2}), -0.5, 2.6, -0.46); tab.rotation.x = -0.1; b.add(tab);
        b.add(box(1.9, 1.9, 0.24, mat(0xfaf3e2, {own: 1}), 0, 1.15, -0.14));
        var sheetM = new THREE.MeshBasicMaterial({map: pageTex, color: 0x8a8fa8});
        var sheet = mesh(new THREE.BoxGeometry(1.7, 2.1, 0.04), sheetM, 0, 1.22, 0.02, false); b.add(sheet);
        var flap = new THREE.Group(); flap.position.set(0, 0.2, 0.16);
        flap.add(box(2.2, 2.0, 0.1, mat(0xd6ad62, {own: 1}), 0, 1.0, 0));
        flap.add(box(1.0, 0.5, 0.03, mat(0xfaf3e2, {own: 1}), 0, 1.25, 0.06));
        flap.add(box(2.2, 0.14, 0.12, mat(tone, {own: 2.2}), 0, 1.93, 0));
        b.add(flap);
        return {w: 2.2, h: 2.8, d: 0.9,
                move: function (o) { flap.rotation.x = o * 0.95; sheet.position.y = 1.22 + o * 1.3; },
                light: function (st) { sheetM.color.setHex(st === 'open' ? 0xffffff : 0x8a8fa8); }};
      },
      /* retrieval: a card catalogue; one drawer slides out, its index cards lit */
      drawer: function (b, tone) {
        var wood = 0x9a6542, wood2 = 0x74482e;
        b.add(box(2.4, 2.5, 1.7, mat(wood, {own: 1}), 0, 1.45, -0.1));
        b.add(box(2.6, 0.16, 1.9, mat(theme.snow), 0, 2.78, -0.1));
        [[-0.58, 2.2], [0.58, 2.2], [-0.58, 0.62], [0.58, 0.62]].forEach(function (q) {
          b.add(box(1.0, 0.55, 0.06, mat(wood2, {own: 1}), q[0], q[1], 0.77));
          b.add(box(0.3, 0.14, 0.05, mat(0xd9b45a, BRASS), q[0], q[1], 0.82));
        });
        b.add(mesh(new THREE.PlaneGeometry(2.1, 0.72), new THREE.MeshBasicMaterial({color: 0x1a110c}), 0, 1.41, 0.752, false));
        var dr = new THREE.Group(); dr.position.set(0, 1.41, 0);
        dr.add(box(2.1, 0.1, 1.5, mat(wood2), 0, -0.31, 0));
        dr.add(box(0.08, 0.6, 1.5, mat(wood2), -1.01, -0.04, 0)); dr.add(box(0.08, 0.6, 1.5, mat(wood2), 1.01, -0.04, 0));
        dr.add(box(2.14, 0.74, 0.1, mat(tone, {own: 2.2}), 0, 0, 0.78));
        dr.add(box(0.74, 0.3, 0.04, mat(0xfaf3e2, {own: 1}), 0, 0.1, 0.84));
        dr.add(box(0.4, 0.1, 0.1, mat(0xd9b45a, BRASS), 0, -0.22, 0.86));
        var cardM = new THREE.MeshBasicMaterial({color: 0x6f7390});
        for (var i = 0; i < 7; i++) {
          dr.add(mesh(new THREE.BoxGeometry(1.8, 0.6 + (i % 3) * 0.07, 0.04), cardM, 0, 0.04, -0.58 + i * 0.19, false));
        }
        var pick = mesh(new THREE.BoxGeometry(1.8, 0.86, 0.05), new THREE.MeshBasicMaterial({color: dim(tone, 0.5)}), 0, 0.14, 0.2, false);
        dr.add(pick); b.add(dr);
        return {w: 2.4, h: 2.86, d: 1.7,
                move: function (o) { dr.position.z = o * 1.3; pick.position.y = 0.14 + o * 0.22; },
                light: function (st) { cardM.color.setHex(st === 'open' ? 0xfff1c7 : 0x6f7390); pick.material.color.copy(dim(tone, st === 'open' ? 1 : 0.5)); }};
      },
      /* control: a console; the lever goes over and the signal turns green */
      panel: function (b, tone) {
        b.add(box(2.4, 1.3, 1.2, mat(0x4a4660, {own: 1}), 0, 0.85, 0));
        b.add(box(2.5, 0.14, 1.3, mat(0x2a2a36), 0, 1.57, 0));
        b.add(box(2.4, 1.5, 0.14, mat(0xe6e1f8, {own: 1}), 0, 2.36, -0.52));
        [-0.72, 0, 0.72].forEach(function (x, i) {
          b.add(mesh(new THREE.CircleGeometry(0.27, 18), new THREE.MeshBasicMaterial({color: 0xfff6dc}), x, 2.5, -0.44, false));
          var needle = mesh(new THREE.PlaneGeometry(0.05, 0.22), new THREE.MeshBasicMaterial({color: 0x241a4a}), x, 2.5, -0.435, false);
          needle.geometry.translate(0, 0.1, 0); needle.rotation.z = 0.9 - i * 0.8; b.add(needle);
        });
        b.add(box(0.9, 0.08, 0.5, mat(tone, {own: 2.2}), 0, 1.66, 0.2));
        var lever = new THREE.Group(); lever.position.set(0, 1.66, 0.2);
        lever.add(cyl(0.06, 0.06, 0.9, 8, mat(0xd9d2e6, BRASS), 0, 0.45, 0));
        lever.add(mesh(new THREE.SphereGeometry(0.18, 10, 8), mat(tone, {own: 2.4}), 0, 0.95, 0));
        b.add(lever);
        var sigM = new THREE.MeshBasicMaterial({color: 0xc23a4a});
        b.add(cyl(0.1, 0.1, 0.3, 8, mat(0x2a2a36), 0, 3.24, -0.52));
        b.add(mesh(new THREE.SphereGeometry(0.2, 10, 8), sigM, 0, 3.5, -0.52, false));
        return {w: 2.5, h: 3.7, d: 1.3,
                move: function (o) { lever.rotation.x = 0.75 - o * 1.5; },
                light: function (st) { sigM.color.setHex(st === 'open' ? 0x62e08a : st === 'ready' ? 0xffc24a : 0xc23a4a); }};
      },
      /* the process: a parcel on its stretch of conveyor; the lid lifts off */
      parcel: function (b, tone, day) {
        var paper = [0xd0453a, 0x2f8f6a, 0xf2e3bf][day % 3];
        b.add(box(2.7, 0.2, 2.3, mat(0x2a2a36), 0, 0.28, 0));
        for (var i = 0; i < 5; i++) { var r = cyl(0.1, 0.1, 2.3, 6, mat(0x8e9bc9, {metal: 0.4, rough: 0.5}), -1.1 + i * 0.55, 0.4, 0); r.rotation.x = Math.PI / 2; b.add(r); }
        b.add(box(2.0, 1.4, 2.0, mat(paper, {own: 1.4}), 0, 1.2, 0));
        b.add(box(2.04, 1.42, 0.3, mat(tone, {own: 2.2}), 0, 1.2, 0));
        b.add(box(0.3, 1.42, 2.04, mat(tone, {own: 2.2}), 0, 1.2, 0));
        var inM = new THREE.MeshBasicMaterial({map: glowTex, color: theme.lit, transparent: true, opacity: 0});
        var inside = mesh(new THREE.PlaneGeometry(1.9, 1.9), inM, 0, 1.92, 0, false); inside.rotation.x = -Math.PI / 2; b.add(inside);
        var lid = new THREE.Group(); lid.position.set(0, 1.9, 0);
        lid.add(box(2.2, 0.42, 2.2, mat(paper, {own: 1.4}), 0, 0.21, 0));
        lid.add(box(2.24, 0.44, 0.32, mat(tone, {own: 2.2}), 0, 0.21, 0));
        lid.add(box(0.32, 0.44, 2.24, mat(tone, {own: 2.2}), 0, 0.21, 0));
        [-1, 1].forEach(function (k) { var bow = mesh(new THREE.SphereGeometry(0.3, 8, 6), mat(tone, {own: 2.2}), k * 0.3, 0.6, 0); bow.scale.set(1.2, 0.6, 0.7); bow.rotation.z = k * 0.5; lid.add(bow); });
        b.add(lid);
        return {w: 2.4, h: 2.9, d: 2.0,
                move: function (o) { lid.position.set(o * 0.75, 1.9 + o * 1.05, -o * 0.2); lid.rotation.z = -o * 0.6; },
                light: function (st) { inM.opacity = st === 'open' ? 1 : 0; }};
      },
      /* words: an envelope under its wax seal; the flap lifts and the letter comes up */
      envelope: function (b, tone) {
        var g = new THREE.Group(); g.rotation.x = -0.1; b.add(g);
        b.add(box(2.2, 0.2, 1.0, mat(0x6b4a3a, {own: 1}), 0, 0.28, 0));
        g.add(box(2.7, 1.75, 0.08, mat(0xd9bb8c, {own: 1}), 0, 1.3, -0.1));
        var sheetM = new THREE.MeshBasicMaterial({map: pageTex, color: 0x8a8fa8});
        var letter = mesh(new THREE.BoxGeometry(2.3, 1.55, 0.04), sheetM, 0, 1.3, -0.02, false); g.add(letter);
        g.add(box(2.7, 1.2, 0.08, mat(0xe9cfa6, {own: 1}), 0, 1.02, 0.06));
        var flap = new THREE.Group(); flap.position.set(0, 2.17, 0.12);
        var tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.Float32BufferAttribute([-1.35, 0, 0, 0, -1.1, 0, 1.35, 0, 0], 3));
        tri.computeVertexNormals();
        var flapM = mat(dim(tone, 1).lerp(new THREE.Color(0xffffff), 0.45).getHex(), {own: 1.6}); flapM.side = THREE.DoubleSide;
        flap.add(mesh(tri, flapM, 0, 0, 0));
        var seal = cyl(0.24, 0.24, 0.08, 12, mat(tone, {own: 2.4}), 0, -0.86, 0.03); seal.rotation.x = Math.PI / 2; flap.add(seal);
        g.add(flap);
        return {w: 2.7, h: 2.5, d: 1.0,
                move: function (o) { flap.rotation.x = -o * 2.0; letter.position.y = 1.3 + o * 1.45; },
                light: function (st) { sheetM.color.setHex(st === 'open' ? 0xffffff : 0x8a8fa8); }};
      },
      /* proof: a specimen under glass; the bell jar lifts and one can look */
      cloche: function (b, tone) {
        b.add(cyl(1.0, 1.15, 0.5, 10, mat(0x8e8a9c, {own: 1}), 0, 0.45, 0));
        b.add(cyl(0.82, 1.0, 0.5, 10, mat(0xb9b5c6, {own: 1}), 0, 0.95, 0));
        b.add(cyl(1.06, 1.06, 0.1, 14, mat(tone, {own: 2}), 0, 1.25, 0));
        var gemM = new THREE.MeshBasicMaterial({color: dim(tone, 0.45)});
        var gem = mesh(new THREE.OctahedronGeometry(0.5), gemM, 0, 2.0, 0, false); gem.scale.y = 1.3; b.add(gem);
        spinners.push(function (t) { gem.rotation.y = t * 0.7; });
        var dome = new THREE.Group(); dome.position.set(0, 1.3, 0);
        var glassM = new THREE.MeshStandardMaterial({color: 0xd6ecff, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.1,
          side: THREE.DoubleSide, depthWrite: false});
        var shell = mesh(new THREE.SphereGeometry(1.0, 16, 8, 0, TAU, 0, Math.PI / 2), glassM, 0, 0, 0, false); shell.scale.y = 1.45; dome.add(shell);
        dome.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0xd9b45a, BRASS), 0, 1.5, 0, false));
        b.add(dome);
        return {w: 2.3, h: 3.0, d: 2.3,
                move: function (o) { dome.position.set(o * 0.55, 1.3 + o * 1.75, 0); dome.rotation.z = -o * 0.35; },
                light: function (st) { gemM.color.copy(dim(tone, st === 'open' ? 1 : 0.45)); }};
      },
      /* memory: a chest; the lid swings back on what was kept */
      chest: function (b, tone) {
        var wood = 0x9a6542;
        b.add(box(2.4, 1.2, 1.6, mat(wood, {own: 1}), 0, 0.8, 0));
        [-0.8, 0.8].forEach(function (x) { b.add(box(0.26, 1.24, 1.64, mat(tone, {own: 2.2}), x, 0.8, 0)); });
        b.add(box(0.36, 0.44, 0.08, mat(0xd9b45a, BRASS), 0, 1.2, 0.82));
        var inM = new THREE.MeshBasicMaterial({map: glowTex, color: theme.lit, transparent: true, opacity: 0});
        var inside = mesh(new THREE.PlaneGeometry(2.6, 1.9), inM, 0, 1.42, 0, false); inside.rotation.x = -Math.PI / 2; b.add(inside);
        var lid = new THREE.Group(); lid.position.set(0, 1.4, -0.8);
        var woodM = mat(wood, {own: 1}); woodM.side = THREE.DoubleSide;
        var arch = mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.4, 12, 1, false, 0, Math.PI), woodM, 0, 0, 0.8); arch.rotation.z = Math.PI / 2; lid.add(arch);
        [-0.8, 0.8].forEach(function (x) {
          var toneM = mat(tone, {own: 2.2}); toneM.side = THREE.DoubleSide;
          var band = mesh(new THREE.CylinderGeometry(0.83, 0.83, 0.26, 12, 1, false, 0, Math.PI), toneM, x, 0, 0.8); band.rotation.z = Math.PI / 2; lid.add(band);
        });
        b.add(lid);
        return {w: 2.4, h: 2.6, d: 1.6,
                move: function (o) { lid.rotation.x = -o * 1.25; },
                light: function (st) { inM.opacity = st === 'open' ? 1 : 0; }};
      },
      /* orchestration: a terminal; nothing opens, a session wakes up */
      terminal: function (b, tone) {
        b.add(box(1.6, 0.16, 1.0, mat(0x2a2a36), 0, 0.28, 0));
        b.add(box(0.3, 0.9, 0.2, mat(0x2a2a36), 0, 0.8, -0.1));
        var head = new THREE.Group(); head.position.set(0, 2.0, 0); head.rotation.x = -0.1;
        head.add(box(2.8, 1.95, 0.24, mat(0xe2dcf0, {own: 1}), 0, 0, 0));
        head.add(box(2.9, 0.14, 0.4, mat(theme.snow), 0, 1.04, 0));
        head.add(mesh(new THREE.PlaneGeometry(2.5, 1.66), new THREE.MeshBasicMaterial({color: 0x15121f}), 0, 0, 0.125, false));
        var litM = new THREE.MeshBasicMaterial({map: screenTex(tone), transparent: true, opacity: 0});
        head.add(mesh(new THREE.PlaneGeometry(2.5, 1.66), litM, 0, 0, 0.13, false));
        b.add(head);
        var keys = box(1.9, 0.1, 0.62, mat(0xe2dcf0, {own: 1}), 0, 0.3, 1.0); keys.rotation.x = 0.12; b.add(keys);
        return {w: 2.8, h: 3.1, d: 1.6,
                move: function (o) { litM.opacity = Math.min(1, o * 1.4); head.rotation.x = -0.1 - o * 0.06; },
                light: function () {}};
      }
    };

    /* --- the landmark of a village -------------------------------------------- */

    var LANDMARKS = {
      /* week 1: the stack of paper, with a lantern on top */
      library: function (g, tone) {
        var cols = [0xf6ead0, 0xe9d3a0, 0xfaf3e2, 0xdcc27e, 0xf2e3bf, 0xfaf3e2, 0xe9d3a0];
        var y = 0;
        cols.forEach(function (c, i) {
          var hh = 0.55 + (i % 3) * 0.18, b = box(4.2 - i * 0.22, hh, 3.1 - i * 0.12, mat(c), (i % 2 ? 0.18 : -0.14), y + hh / 2, 0);
          b.rotation.y = (i % 2 ? 0.12 : -0.09) * (1 + i * 0.2);
          g.add(b); y += hh;
        });
        g.add(box(0.5, 0.9, 0.5, mat(0x3a2a22), 0, y + 0.45, 0));
        g.add(mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({color: tone}), 0, y + 1.25, 0, false));
        var gl = glow(tone, 7, 0.75); gl.position.set(0, y + 1.25, 0); g.add(gl);
        return y + 2.2;
      },
      /* week 2: the lighthouse that searches */
      lighthouse: function (g, tone) {
        g.add(cyl(1.5, 1.9, 0.8, 10, mat(theme.snow), 0, 0.4, 0));
        for (var i = 0; i < 5; i++) {
          g.add(cyl(1.25 - i * 0.14 - 0.14, 1.25 - i * 0.14, 1.3, 10, mat(i % 2 ? 0xfaf3fb : tone), 0, 0.8 + 0.65 + i * 1.3, 0));
        }
        g.add(cyl(0.95, 0.95, 0.16, 10, mat(0x2a2030), 0, 7.38, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 10), new THREE.MeshBasicMaterial({color: 0xfff1c7}), 0, 7.86, 0, false));
        g.add(mesh(new THREE.ConeGeometry(0.82, 0.8, 10), mat(tone), 0, 8.66, 0));
        var beam = new THREE.Group(); beam.position.set(0, 7.86, 0);
        [0, Math.PI].forEach(function (r) {
          var c = mesh(new THREE.ConeGeometry(1.0, 11, 14, 1, true), new THREE.MeshBasicMaterial({color: 0xfff1c7, transparent: true,
            opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide}), 0, 0, 0, false);
          c.rotation.z = Math.PI / 2; c.position.x = -5.5;
          var arm = new THREE.Group(); arm.rotation.y = r; arm.add(c); beam.add(arm);
        });
        g.add(beam); spinners.push(function (t) { beam.rotation.y = t * 0.6; });
        var gl = glow(0xfff1c7, 6, 0.8); gl.position.set(0, 7.86, 0); g.add(gl);
        return 9.6;
      },
      /* week 3: the clock tower, and the gear that turns under control */
      clock: function (g, tone) {
        g.add(box(2.6, 6.2, 2.6, mat(0xd9d2f2), 0, 3.1, 0));
        g.add(box(3.0, 0.3, 3.0, mat(theme.snow), 0, 6.35, 0));
        var roof = mesh(new THREE.ConeGeometry(2.2, 2.2, 4), mat(tone), 0, 7.6, 0); roof.rotation.y = Math.PI / 4; g.add(roof);
        var cap = mesh(new THREE.ConeGeometry(1.2, 1.2, 4), mat(theme.snow), 0, 8.2, 0, false); cap.rotation.y = Math.PI / 4; g.add(cap);
        [0, 1, 2, 3].forEach(function (k) {
          var side = new THREE.Group(); side.rotation.y = k * Math.PI / 2;
          side.add(mesh(new THREE.CircleGeometry(0.95, 24), new THREE.MeshBasicMaterial({color: 0xfff6dc}), 0, 4.7, 1.32, false));
          var ring = mesh(new THREE.RingGeometry(0.95, 1.1, 24), mat(0x3a2f66), 0, 4.7, 1.325, false); side.add(ring);
          var hh = new THREE.Group(); hh.position.set(0, 4.7, 1.34);
          hh.add(mesh(new THREE.PlaneGeometry(0.1, 0.55), new THREE.MeshBasicMaterial({color: 0x241a4a}), 0, 0.27, 0, false));
          var mh = new THREE.Group(); mh.position.set(0, 4.7, 1.345);
          mh.add(mesh(new THREE.PlaneGeometry(0.07, 0.82), new THREE.MeshBasicMaterial({color: 0x241a4a}), 0, 0.41, 0, false));
          side.add(hh); side.add(mh);
          spinners.push(function (t) { mh.rotation.z = -t * 0.5; hh.rotation.z = -t * 0.5 / 12; });
          g.add(side);
        });
        var gear = new THREE.Group(); gear.position.set(2.5, 1.5, 1.2);
        gear.add(mesh(new THREE.TorusGeometry(1.0, 0.24, 6, 14), mat(tone, {metal: 0.5, rough: 0.4}), 0, 0, 0));
        for (var i = 0; i < 10; i++) {
          var tooth = box(0.3, 0.42, 0.42, mat(tone, {metal: 0.5, rough: 0.4}), Math.cos(i * TAU / 10) * 1.3, Math.sin(i * TAU / 10) * 1.3, 0);
          tooth.rotation.z = i * TAU / 10 + Math.PI / 2; gear.add(tooth);
        }
        var axle = cyl(0.22, 0.22, 0.6, 8, mat(0x2a2030), 0, 0, 0); axle.rotation.x = Math.PI / 2; gear.add(axle);
        g.add(gear); spinners.push(function (t) { gear.rotation.z = t * 0.5; });
        return 9.2;
      },
      /* week 4: the station, and the train that takes a case from step to step */
      station: function (g, tone) {
        g.add(box(5.4, 2.2, 2.6, mat(0xe2f0c8), 0, 1.1, 0));
        var arch = mesh(new THREE.CylinderGeometry(1.5, 1.5, 5.8, 14, 1, false, 0, Math.PI), mat(tone), 0, 2.2, 0);
        arch.rotation.z = Math.PI / 2; arch.rotation.y = Math.PI / 2; g.add(arch);
        var snowArch = mesh(new THREE.CylinderGeometry(1.56, 1.56, 5.6, 14, 1, true, Math.PI * 0.28, Math.PI * 0.44), mat(theme.snow), 0, 2.2, 0, false);
        snowArch.rotation.z = Math.PI / 2; snowArch.rotation.y = Math.PI / 2; g.add(snowArch);
        g.add(box(1.0, 4.4, 1.0, mat(0xd2e6ae), 0, 2.2, -1.2));
        [-2.0, -1.0, 1.0, 2.0].forEach(function (x) {
          g.add(mesh(new THREE.PlaneGeometry(0.5, 0.9), new THREE.MeshBasicMaterial({color: theme.lit}), x, 1.15, 1.31, false));
        });
        g.add(mesh(new THREE.PlaneGeometry(0.9, 1.4), new THREE.MeshBasicMaterial({color: 0x2a2030}), 0, 0.7, 1.31, false));
        g.add(mesh(new THREE.CircleGeometry(0.4, 16), new THREE.MeshBasicMaterial({color: 0xfff6dc}), 0, 3.9, -0.69, false));
        var ring = mesh(new THREE.TorusGeometry(4.6, 0.07, 5, 48), mat(0x3a3a44), 0, 0.12, 0, false); ring.rotation.x = Math.PI / 2; g.add(ring);
        var train = new THREE.Group();
        [[0, 0xd0453a, 0.9], [-0.25, tone, 0.75], [-0.48, 0xf6c85f, 0.75]].forEach(function (c, i) {
          var car = new THREE.Group(); car.rotation.y = -c[0];
          var body = box(0.62, i ? 0.5 : 0.62, c[2], mat(c[1]), 4.6, i ? 0.45 : 0.5, 0); car.add(body);
          if (!i) { car.add(cyl(0.12, 0.16, 0.4, 7, mat(0x22222a), 4.6, 1.0, 0.2)); }
          train.add(car);
        });
        var lampT = glow(0xfff1c7, 1.6, 0.9); lampT.position.set(4.6, 0.6, 0.6); train.add(lampT);
        g.add(train); spinners.push(function (t) { train.rotation.y = -t * 0.45; });
        return 5.6;
      },
      /* the other calendar. week 1: the inkwell and the quill */
      quill: function (g, tone) {
        g.add(cyl(1.9, 2.2, 0.5, 10, mat(theme.snow), 0, 0.25, 0));
        g.add(cyl(1.3, 1.7, 2.0, 8, mat(0x2b2440, {rough: 0.35, metal: 0.3}), 0, 1.5, 0));
        g.add(cyl(0.95, 1.3, 0.5, 8, mat(0x2b2440, {rough: 0.35, metal: 0.3}), 0, 2.75, 0));
        var ink = mesh(new THREE.CircleGeometry(0.8, 16), new THREE.MeshBasicMaterial({color: 0x0c0a18}), 0, 3.01, 0, false);
        ink.rotation.x = -Math.PI / 2; g.add(ink);
        var quill = new THREE.Group(); quill.position.set(0.2, 2.9, 0); quill.rotation.z = -0.42; quill.rotation.y = 0.5;
        quill.add(cyl(0.05, 0.09, 6.4, 6, mat(0xfff6ee), 0, 3.2, 0));
        var feather = mesh(new THREE.SphereGeometry(1, 10, 8), mat(tone), 0, 4.5, 0);
        feather.scale.set(0.95, 2.4, 0.12); quill.add(feather);
        var tip = mesh(new THREE.SphereGeometry(1, 10, 8), mat(0xfff1e4), 0, 5.4, 0.02, false);
        tip.scale.set(0.6, 1.5, 0.1); quill.add(tip);
        g.add(quill); spinners.push(function (t) { quill.rotation.z = -0.42 + Math.sin(t * 0.9) * 0.05; });
        return 8.6;
      },
      /* week 2: the observatory that looks before it believes */
      observatory: function (g, tone) {
        g.add(cyl(2.4, 2.6, 2.6, 12, mat(0xdfe9f6), 0, 1.3, 0));
        g.add(cyl(2.55, 2.55, 0.25, 12, mat(theme.snow), 0, 2.72, 0));
        var dome = new THREE.Group(); dome.position.set(0, 2.85, 0);
        dome.add(mesh(new THREE.SphereGeometry(2.25, 14, 8, 0, TAU, 0, Math.PI / 2), mat(tone, {rough: 0.5, metal: 0.2}), 0, 0, 0));
        dome.add(mesh(new THREE.SphereGeometry(2.28, 14, 8, -0.22, 0.44, 0.1, Math.PI / 2 - 0.1), new THREE.MeshBasicMaterial({color: 0x0c1226}), 0, 0, 0, false));
        var tube = cyl(0.3, 0.42, 3.4, 10, mat(0xf1f4fa, {metal: 0.3, rough: 0.4}), 0, 1.5, 1.5); tube.rotation.x = 0.9; dome.add(tube);
        var lens = mesh(new THREE.CircleGeometry(0.3, 12), new THREE.MeshBasicMaterial({color: 0xbfe6ff}), 0, 2.56, 2.84, false); lens.rotation.x = 0.9 - Math.PI / 2; dome.add(lens);
        g.add(dome); spinners.push(function (t) { dome.rotation.y = Math.sin(t * 0.25) * 0.9; });
        return 6.4;
      },
      /* week 3: the granaries, where what was learnt is kept */
      silo: function (g, tone) {
        [[-1.9, 4.6, 1.3], [0.4, 6.0, 1.5], [2.6, 3.8, 1.15]].forEach(function (s, i) {
          g.add(cyl(s[2], s[2], s[1], 12, mat(i === 1 ? 0xf3e7c4 : 0xe9d8a4), s[0], s[1] / 2, i === 1 ? 0 : 0.5));
          g.add(mesh(new THREE.ConeGeometry(s[2] + 0.15, 1.3, 12), mat(tone), s[0], s[1] + 0.65, i === 1 ? 0 : 0.5));
          g.add(mesh(new THREE.ConeGeometry((s[2] + 0.15) * 0.56, 0.74, 12), mat(theme.snow), s[0], s[1] + 0.96, i === 1 ? 0 : 0.5, false));
          for (var k = 0; k < 3; k++) {
            if (s[1] < 1.6 + k * 1.4) break;
            g.add(mesh(new THREE.PlaneGeometry(0.34, 0.42), new THREE.MeshBasicMaterial({color: theme.lit}), s[0], 1.3 + k * 1.4, (i === 1 ? 0 : 0.5) + s[2] + 0.01, false));
          }
        });
        g.add(box(1.2, 0.2, 0.5, mat(0x6b4a3a), -0.75, 3.3, 0.3));
        return 7.6;
      },
      /* week 4: the pyramid of sessions, one coordinator at the top */
      pyramid: function (g, tone) {
        var y = 0;
        [[5.6, 1.1, 0xb79ad6], [4.3, 1.1, 0x9a78c4], [3.0, 1.1, 0xb79ad6], [1.7, 1.1, 0x9a78c4]].forEach(function (s) {
          g.add(box(s[0], s[1], s[0], mat(s[2]), 0, y + s[1] / 2, 0));
          g.add(box(s[0] + 0.12, 0.12, s[0] + 0.12, mat(theme.snow), 0, y + s[1] + 0.06, 0));
          y += s[1] + 0.12;
        });
        g.add(mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshBasicMaterial({color: tone}), 0, y + 0.9, 0, false));
        var gl = glow(tone, 6.5, 0.85); gl.position.set(0, y + 0.9, 0); g.add(gl);
        [[3.4, 0.9, 5, 0.5], [2.6, 2.1, 3, -0.7], [1.9, 3.3, 2, 0.9]].forEach(function (o) {
          var orbit = new THREE.Group();
          for (var i = 0; i < o[2]; i++) {
            var a = i * TAU / o[2];
            orbit.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({color: 0xfff1c7}), Math.cos(a) * o[0] * 1.15, o[1], Math.sin(a) * o[0] * 1.15, false));
          }
          g.add(orbit); spinners.push(function (t) { orbit.rotation.y = t * o[3]; });
        });
        return y + 2.2;
      }
    };

    /* --- the villages ---------------------------------------------------------- */

    var labels = [];
    var stones = [], posts = [];
    villages.forEach(function (v) {
      var tone = toneOf(v.def).getHex();
      v.plots.forEach(function (pl) {
        var rec = house(pl.day, v, pl.big);
        rec.group.position.set(pl.x, heightAt(pl.x, pl.z), pl.z);
        rec.face = pl.face;
        rec.group.rotation.y = Math.PI / 2 - rec.face;
        island.add(rec.group);
      });
      var lm = new THREE.Group();
      var top = (LANDMARKS[v.def.landmark] || LANDMARKS.library)(lm, tone) * 1.15;
      var lx = v.x - Math.cos(v.a) * 0.4, lz = v.z - Math.sin(v.a) * 0.4;
      lm.position.set(lx, 0, lz);
      lm.scale.setScalar(1.15);
      lm.rotation.y = Math.PI / 2 - v.a;
      island.add(lm);
      var lamp = new THREE.PointLight(tone, theme.lampI, 20, 2);
      lamp.position.set(lx + Math.cos(v.a) * 3, 4.2, lz + Math.sin(v.a) * 3);
      island.add(lamp);
      var hit = mesh(new THREE.CylinderGeometry(3.6, 3.6, top, 8), new THREE.MeshBasicMaterial({visible: false}), lx, top / 2, lz, false);
      hit.userData.village = v.i;
      island.add(hit); pickables.push(hit);

      var el = document.createElement('button');
      el.type = 'button'; el.className = 'monde-label';
      el.style.setProperty('--tone', v.def.tone);
      var small = document.createElement('small'); small.textContent = page.tx(v.def.sub);
      var strong = document.createElement('b'); strong.textContent = page.tx(v.def.name);
      el.appendChild(small); el.appendChild(strong);
      el.addEventListener('click', function () { toVillage(v.i); });
      host.appendChild(el);
      labels.push({el: el, at: new THREE.Vector3(v.x + Math.cos(v.a) * 5, top + 1.2, v.z + Math.sin(v.a) * 5), village: v.i});

      /* stepping stones from the lake to the village, and two lanterns on the way */
      for (var r = 7.6; r < VR - 4.4; r += 1.15) {
        var side = Math.sin(r * 1.3) * 0.55;
        stones.push([Math.cos(v.a) * r - Math.sin(v.a) * side, Math.sin(v.a) * r + Math.cos(v.a) * side, 0.34 + rnd() * 0.14]);
      }
      [[8.6, 1.5], [11.4, -1.5]].forEach(function (q) {
        posts.push([Math.cos(v.a) * q[0] - Math.sin(v.a) * q[1], Math.sin(v.a) * q[0] + Math.cos(v.a) * q[1]]);
      });
    });
    (function ways() {
      var im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.1, 0.12, 7), mat(theme.stone), stones.length);
      var m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), at = new THREE.Vector3();
      stones.forEach(function (t, i) {
        im.setMatrixAt(i, m.compose(at.set(t[0], heightAt(t[0], t[1]) + 0.05, t[1]), q, sc.set(t[2], 1, t[2] * 0.8)));
      });
      im.receiveShadow = true; island.add(im);
      posts.forEach(function (t) {
        var y = heightAt(t[0], t[1]);
        island.add(cyl(0.06, 0.08, 1.7, 5, mat(0x23232c), t[0], y + 0.85, t[1]));
        island.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({color: 0xffe2a0}), t[0], y + 1.82, t[1], false));
        var gl = glow(theme.lit, 3.6, 0.7); gl.position.set(t[0], y + 1.82, t[1]); island.add(gl);
      });
    })();
    var heart = new THREE.PointLight(theme.glowTree, theme.lampI, 22, 2);
    heart.position.set(0, 2.6, 0);
    island.add(heart);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { redraw.forEach(function (f) { f(); }); });
    }

    /* --- the snow that falls ----------------------------------------------------- */

    var flakes = null;
    if (!reduced) {
      var N = 1400, fp = new Float32Array(N * 3), fv = new Float32Array(N);
      for (var i = 0; i < N; i++) {
        var a = rnd() * TAU, r = Math.sqrt(rnd()) * 44;
        fp[i * 3] = Math.cos(a) * r; fp[i * 3 + 1] = rnd() * 40 - 6; fp[i * 3 + 2] = Math.sin(a) * r;
        fv[i] = 1.2 + rnd() * 2.2;
      }
      var fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
      flakes = new THREE.Points(fg, new THREE.PointsMaterial({color: theme.flake, size: 0.32, map: glowTex, transparent: true,
        opacity: 0.85, depthWrite: false, sizeAttenuation: true}));
      flakes.userData = {v: fv};
      scene.add(flakes);
    }

    /* --- states ------------------------------------------------------------------ */

    function paint() {
      var opened = 0;
      for (var d = 1; d <= 24; d++) {
        var rec = houses[d];
        if (!rec) continue;
        var st = page.state(d);
        if (st === 'open') opened++;
        if (st !== rec.state || !rec.painted) {
          rec.state = st; rec.painted = true;
          rec.badge.userData.draw(st);
          rec.light(st);
          rec.openGoal = st === 'open' ? 1 : 0;
          var b = bulbs[d], tone = toneOf(rec.village.def);
          if (b) {
            b.mesh.material.color.copy(st === 'open' ? tone : new THREE.Color(0x2a3350));
            b.glow.material.color.copy(tone);
            b.glow.material.opacity = st === 'open' ? 0.9 * Math.max(0.6, theme.glowK) : 0;
          }
        }
      }
      star.material.color.setHex(opened >= 24 ? 0xfff1a8 : opened ? 0xd9b24e : 0x6b5a2a);
      starGlow.material.opacity = opened >= 24 ? 1 : opened ? 0.25 + 0.5 * opened / 24 : 0;
    }

    /* --- the camera: a point looked at, an angle around it, a distance ----------- */

    var OVER = {t: [0, -3, 0], pol: 1.1, dist: 94};
    var cam = {t: new THREE.Vector3(0, -3, 0), az: Math.PI / 4 + 0.5, pol: 1.1, dist: 94};
    var goal = {t: new THREE.Vector3(0, -3, 0), az: cam.az, pol: 1.1, dist: 94};
    var mode = {kind: 'over', village: -1, day: 0};
    var lastTouch = 0;

    function fit() {
      var w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      /* a narrow screen sees the same island from further away */
      camera.fov = w / h < 0.9 ? 58 : w / h < 1.4 ? 44 : 36;
      camera.updateProjectionMatrix();
      labels.forEach(function (l) { l.half = 0; });
    }
    function near(a, b) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return a + d; }
    function fly(to, instant) {
      goal.t.set(to.t[0], to.t[1], to.t[2]);
      goal.pol = to.pol; goal.dist = to.dist;
      if (to.az != null) goal.az = near(cam.az, to.az);
      if (instant || reduced) { cam.t.copy(goal.t); cam.az = goal.az; cam.pol = goal.pol; cam.dist = goal.dist; }
    }
    function overview() {
      mode = {kind: 'over', village: -1, day: 0};
      host.setAttribute('data-mode', 'over');
      fly(OVER);
      chips();
    }
    function toVillage(i) {
      var v = villages[i];
      mode = {kind: 'village', village: i, day: 0};
      host.setAttribute('data-mode', 'village');
      fly({t: [v.x * 1.04, 2.4, v.z * 1.04], az: v.a, pol: 1.08, dist: camera.aspect < 0.9 ? 50 : 38});
      chips();
    }
    function toHouse(day) {
      var rec = houses[day];
      var p = rec.group.position;
      mode = {kind: 'house', village: rec.village.i, day: day};
      host.setAttribute('data-mode', 'house');
      fly({t: [p.x, p.y + rec.h * 0.6, p.z], az: rec.face, pol: 1.27, dist: (camera.aspect < 0.9 ? 17 : 12.5) * (rec.h > 5 ? 1.25 : 1)});
      chips();
    }

    /* through the doorway: close enough to see what the room holds */
    function peek(day) {
      var rec = houses[day], p = rec.group.position, k = rec.scale, out = rec.d / 2;
      mode = {kind: 'house', village: rec.village.i, day: day};
      host.setAttribute('data-mode', 'house');
      fly({t: [p.x + Math.cos(rec.face) * out, p.y + 0.82 * k, p.z + Math.sin(rec.face) * out], az: rec.face, pol: 1.36,
           dist: (camera.aspect < 0.9 ? 6.2 : 4.3) * k});
      chips();
    }

    /* a click on a house: fly to it, then knock */
    var pending = null;
    function knock(day) {
      var rec = houses[day];
      toHouse(day);
      clearTimeout(pending);
      pending = setTimeout(function () {
        var st = page.state(day);
        if (st === 'locked') { rec.shake = 1; page.refuse(day); return; }
        if (st === 'ready') page.mark(day);
        paint();
        setTimeout(function () { peek(day); }, reduced ? 0 : 350);
        setTimeout(function () { page.enter(day); }, reduced ? 0 : 2300);
      }, reduced ? 0 : 900);
    }

    /* --- the pointer -------------------------------------------------------------- */

    var ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    var drag = null, hoverDay = 0;
    function pick(e) {
      var r = canvas.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      var hits = ray.intersectObjects(pickables, false);
      return hits.length ? hits[0].object.userData : null;
    }
    canvas.addEventListener('pointerdown', function (e) {
      drag = {x: e.clientX, y: e.clientY, moved: 0, az: goal.az, pol: goal.pol, id: e.pointerId, touch: e.pointerType === 'touch', held: false};
      lastTouch = performance.now();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (drag) {
        var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        /* a vertical swipe on a phone scrolls the page; a horizontal one turns the island */
        if (drag.touch && !drag.held && Math.abs(dy) > Math.abs(dx) * 1.3) return;
        if (drag.moved > 6) {
          if (!drag.held) { drag.held = true; try { canvas.setPointerCapture(drag.id); } catch (err) {} }
          goal.az = drag.az + dx * 0.006;
          goal.pol = Math.max(0.55, Math.min(1.45, drag.pol - dy * 0.004));
          canvas.style.cursor = 'grabbing';
        }
        lastTouch = performance.now();
        return;
      }
      var hit = pick(e);
      hoverDay = hit && hit.day ? hit.day : 0;
      canvas.style.cursor = hit ? 'pointer' : 'grab';
    });
    function release(e) {
      if (!drag) return;
      var wasClick = drag.moved <= 6;
      drag = null;
      canvas.style.cursor = 'grab';
      if (!wasClick) return;
      var hit = pick(e);
      if (!hit) { if (mode.kind !== 'over') overview(); return; }
      if (hit.day) knock(hit.day);
      else if (hit.village != null) toVillage(hit.village);
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', function () { drag = null; });
    canvas.addEventListener('pointerleave', function () { hoverDay = 0; });

    /* --- the chips over the canvas: where to fly ------------------------------------ */

    var bar = document.createElement('div');
    bar.className = 'monde-bar';
    host.appendChild(bar);
    var chipEls = [];
    function chip(text, tone, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'monde-chip'; b.textContent = text;
      if (tone) b.style.setProperty('--tone', tone);
      b.addEventListener('click', fn);
      bar.appendChild(b); chipEls.push(b);
      return b;
    }
    chip(page.say('overview'), '', overview);
    villages.forEach(function (v) { chip(page.tx(v.def.name), v.def.tone, function () { toVillage(v.i); }); });
    function chips() {
      chipEls.forEach(function (b, i) {
        var on = i === 0 ? mode.kind === 'over' : mode.village === i - 1;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    var hint = document.createElement('p');
    hint.className = 'monde-hint';
    hint.textContent = page.say('hint');
    bar.insertBefore(hint, bar.firstChild);

    /* --- the loop ------------------------------------------------------------------ */

    var running = false, visible = true, paused = false, raf = 0, last = 0, clock = 0;
    function frame(now) {
      raf = 0;
      if (!running) return;
      var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now; clock += dt;

      if (mode.kind === 'over' && !drag && !reduced && now - lastTouch > 2500) goal.az += dt * 0.045;
      var k = 1 - Math.exp(-dt * 3.2);
      cam.t.lerp(goal.t, k);
      cam.az += (goal.az - cam.az) * k; cam.pol += (goal.pol - cam.pol) * k; cam.dist += (goal.dist - cam.dist) * k;
      var sp = Math.sin(cam.pol);
      camera.position.set(cam.t.x + cam.dist * sp * Math.cos(cam.az), cam.t.y + cam.dist * Math.cos(cam.pol),
                          cam.t.z + cam.dist * sp * Math.sin(cam.az));
      camera.lookAt(cam.t);

      island.position.y = reduced ? 0 : Math.sin(clock * 0.5) * 0.35;
      spinners.forEach(function (f) { f(clock); });
      for (var d = 1; d <= 24; d++) {
        var rec = houses[d];
        if (!rec) continue;
        rec.open += (rec.openGoal - rec.open) * (1 - Math.exp(-dt * 3.5));
        var rattle = 0;
        if (rec.shake > 0) { rec.shake = Math.max(0, rec.shake - dt * 1.8); rattle = Math.sin(rec.shake * 30) * 0.16 * rec.shake; }
        rec.move(rec.open, rattle);
        var pulse = rec.state === 'ready' ? 1.3 + Math.sin(clock * 3 + d) * 0.12 : 1.3;
        var s = pulse * (hoverDay === d ? 1.18 : 1) * (mode.kind === 'over' ? 1.5 : mode.kind === 'house' ? (mode.day === d ? 0.85 : 0.6) : 1);
        rec.badge.scale.set(s, s, 1);
      }
      star.rotation.y = clock * 0.8;
      if (flakes) {
        var p = flakes.geometry.attributes.position, v = flakes.userData.v;
        for (var i = 0; i < v.length; i++) {
          var y = p.array[i * 3 + 1] - v[i] * dt;
          p.array[i * 3] += Math.sin(clock * 0.7 + i) * dt * 0.5;
          p.array[i * 3 + 1] = y < -8 ? 34 : y;
        }
        p.needsUpdate = true;
      }
      renderer.render(scene, camera);
      place();
      raf = requestAnimationFrame(frame);
    }
    var spot = new THREE.Vector3();
    function place() {
      var w = host.clientWidth, h = host.clientHeight;
      labels.forEach(function (l) {
        spot.copy(l.at); island.localToWorld(spot); spot.project(camera);
        var show = spot.z < 1 && (mode.kind === 'over' || (mode.kind === 'village' && mode.village === l.village));
        l.el.classList.toggle('off', !show);
        if (!show) return;
        var half = (l.half || (l.half = l.el.offsetWidth / 2)) + 8;
        var x = Math.max(half, Math.min(w - half, (spot.x + 1) / 2 * w)), y = Math.max(64, (1 - spot.y) / 2 * h);
        if (mode.kind === 'village') { x = w / 2; y = 86; }
        l.el.style.transform = 'translate(-50%, -100%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      });
    }
    function sync() {
      var should = visible && !paused && !document.hidden;
      if (should && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
      else if (!should) { running = false; }
    }
    if (global.IntersectionObserver) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; sync(); }, {threshold: 0.02}).observe(host);
    }
    document.addEventListener('visibilitychange', sync);
    global.addEventListener('resize', fit);
    if (global.ResizeObserver) new ResizeObserver(fit).observe(host);

    host.setAttribute('data-mode', 'over');
    fit();
    paint();
    chips();
    canvas.style.cursor = 'grab';
    fly(OVER, true);
    sync();

    return {
      paint: paint,
      pause: function (on) { paused = on; sync(); },
      /* the stage closed: step back to the village the reader was in */
      back: function () { if (mode.kind === 'house') toVillage(mode.village); },
      overview: overview, village: toVillage, house: toHouse, peek: peek, knock: knock,
      /* the calls every scene offers (see apercu_du_monde.js) */
      views: function () { return ['ile', 'village1', 'village2', 'village3', 'village4']; },
      view: function (name) { if (name === 'ile') overview(); else toVillage(Number(name.slice(-1)) - 1); },
      look: peek,
      /* for the captures: put the camera where it is going, and draw once */
      settle: function () {
        cam.t.copy(goal.t); cam.az = goal.az; cam.pol = goal.pol; cam.dist = goal.dist;
        for (var d = 1; d <= 24; d++) if (houses[d]) houses[d].open = houses[d].openGoal;
        island.updateMatrixWorld(true);
      }
    };
  }

  global.Monde3D = {mount: mount};
})(window);
