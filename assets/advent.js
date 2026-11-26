/* Advent calendar: the night, the doors, and what is behind them.
 *
 * A closed door shows its number and nothing else: the calendar is a surprise
 * (the author, 19-11), so a door's title enters the page only once its date has
 * come. An open door keeps a poster, the end state of its scene drawn once, so
 * twenty-four open doors still cost one running timeline: the one on the stage.
 *
 * Behind a door, the stage plays the scene, then reveals the article: its
 * title, what it settles, its first lines, and the link once it is published.
 *
 * Passes for the author: `?all=1` opens every door, `?jour=7` plays the page
 * as if it were December 7.
 */
(function () {
  'use strict';

  var data = JSON.parse(document.getElementById('advent-data').textContent);
  var lang = document.documentElement.lang === 'fr' ? 'fr' : 'en';
  document.body.classList.remove('lang-fr', 'lang-en');
  document.body.classList.add('lang-' + lang);
  var byDay = {};
  data.days.forEach(function (d) { byDay[d.day] = d; });
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tx(value) {
    return typeof value === 'string' ? value : (value && (value[lang] || value.en)) || '';
  }

  var T = {
    month: {en: 'December', fr: 'décembre'},
    open: {en: 'Open door ', fr: 'Ouvrir la porte '},
    today: {en: 'today', fr: "aujourd'hui"},
    soon: {en: function (n) { return n === 1 ? 'The first door opens tomorrow' : 'The first door opens in ' + n + ' days'; },
           fr: function (n) { return n === 1 ? 'La première porte s\'ouvre demain' : 'La première porte s\'ouvre dans ' + n + ' jours'; }},
    peeking: {en: 'Preview: every door is unlocked', fr: 'Aperçu : toutes les portes sont déverrouillées'},
    todayIs: {en: function (n) { return 'Today: door ' + n; }, fr: function (n) { return 'Aujourd\'hui : porte ' + n; }},
    allOpen: {en: 'All twenty-four doors are open', fr: 'Les vingt-quatre portes sont ouvertes'},
    opened: {en: function (n) { return n + ' / 24 opened'; }, fr: function (n) { return n + ' / 24 ouvertes'; }},
    wait: {en: function (d, n) { return 'Patience: this door opens on December ' + d + (n > 0 ? ', in ' + n + (n === 1 ? ' day.' : ' days.') : '.'); },
           fr: function (d, n) { return 'Patience : cette porte s\'ouvre le ' + d + ' décembre' + (n > 0 ? ', dans ' + n + (n === 1 ? ' jour.' : ' jours.') : '.'); }},
    door: {en: function (d) { return 'December ' + d; }, fr: function (d) { return d + ' décembre'; }},
    overview: {en: 'The island', fr: "L'île"},
    hint: {en: 'drag to turn · click a village · click a door', fr: 'glisser pour tourner · cliquer un village · cliquer une porte'},
    week: {en: 'week', fr: 'semaine'},
    replay: {en: 'Replay', fr: 'Rejouer'},
    first: {en: 'Read the first lines', fr: 'Lire les premières lignes'},
    firstEn: {en: 'Read the first lines', fr: 'Lire les premières lignes (en anglais)'},
    readOn: {en: function (p) { return 'Read it on ' + p; }, fr: function (p) { return 'Le lire sur ' + p; }},
    comes: {en: function (d) { return 'The full article comes out on December ' + d + '.'; },
            fr: function (d) { return 'L\'article complet paraît le ' + d + ' décembre.'; }}
  };
  function say(key) { var v = T[key][lang]; return typeof v === 'function' ? v.apply(null, [].slice.call(arguments, 1)) : v; }

  var STORE = 'edi-advent-opened';
  var PEEK = 'edi-advent-peek';
  function stored(key, fallback) {
    try { var v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  }
  function remember(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }

  var params = new URLSearchParams(location.search);
  // A public build (build.py --jour N) carries the days up to N only: nothing to peek at,
  // and a door past N stays shut whatever the clock or the address say.
  var peeking = !data.public && (params.has('all') || stored(PEEK, false) === true);

  /* --- what today unlocks ------------------------------------------------ */

  function today() {
    var forced = parseInt(params.get('jour') || params.get('day') || '', 10);
    if (forced >= 0 && forced <= 25) return {unlocked: Math.min(24, forced), daysLeft: forced ? 0 : 1};
    var now = new Date();
    var first = new Date(data.year, data.month - 1, 1);
    if (now < first) return {unlocked: 0, daysLeft: Math.ceil((first - now) / 864e5)};
    if (now.getFullYear() > data.year || now.getMonth() + 1 > data.month) return {unlocked: 24, daysLeft: 0};
    return {unlocked: Math.min(24, now.getDate()), daysLeft: 0};
  }
  var NOW = today();
  if (data.public && NOW.unlocked > data.upto) NOW.unlocked = data.upto;  // a page a day behind the clock
  function isOpenable(day) {
    if (data.public && day > data.upto) return false;
    return peeking || day <= NOW.unlocked;
  }

  /* --- the doors --------------------------------------------------------- */

  var LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor"/>' +
             '<path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  var doors = {};
  var world = null;   /* the 3D island, when the browser can draw it */
  Array.prototype.forEach.call(document.querySelectorAll('.door'), function (node) {
    var day = parseInt(node.dataset.day, 10);
    doors[day] = node;
    var lid = node.querySelector('.lid');
    var niche = node.querySelector('.niche');
    lid.querySelector('.lock').innerHTML = LOCK;
    lid.setAttribute('aria-label', say('open') + day);
    node.setAttribute('data-today', say('today'));

    lid.addEventListener('click', function () {
      if (!isOpenable(day)) { refuse(day); return; }
      swing(day);
    });
    niche.addEventListener('click', function () { if (node.classList.contains('open')) openStage(day); });
    niche.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && node.classList.contains('open')) { e.preventDefault(); openStage(day); }
    });
  });

  function refuse(day) {
    var node = doors[day];
    if (world) world.paint();
    node.classList.remove('nudge');
    void node.offsetWidth;
    node.classList.add('nudge');
    var left = NOW.unlocked ? day - NOW.unlocked : NOW.daysLeft + day - 1;
    toast(say('wait', day, left));
  }

  /* the label behind the door enters the page only when the door may open */
  function dress(day) {
    var node = doors[day], d = byDay[day];
    var niche = node.querySelector('.niche');
    if (node.dataset.dressed) return;
    node.dataset.dressed = '1';
    node.querySelector('.cap .when').textContent = say('door', day);
    node.querySelector('.cap b').textContent = tx(d.door);
    niche.setAttribute('tabindex', '0');
    niche.setAttribute('role', 'button');
    niche.setAttribute('aria-label', say('door', day) + ', ' + tx(d.door));
  }

  function openDoor(day) {
    var node = doors[day];
    if (!node || node.classList.contains('open')) return;
    dress(day);
    node.classList.add('open');
    var poster = node.querySelector('.poster');
    if (poster && !poster.firstChild && window.Advent) {
      Advent.render(poster, byDay[day].anim, lang, {still: true});
      var svg = poster.querySelector('svg');
      if (svg) svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    }
    var opened = stored(STORE, []);
    if (opened.indexOf(day) === -1) { opened.push(day); remember(STORE, opened); }
    counters();
    if (world) world.paint();
  }

  /* the door swings, the light spills, then the stage grows out of the door */
  function swing(day) {
    var node = doors[day];
    if (node.classList.contains('open')) { openStage(day); return; }
    node.classList.add('opening');
    openDoor(day);
    setTimeout(function () { node.classList.remove('opening'); }, 1500);
    setTimeout(function () { openStage(day); }, reduced ? 0 : 1050);
  }

  function paintLocks() {
    for (var day = 1; day <= 24; day++) {
      var node = doors[day];
      if (!node) continue;
      var ok = isOpenable(day);
      node.classList.toggle('locked', !ok);
      node.classList.toggle('ready', ok);
      node.classList.toggle('today', !peeking && day === NOW.unlocked && NOW.unlocked > 0);
      if (ok) dress(day);
    }
    counters();
    if (world) world.paint();
  }

  /* --- the counters ------------------------------------------------------ */

  var countdown = document.querySelector('.countdown');
  var openedPill = document.querySelector('.opened');
  function counters() {
    var opened = 0, perWeek = {};
    for (var day = 1; day <= 24; day++) {
      if (doors[day] && doors[day].classList.contains('open')) {
        opened++;
        perWeek[byDay[day].band] = (perWeek[byDay[day].band] || 0) + 1;
      }
    }
    if (countdown) {
      countdown.textContent = peeking && NOW.unlocked < 24 ? say('peeking')
        : NOW.unlocked === 0 ? say('soon', NOW.daysLeft)
        : NOW.unlocked >= 24 ? say('allOpen') : say('todayIs', NOW.unlocked);
    }
    if (openedPill) openedPill.textContent = opened ? say('opened', opened) : '';
    Array.prototype.forEach.call(document.querySelectorAll('.week'), function (w) {
      var bar = w.querySelector('.bar i');
      if (bar) bar.style.width = Math.round(100 * (perWeek[w.dataset.week] || 0) / 6) + '%';
    });
  }

  /* --- the toast --------------------------------------------------------- */

  var toastEl = document.querySelector('.toast');
  var toastTimer = null;
  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }

  /* --- the stage --------------------------------------------------------- */

  var back = document.querySelector('.stage-back');
  var stageEl = back.querySelector('.stage');
  var numEl = back.querySelector('.daynum');
  var host = back.querySelector('.anim-host');
  var noteEl = back.querySelector('.anim-note');
  var replayEl = back.querySelector('.replay');
  var kEl = back.querySelector('.reveal-k');
  var titleEl = back.querySelector('.reveal-title');
  var teaserEl = back.querySelector('.reveal-teaser');
  var openingEl = back.querySelector('.opening');
  var openingBody = back.querySelector('.opening-body');
  var readEl = back.querySelector('.read');
  var metaEl = back.querySelector('.reveal-cta .meta');
  var prevBtn = back.querySelector('.prev');
  var nextBtn = back.querySelector('.next');
  var TONE = {matter: '#f6c85f', memory: '#ff5ad9', control: '#ae8fff', company: '#b8ff62'};
  var WEEK = {matter: 1, memory: 2, control: 3, company: 4};
  var current = null, running = null, lastFocus = null;
  replayEl.textContent = say('replay');

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function md(text) {
    return String(text || '').split(/\n\s*\n/).map(function (p) {
      var h = esc(p.trim())
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
      return h ? '<p>' + h + '</p>' : '';
    }).join('');
  }

  function openStage(day, fromNav) {
    var d = byDay[day];
    if (!d || !isOpenable(day)) return;
    openDoor(day);
    current = day;
    if (running) running.stop();
    if (!back.classList.contains('open')) lastFocus = document.activeElement;

    var r = doors[day] && doors[day].getBoundingClientRect();
    if (r && r.width && !fromNav) {
      stageEl.style.setProperty('--ox', (r.left + r.width / 2 - (innerWidth - Math.min(1000, innerWidth - 32)) / 2) + 'px');
      stageEl.style.setProperty('--oy', (r.top + r.height / 2 - innerHeight * 0.03) + 'px');
    } else {
      stageEl.style.removeProperty('--ox'); stageEl.style.removeProperty('--oy');
    }
    stageEl.style.setProperty('--tone', TONE[d.band] || TONE.matter);

    numEl.textContent = say('door', day) + ' · ' + say('week') + ' ' + (WEEK[d.band] || '') + ' · ' + d.vol;
    kEl.textContent = tx(d.door);
    titleEl.textContent = tx(d.title);
    teaserEl.textContent = tx(d.teaser);
    if (d.opening) {
      openingEl.hidden = false;
      openingEl.open = false;
      openingEl.querySelector('summary').textContent = lang === 'fr' ? say('firstEn') : say('first');
      openingBody.innerHTML = md(d.opening);
    } else {
      openingEl.hidden = true;
    }
    if (d.url) {
      readEl.hidden = false;
      readEl.href = d.url;
      readEl.querySelector('.lbl').textContent = say('readOn', d.platform === 'medium' ? 'Medium' : 'Towards Data Science');
      metaEl.textContent = d.article || '';
    } else {
      readEl.hidden = true;
      metaEl.textContent = say('comes', day);
    }

    noteEl.textContent = '';
    if (window.Advent) {
      running = Advent.render(host, d.anim, lang, {loop: true, onNote: function (t) { noteEl.textContent = t; }});
    }
    prevBtn.disabled = !step(day, -1);
    nextBtn.disabled = !step(day, 1);

    if (fromNav) {
      back.classList.remove('open'); void back.offsetWidth;
    }
    back.classList.add('open');
    back.scrollTop = 0;
    document.body.style.overflow = 'hidden';
    snow.pause(true);
    if (world) world.pause(true);
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search + '#d' + day);
    back.querySelector('.stage-x').focus({preventScroll: true});
  }

  function step(day, dir) {
    for (var i = day + dir; i >= 1 && i <= 24; i += dir) if (isOpenable(i)) return i;
    return 0;
  }

  function closeStage() {
    if (running) { running.stop(); running = null; }
    back.classList.remove('open');
    document.body.style.overflow = '';
    snow.pause(false);
    if (world) { world.pause(false); world.back(); }
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
    var target = current && doors[current] ? doors[current].querySelector('.niche') : lastFocus;
    if (target && target.focus) target.focus({preventScroll: true});
  }

  back.querySelector('.stage-x').addEventListener('click', closeStage);
  back.addEventListener('click', function (e) { if (e.target === back) closeStage(); });
  prevBtn.addEventListener('click', function () { var p = step(current, -1); if (p) openStage(p, true); });
  nextBtn.addEventListener('click', function () { var n = step(current, 1); if (n) openStage(n, true); });
  replayEl.addEventListener('click', function () { if (running) running.replay(); });
  document.addEventListener('keydown', function (e) {
    if (!back.classList.contains('open')) return;
    if (e.key === 'Escape') closeStage();
    if (e.key === 'ArrowLeft') { var p = step(current, -1); if (p) openStage(p, true); }
    if (e.key === 'ArrowRight') { var n = step(current, 1); if (n) openStage(n, true); }
    if (e.key === 'Tab') {
      var f = back.querySelectorAll('button:not(:disabled), a[href]:not([hidden]), summary');
      var list = Array.prototype.filter.call(f, function (x) { return x.offsetParent !== null; });
      if (!list.length) return;
      if (e.shiftKey && document.activeElement === list[0]) { e.preventDefault(); list[list.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === list[list.length - 1]) { e.preventDefault(); list[0].focus(); }
    }
  });

  /* --- the garland: bulbs placed on its curve ----------------------------- */

  (function bulbs() {
    var box = document.querySelector('.bulbs');
    if (!box) return;
    /* the garland is y = 8 + 50 * |sin| shaped: four arcs of a quadratic, sampled */
    for (var i = 1; i < 24; i++) {
      var t = i / 24, u = (t * 4) % 1;
      var y = 8 + 50 * 2 * u * (1 - u) * (Math.floor(t * 4) % 2 ? -1 : 1);
      var b = document.createElement('i');
      b.style.left = (t * 100) + '%';
      b.style.top = (y * 40 / 60) + 'px';
      box.appendChild(b);
    }
  })();

  /* --- the city ---------------------------------------------------------- */

  (function city() {
    var box = document.querySelector('.city');
    if (!box) return;
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 1600 300');
    svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
    function row(cls, minH, maxH, minW, maxW, windows) {
      var x = -20;
      while (x < 1620) {
        var w = minW + rnd() * (maxW - minW), h = minH + rnd() * (maxH - minH);
        var b = document.createElementNS(NS, 'rect');
        b.setAttribute('x', x.toFixed(1)); b.setAttribute('y', (300 - h).toFixed(1));
        b.setAttribute('width', w.toFixed(1)); b.setAttribute('height', h.toFixed(1));
        b.setAttribute('class', cls);
        svg.appendChild(b);
        if (rnd() < 0.25) {
          var a = document.createElementNS(NS, 'rect');
          a.setAttribute('x', (x + w / 2 - 1).toFixed(1)); a.setAttribute('y', (300 - h - 18).toFixed(1));
          a.setAttribute('width', 2); a.setAttribute('height', 18); a.setAttribute('class', cls);
          svg.appendChild(a);
        }
        if (windows) {
          for (var wy = 300 - h + 10; wy < 292; wy += 13) {
            for (var wx = x + 6; wx < x + w - 8; wx += 10) {
              if (rnd() < 0.2) {
                var win = document.createElementNS(NS, 'rect');
                win.setAttribute('x', wx.toFixed(1)); win.setAttribute('y', wy.toFixed(1));
                win.setAttribute('width', 4); win.setAttribute('height', 6);
                var c = rnd();
                win.setAttribute('class', 'win' + (c < 0.18 ? ' c' : '') + (c > 0.94 ? ' blink' : ''));
                if (c > 0.94) win.style.animationDelay = (-rnd() * 6).toFixed(2) + 's';
                svg.appendChild(win);
              }
            }
          }
        }
        x += w + (rnd() < 0.3 ? 6 + rnd() * 12 : 0);
      }
    }
    row('far', 70, 210, 40, 110, true);
    row('near', 30, 120, 50, 140, true);
    box.appendChild(svg);
  })();

  /* --- the snow ---------------------------------------------------------- */

  var snow = (function () {
    var canvas = document.querySelector('.snow');
    var api = {pause: function () {}};
    if (!canvas || reduced || !canvas.getContext) return api;
    var ctx = canvas.getContext('2d');
    var flakes = [], W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
    var paused = false, last = 0, wind = 0;
    function size() {
      W = innerWidth; H = innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var want = Math.round(Math.min(160, W * H / 9000));
      while (flakes.length < want) flakes.push(make(true));
      flakes.length = want;
    }
    function make(anywhere) {
      var z = Math.random();
      return {x: Math.random() * W, y: anywhere ? Math.random() * H : -10, r: 0.6 + z * 2.2,
              v: 18 + z * 46, s: Math.random() * 6.28, a: 0.25 + z * 0.6};
    }
    function frame(t) {
      var dt = Math.min(0.05, (t - last) / 1000 || 0);
      last = t;
      if (!paused && !document.hidden) {
        wind = Math.sin(t / 7000) * 14;
        ctx.clearRect(0, 0, W, H);
        for (var i = 0; i < flakes.length; i++) {
          var f = flakes[i];
          f.s += dt * 1.2;
          f.y += f.v * dt;
          f.x += (wind + Math.sin(f.s) * 10) * dt * (0.4 + f.r / 3);
          if (f.y > H + 6) { flakes[i] = make(false); continue; }
          if (f.x > W + 6) f.x = -6; else if (f.x < -6) f.x = W + 6;
          ctx.globalAlpha = f.a;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, 6.283);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      }
      requestAnimationFrame(frame);
    }
    addEventListener('resize', size);
    size();
    requestAnimationFrame(frame);
    api.pause = function (on) { paused = on; if (on) ctx.clearRect(0, 0, W, H); };
    return api;
  })();

  /* --- the peek, before the first door is due ---------------------------- */

  var peek = document.querySelector('.peek');
  if (peek) {
    if (data.public || (NOW.unlocked >= 1 && !params.has('all'))) {
      peek.hidden = true;
    } else {
      peek.setAttribute('aria-pressed', peeking ? 'true' : 'false');
      peek.addEventListener('click', function () {
        peeking = !peeking;
        remember(PEEK, peeking);
        peek.setAttribute('aria-pressed', peeking ? 'true' : 'false');
        paintLocks();
      });
    }
  }

  /* --- boot -------------------------------------------------------------- */

  paintLocks();

  /* the island: the same doors, as houses in four villages. The cabinet stays
     one click away, and is what a browser without WebGL shows. */
  (function island() {
    var section = document.querySelector('.world');
    var mountAt = document.getElementById('monde');
    if (!section || !mountAt || !window.Monde3D || !data.world) return;
    world = Monde3D.mount(mountAt, data, {
      tx: tx,
      say: function (k) { return say(k); },
      state: function (d) { return doors[d] && doors[d].classList.contains('open') ? 'open' : isOpenable(d) ? 'ready' : 'locked'; },
      mark: function (d) { openDoor(d); },
      refuse: function (d) { refuse(d); },
      enter: function (d) { openStage(d, true); }
    });
    if (!world) return;
    section.hidden = false;
    var VIEW = 'edi-advent-view';
    var buttons = section.querySelectorAll('.view-switch button');
    function show(view) {
      document.body.classList.toggle('view-world', view === 'world');
      document.body.classList.toggle('view-cabinet', view !== 'world');
      Array.prototype.forEach.call(buttons, function (b) { b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false'); });
      remember(VIEW, view);
    }
    Array.prototype.forEach.call(buttons, function (b) { b.addEventListener('click', function () { show(b.dataset.view); }); });
    show(params.get('vue') || stored(VIEW, 'cabinet'));
    window.monde = world;
  })();
  stored(STORE, []).forEach(function (day) { if (isOpenable(day)) openDoor(day); });
  var deep = (location.hash.match(/^#d(\d{1,2})$/) || [])[1];
  if (deep && isOpenable(+deep)) openStage(+deep);
})();
