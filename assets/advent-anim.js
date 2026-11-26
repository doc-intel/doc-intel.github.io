/* The reading machine — the animation engine of the advent calendar.
 *
 * This is not the site's visual language and does not borrow from it. The
 * calendar is an instrument deck: a dark console, a 960 x 540 screen, a HUD
 * that owns the margins, and six machine tones that mean something:
 *
 *   doc  gold     paper, the raw input, anything a human wrote
 *   mac  cyan     the machine: readers, filters, indexes, pipes
 *   ask  magenta  the question and everything derived from it
 *   mod  violet   a model, or a decision taken by one
 *   ok   lime     an output that has been checked
 *   no   red      a failure, with its reason
 *
 * A scene declares shapes once, then a list of steps. The engine owns timing,
 * replay, the caption line, the HUD, the telemetry readouts and the
 * reduced-motion path. A scene file never touches a timer and never names a
 * colour: it names a role.
 *
 *   Advent.scene('day09', {
 *     code: '9', volume: 'V2', hud: 'rank fusion',
 *     build: function (s) {
 *       var a = s.rank(s.L, 120, {title: 'lexical', tone: 'doc', items: [...]});
 *       var r = s.rail(300, 200, 420, 200, {tone: 'mac'});
 *       return [
 *         {at: 0, in: [a], note: {en: '...', fr: '...'}},
 *         {at: 900, cls: [[r, 'flow']], read: [['recall', '0.62']]}
 *       ];
 *     }
 *   });
 *
 * Step keys
 *   in / out      reveal or hide elements (staggered, with a power-on flicker)
 *   move          [[el, dx, dy]] translate
 *   pulse         [el] one ping
 *   cls / decls   [[el, 'flow']] add or remove a state class
 *   set           [[el, 0..1, 'label']] drive a gauge, a dial or a counter
 *   text          [[el, 'new text']]
 *   read          [['recall', '0.62']] write a HUD telemetry slot
 *   note          {en, fr} the caption line under the screen
 *
 * Geometry: the scene owns the content box, s.L..s.R by s.T..s.B. Everything
 * outside it belongs to the HUD, and `controle_des_animations.js` enforces it.
 */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var W = 960, H = 540;
  var BOX = {l: 30, r: 930, t: 78, b: 474};
  var TONES = ['doc', 'mac', 'ask', 'mod', 'ok', 'no', 'dim'];
  var scenes = {};

  function el(name, attrs) {
    var node = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) node.setAttribute(k, attrs[k]);
    return node;
  }

  function txt(node, value) { node.textContent = value; return node; }

  /* --- defs: the look of the machine, declared once per screen ---------- */

  function defs() {
    var d = el('defs');

    TONES.forEach(function (t) {
      var m = el('marker', {id: 'rmk-' + t, viewBox: '0 0 10 10', refX: 9, refY: 5,
                            markerWidth: 6.5, markerHeight: 6.5, orient: 'auto-start-reverse'});
      m.appendChild(el('path', {d: 'M0,0 L10,5 L0,10 z', class: 'rm-head t-' + t}));
      d.appendChild(m);
    });

    var grid = el('pattern', {id: 'rm-grid', width: 30, height: 30, patternUnits: 'userSpaceOnUse'});
    grid.appendChild(el('path', {d: 'M 30 0 L 0 0 L 0 30', class: 'rm-gridline'}));
    d.appendChild(grid);

    var fine = el('pattern', {id: 'rm-fine', width: 6, height: 6, patternUnits: 'userSpaceOnUse'});
    fine.appendChild(el('path', {d: 'M 0 6 L 6 0', class: 'rm-hatch'}));
    d.appendChild(fine);

    d.appendChild(stops('rm-sweep', [[0, 'transparent'], [0.45, 'rgba(53,230,255,.10)'],
                                     [0.5, 'rgba(53,230,255,.22)'], [0.55, 'rgba(53,230,255,.10)'],
                                     [1, 'transparent']]));
    d.appendChild(stops('rm-beam', [[0, 'transparent'], [0.5, 'rgba(53,230,255,.85)'], [1, 'transparent']]));
    d.appendChild(stops('rm-fade', [[0, 'rgba(53,230,255,.30)'], [1, 'transparent']], true));

    var vig = el('radialGradient', {id: 'rm-vig', cx: '50%', cy: '46%', r: '74%'});
    vig.appendChild(el('stop', {offset: '55%', 'stop-color': 'transparent'}));
    vig.appendChild(el('stop', {offset: '100%', 'stop-color': 'rgba(2,4,9,.82)'}));
    d.appendChild(vig);

    var glow = el('filter', {id: 'rm-glow', x: '-40%', y: '-40%', width: '180%', height: '180%'});
    glow.appendChild(el('feGaussianBlur', {stdDeviation: 3.4, result: 'b'}));
    var merge = el('feMerge');
    merge.appendChild(el('feMergeNode', {in: 'b'}));
    merge.appendChild(el('feMergeNode', {in: 'SourceGraphic'}));
    glow.appendChild(merge);
    d.appendChild(glow);

    return d;
  }

  function stops(id, list, vertical) {
    var g = el('linearGradient', vertical ? {id: id, x1: 0, y1: 0, x2: 0, y2: 1}
                                          : {id: id, x1: 0, y1: 0, x2: 1, y2: 0});
    list.forEach(function (s) {
      g.appendChild(el('stop', {offset: (s[0] * 100) + '%', 'stop-color': s[1]}));
    });
    return g;
  }

  /* --- the screen ------------------------------------------------------- */

  function Stage(host, opts) {
    this.opts = opts || {};
    this.els = [];
    this.svg = el('svg', {viewBox: '0 0 ' + W + ' ' + H, class: 'rm-svg' + (this.opts.still ? ' rm-still' : ''),
                          preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true'});
    this.svg.appendChild(defs());
    this.back = el('g', {class: 'rm-back'});
    this.layer = el('g', {class: 'rm-scene'});
    this.front = el('g', {class: 'rm-front'});
    this.svg.appendChild(this.back);
    this.svg.appendChild(this.layer);
    this.svg.appendChild(this.front);
    host.appendChild(this.svg);
    this.W = W; this.H = H;
    this.L = BOX.l; this.R = BOX.r; this.T = BOX.t; this.B = BOX.b;
    this.CX = (BOX.l + BOX.r) / 2; this.CY = (BOX.t + BOX.b) / 2;
    backdrop(this);
    hud(this);
  }

  function backdrop(s) {
    var b = s.back;
    b.appendChild(el('rect', {x: 0, y: 0, width: W, height: H, class: 'hud rm-floor'}));
    b.appendChild(el('rect', {x: 0, y: 0, width: W, height: H, fill: 'url(#rm-grid)', class: 'hud rm-gridfill'}));
    /* a horizon: the deck has depth, so the grid fades upwards */
    b.appendChild(el('rect', {x: 0, y: 0, width: W, height: H, fill: 'url(#rm-fade)', class: 'hud rm-horizon'}));
    if (!s.opts.still) {
      b.appendChild(el('rect', {x: 0, y: 0, width: 260, height: H, fill: 'url(#rm-sweep)', class: 'hud rm-sweep'}));
    }
    s.front.appendChild(el('rect', {x: 0, y: 0, width: W, height: H, fill: 'url(#rm-vig)', class: 'hud rm-vig'}));
    s.front.appendChild(el('rect', {x: 0, y: 0, width: W, height: H, class: 'hud rm-lines'}));
  }

  function hud(s) {
    var f = s.front;
    [[16, 16, 1, 1], [944, 16, -1, 1], [16, 524, 1, -1], [944, 524, -1, -1]].forEach(function (c) {
      f.appendChild(el('path', {class: 'hud rm-bracket',
        d: 'M ' + (c[0] + c[2] * 26) + ' ' + c[1] + ' L ' + c[0] + ' ' + c[1] +
           ' L ' + c[0] + ' ' + (c[1] + c[3] * 26)}));
    });
    if (s.opts.still) return;

    f.appendChild(el('line', {x1: 30, y1: 52, x2: 930, y2: 52, class: 'hud rm-hairline'}));
    f.appendChild(el('line', {x1: 30, y1: 492, x2: 930, y2: 492, class: 'hud rm-hairline'}));

    s._code = txt(el('text', {x: 30, y: 38, class: 'hud rm-hud big'}), s.opts.code || '');
    f.appendChild(s._code);
    s._title = txt(el('text', {x: 30, y: 522, class: 'hud rm-hud'}), s.opts.hud || '');
    f.appendChild(s._title);
    s._vol = txt(el('text', {x: 930, y: 38, 'text-anchor': 'end', class: 'hud rm-hud dim'}),
                 s.opts.volume || '');
    f.appendChild(s._vol);
    s._tick = txt(el('text', {x: 930, y: 522, 'text-anchor': 'end', class: 'hud rm-hud dim'}), '');
    f.appendChild(s._tick);
    f.appendChild(el('rect', {x: 30, y: 528, width: 900, height: 2, class: 'hud rm-progbg'}));
    s._prog = el('rect', {x: 30, y: 528, width: 0, height: 2, class: 'hud rm-prog'});
    f.appendChild(s._prog);

    /* three telemetry slots, filled by {read: [['recall', '0.62']]} */
    s._slots = {};
    s._slotOrder = [];
    s._slotHost = el('g', {class: 'hud'});
    f.appendChild(s._slotHost);
  }

  Stage.prototype.readout = function (key, value) {
    if (!this._slotHost) return;
    var slot = this._slots[key];
    if (!slot) {
      var i = this._slotOrder.length;
      if (i > 2) return;
      var x = 330 + i * 200;
      var g = el('g', {class: 'rm-slot'});
      g.appendChild(txt(el('text', {x: x, y: 32, class: 'rm-hud dim'}), key));
      var val = txt(el('text', {x: x, y: 44, class: 'rm-hud val'}), '');
      g.appendChild(val);
      this._slotHost.appendChild(g);
      slot = this._slots[key] = {node: g, val: val};
      this._slotOrder.push(key);
    }
    txt(slot.val, value);
  };

  /* --- the basics ------------------------------------------------------- */

  Stage.prototype.add = function (node) {
    node.classList.add('e');
    this.els.push(node);
    this.layer.appendChild(node);
    return node;
  };

  Stage.prototype.raw = function (node) {
    this.layer.appendChild(node);
    return node;
  };

  Stage.prototype.group = function (children) {
    var g = el('g', {});
    (children || []).forEach(function (c) { g.appendChild(c); c.classList.remove('e'); });
    return this.add(g);
  };

  Stage.prototype.box = function (x, y, w, h, o) {
    o = o || {};
    var tone = o.tone || 'dim';
    var g = el('g', {class: 't-' + tone});
    g.appendChild(el('rect', {x: x, y: y, width: w, height: h, rx: o.rx == null ? 6 : o.rx,
                              class: 'rm-box' + (o.dash ? ' dash' : '') + (o.solid ? ' solid' : '')}));
    if (o.label) {
      g.appendChild(txt(el('text', {x: x + w / 2, y: y + (o.sub ? h / 2 - 3 : h / 2 + 5),
                                    'text-anchor': 'middle', class: 'rm-txt bold'}), o.label));
    }
    if (o.sub) {
      g.appendChild(txt(el('text', {x: x + w / 2, y: y + h / 2 + 16, 'text-anchor': 'middle',
                                    class: 'rm-txt xs dim'}), o.sub));
    }
    return this.add(g);
  };

  /* A machine stage: a bay with a glyph, a name and a port on each side. */
  Stage.prototype.node = function (x, y, w, h, o) {
    o = o || {};
    var tone = o.tone || 'mac';
    var g = el('g', {class: 't-' + tone});
    g.appendChild(el('rect', {x: x, y: y, width: w, height: h, rx: 7, class: 'rm-bay'}));
    g.appendChild(el('rect', {x: x, y: y, width: w, height: 3, rx: 1.5, class: 'rm-baytop'}));
    if (o.glyph) {
      g.appendChild(txt(el('text', {x: x + 13, y: y + h / 2 + 6, class: 'rm-glyph'}), o.glyph));
    }
    var tx = o.glyph ? x + 32 : x + w / 2;
    var anchor = o.glyph ? 'start' : 'middle';
    g.appendChild(txt(el('text', {x: tx, y: y + (o.sub ? h / 2 - 2 : h / 2 + 5), 'text-anchor': anchor,
                                  class: 'rm-txt bold'}), o.label || ''));
    if (o.sub) {
      g.appendChild(txt(el('text', {x: tx, y: y + h / 2 + 15, 'text-anchor': anchor,
                                    class: 'rm-txt xs dim'}), o.sub));
    }
    return this.add(g);
  };

  Stage.prototype.text = function (x, y, str, o) {
    o = o || {};
    return this.add(txt(el('text', {x: x, y: y, 'text-anchor': o.anchor || 'start',
      class: 'rm-txt t-' + (o.tone || 'dim') + (o.size ? ' ' + o.size : '') +
             (o.bold ? ' bold' : '') + (o.mono ? ' mono' : '')}), str));
  };

  Stage.prototype.chip = function (x, y, label, o) {
    o = o || {};
    var w = o.w || Math.round(label.length * 6.6 + 22), h = o.h || 24;
    var g = el('g', {class: 't-' + (o.tone || 'dim')});
    g.appendChild(el('rect', {x: x, y: y, width: w, height: h, rx: 4,
                              class: 'rm-chip' + (o.dash ? ' dash' : '')}));
    g.appendChild(txt(el('text', {x: x + w / 2, y: y + h / 2 + 4, 'text-anchor': 'middle',
                                  class: 'rm-txt xs bold'}), label));
    var node = this.add(g);
    node.w = w; node.h = h;
    return node;
  };

  /* A rail carries packets: add 'flow' in a step to start the traffic. */
  Stage.prototype.rail = function (x1, y1, x2, y2, o) {
    o = o || {};
    var tone = o.tone || 'mac';
    var g = el('g', {class: 't-' + tone});
    var d = o.d || ('M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2);
    g.appendChild(el('path', {d: d, class: 'rm-rail' + (o.dash ? ' dash' : ''),
                              'marker-end': o.arrow === false ? null : 'url(#rmk-' + tone + ')'}));
    g.appendChild(el('path', {d: d, class: 'rm-packet'}));
    return this.add(g);
  };

  Stage.prototype.curve = function (d, o) {
    o = o || {};
    return this.rail(0, 0, 0, 0, {d: d, tone: o.tone, arrow: o.arrow, dash: o.dash});
  };

  Stage.prototype.dot = function (x, y, o) {
    o = o || {};
    var g = el('g', {class: 't-' + (o.tone || 'mac')});
    g.appendChild(el('circle', {cx: x, cy: y, r: o.r || 4, class: 'rm-dot'}));
    if (o.ring) g.appendChild(el('circle', {cx: x, cy: y, r: (o.r || 4) + 5, class: 'rm-ring'}));
    if (o.label) {
      g.appendChild(txt(el('text', {x: x, y: y - (o.r || 4) - 7, 'text-anchor': 'middle',
                                    class: 'rm-txt xs'}), o.label));
    }
    return this.add(g);
  };

  /* --- paper ------------------------------------------------------------ */

  /* A document: header band, body blocks, and a scan beam. Blocks are
     addressable, so the laser can light what it just understood.
     blocks: [{kind: 'text'|'table'|'figure'|'head', h: 30, label: '...'}] */
  Stage.prototype.paper = function (x, y, w, h, o) {
    o = o || {};
    var tone = o.tone || 'doc';
    var g = el('g', {class: 't-' + tone});
    g.appendChild(el('rect', {x: x, y: y, width: w, height: h, rx: 4, class: 'rm-paper'}));
    g.appendChild(el('rect', {x: x, y: y, width: w, height: 22, rx: 4, class: 'rm-papertop'}));
    if (o.label) {
      g.appendChild(txt(el('text', {x: x + 9, y: y + 15, class: 'rm-txt xs bold mono'}), o.label));
    }
    if (o.page) {
      g.appendChild(txt(el('text', {x: x + w - 9, y: y + h - 8, 'text-anchor': 'end',
                                    class: 'rm-txt xs dim mono'}), o.page));
    }
    var parts = [], cy = y + 32;
    (o.blocks || []).forEach(function (b) {
      var bh = b.h || 26, pad = 10;
      var pg = el('g', {class: 'rm-part'});
      if (b.kind === 'table') {
        var cols = b.cols || 4, rows = Math.max(2, Math.round(bh / 13));
        var cwi = (w - pad * 2) / cols, chi = bh / rows;
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            pg.appendChild(el('rect', {x: x + pad + c * cwi, y: cy + r * chi,
                                       width: cwi - 1.5, height: chi - 1.5,
                                       class: 'rm-pcell' + (r === 0 ? ' head' : '')}));
          }
        }
      } else if (b.kind === 'figure') {
        pg.appendChild(el('rect', {x: x + pad, y: cy, width: w - pad * 2, height: bh,
                                   class: 'rm-pfig', fill: 'url(#rm-fine)'}));
        pg.appendChild(el('path', {class: 'rm-pspark',
          d: 'M ' + (x + pad + 8) + ' ' + (cy + bh - 8) + ' L ' + (x + pad + w * 0.3) + ' ' + (cy + 10) +
             ' L ' + (x + pad + w * 0.52) + ' ' + (cy + bh * 0.6) + ' L ' + (x + w - pad - 8) + ' ' + (cy + 6)}));
      } else if (b.kind === 'head') {
        pg.appendChild(el('rect', {x: x + pad, y: cy, width: (w - pad * 2) * 0.62, height: 7, rx: 2,
                                   class: 'rm-phead'}));
      } else {
        var n = Math.max(1, Math.round(bh / 11));
        for (var i = 0; i < n; i++) {
          pg.appendChild(el('rect', {x: x + pad, y: cy + i * 11,
                                     width: (w - pad * 2) * (i % 3 === 2 ? 0.74 : 1), height: 4.5, rx: 2,
                                     class: 'rm-pline'}));
        }
      }
      if (b.label) {
        pg.appendChild(txt(el('text', {x: x + w + 12, y: cy + bh / 2 + 4, class: 'rm-txt xs mono'}), b.label));
      }
      g.appendChild(pg);
      parts.push(pg);
      cy += bh + (b.gap == null ? 10 : b.gap);
    });
    var beam = el('rect', {x: x + 1, y: y, width: w - 2, height: 13, class: 'rm-scanbeam'});
    beam.style.setProperty('--sweep', (h - 13) + 'px');
    g.appendChild(beam);
    var node = this.add(g);
    node.block = function (i) { return parts[i]; };   /* not `part`: an SVG element owns that name */
    node.parts = parts;
    return node;
  };

  /* A stack of documents, in perspective: the corpus. */
  Stage.prototype.stack = function (x, y, o) {
    o = o || {};
    var n = o.n || 5, w = o.w || 86, h = o.h || 108, step = o.step || 7;
    var g = el('g', {class: 't-' + (o.tone || 'doc')});
    for (var i = n - 1; i >= 0; i--) {
      g.appendChild(el('rect', {x: x + i * step, y: y - i * step * 0.55, width: w, height: h, rx: 4,
                                class: 'rm-sheet' + (i ? '' : ' top')}));
    }
    if (o.label) {
      g.appendChild(txt(el('text', {x: x + w / 2, y: y + h + 18, 'text-anchor': 'middle',
                                    class: 'rm-txt xs bold'}), o.label));
    }
    if (o.sub) {
      g.appendChild(txt(el('text', {x: x + w / 2, y: y + h + 32, 'text-anchor': 'middle',
                                    class: 'rm-txt xs dim mono'}), o.sub));
    }
    return this.add(g);
  };

  /* --- grids, lists, spaces --------------------------------------------- */

  /* A spreadsheet: addressable cells plus region overlays. */
  Stage.prototype.sheet = function (x, y, cols, rows, o) {
    o = o || {};
    var cw = o.cw || 58, ch = o.ch || 22;
    var g = el('g', {class: 't-' + (o.tone || 'dim')}), cells = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var cell = el('rect', {x: x + c * cw, y: y + r * ch, width: cw - 1, height: ch - 1,
                               class: 'rm-cell'});
        g.appendChild(cell);
        cells.push(cell);
      }
    }
    (o.values || []).forEach(function (v, i) {
      if (v == null || v === '') return;
      g.appendChild(txt(el('text', {x: x + (i % cols) * cw + cw / 2 - 0.5,
                                    y: y + Math.floor(i / cols) * ch + ch / 2 + 3.5,
                                    'text-anchor': 'middle', class: 'rm-txt xs mono'}), v));
    });
    var node = this.add(g);
    node.cell = function (r, c) { return cells[r * cols + c]; };
    node.at = function (x0, y0) { return [x + x0 * cw, y + y0 * ch]; };
    node.cw = cw; node.ch = ch;
    return node;
  };

  /* A ranked list whose rows move: fusion, rerank, candidate sets. */
  Stage.prototype.rank = function (x, y, o) {
    o = o || {};
    var w = o.w || 190, rh = o.rh || 26, gap = o.gap || 4;
    var g = el('g', {class: 't-' + (o.tone || 'dim')});
    if (o.title) {
      g.appendChild(txt(el('text', {x: x, y: y - 10, class: 'rm-txt xs bold up'}), o.title));
    }
    var head = this.add(g), rows = [];
    (o.items || []).forEach(function (item, i) {
      var ry = y + i * (rh + gap);
      var rg = el('g', {class: 't-' + (item.tone || o.tone || 'dim')});
      rg.appendChild(el('rect', {x: x, y: ry, width: w, height: rh, rx: 4, class: 'rm-row'}));
      rg.appendChild(txt(el('text', {x: x + 9, y: ry + rh / 2 + 4, class: 'rm-txt xs mono dim'}),
                         String(i + 1)));
      rg.appendChild(txt(el('text', {x: x + 26, y: ry + rh / 2 + 4, class: 'rm-txt xs'}), item.label));
      if (item.score != null) {
        rg.appendChild(txt(el('text', {x: x + w - 9, y: ry + rh / 2 + 4, 'text-anchor': 'end',
                                       class: 'rm-txt xs mono'}), item.score));
      }
      rows.push(this.add(rg));
    }, this);
    head.rows = rows;
    head.row = function (i) { return rows[i]; };
    head.slot = function (i) { return y + i * (rh + gap); };
    head.step = rh + gap;
    return head;
  };

  /* A vector space: points, a radar sweep, a query and its neighbours. */
  Stage.prototype.space = function (x, y, w, h, o) {
    o = o || {};
    var g = el('g', {class: 't-' + (o.tone || 'mac')});
    g.appendChild(el('rect', {x: x, y: y, width: w, height: h, rx: 6, class: 'rm-space'}));
    for (var i = 1; i < 4; i++) {
      g.appendChild(el('line', {x1: x + w * i / 4, y1: y, x2: x + w * i / 4, y2: y + h,
                                class: 'rm-spaceline'}));
      g.appendChild(el('line', {x1: x, y1: y + h * i / 4, x2: x + w, y2: y + h * i / 4,
                                class: 'rm-spaceline'}));
    }
    if (o.label) {
      g.appendChild(txt(el('text', {x: x + 9, y: y + 16, class: 'rm-txt xs dim up'}), o.label));
    }
    var node = this.add(g), pts = [];
    var seed = o.seed || 11;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    for (var k = 0; k < (o.n || 26); k++) {
      var px = x + 16 + rnd() * (w - 32), py = y + 24 + rnd() * (h - 44);
      var p = el('circle', {cx: Math.round(px), cy: Math.round(py), r: 3, class: 'rm-pt'});
      g.appendChild(p);
      pts.push(p);
    }
    node.pts = pts;
    node.pt = function (i) { return pts[i]; };
    return node;
  };

  /* --- readouts --------------------------------------------------------- */

  Stage.prototype.gauge = function (x, y, w, label, o) {
    o = o || {};
    var g = el('g', {class: 't-' + (o.tone || 'mac')});
    g.appendChild(txt(el('text', {x: x, y: y - 7, class: 'rm-txt xs up dim'}), label));
    g.appendChild(el('rect', {x: x, y: y, width: w, height: 7, rx: 3.5, class: 'rm-gbg'}));
    var fill = el('rect', {x: x, y: y, width: 0, height: 7, rx: 3.5, class: 'rm-gfg'});
    g.appendChild(fill);
    var val = txt(el('text', {x: x + w + 8, y: y + 7, class: 'rm-txt xs mono'}), '');
    g.appendChild(val);
    var node = this.add(g);
    node.setFrac = function (f, label2) {
      fill.setAttribute('width', Math.max(0, Math.min(1, f)) * w);
      if (label2 != null) txt(val, label2);
    };
    return node;
  };

  Stage.prototype.dial = function (cx, cy, r, o) {
    o = o || {};
    var C = 2 * Math.PI * r;
    var g = el('g', {class: 't-' + (o.tone || 'mod')});
    g.appendChild(el('circle', {cx: cx, cy: cy, r: r, class: 'rm-dbg'}));
    var arc = el('circle', {cx: cx, cy: cy, r: r, class: 'rm-dfg',
                            transform: 'rotate(-90 ' + cx + ' ' + cy + ')'});
    arc.style.strokeDasharray = C.toFixed(1);
    arc.style.strokeDashoffset = C.toFixed(1);
    g.appendChild(arc);
    var val = txt(el('text', {x: cx, y: cy + 6, 'text-anchor': 'middle', class: 'rm-txt bold mono'}), '');
    g.appendChild(val);
    if (o.label) {
      g.appendChild(txt(el('text', {x: cx, y: cy + r + 18, 'text-anchor': 'middle',
                                    class: 'rm-txt xs up dim'}), o.label));
    }
    var node = this.add(g);
    node.setFrac = function (f, label2) {
      arc.style.strokeDashoffset = (C * (1 - Math.max(0, Math.min(1, f)))).toFixed(1);
      if (label2 != null) txt(val, label2);
    };
    return node;
  };

  /* A console that writes lines: typed output, traces, logs. */
  Stage.prototype.term = function (x, y, w, h, o) {
    o = o || {};
    var g = el('g', {class: 't-' + (o.tone || 'ok')});
    g.appendChild(el('rect', {x: x, y: y, width: w, height: h, rx: 6, class: 'rm-term'}));
    g.appendChild(el('rect', {x: x, y: y, width: w, height: 20, rx: 6, class: 'rm-termtop'}));
    g.appendChild(txt(el('text', {x: x + 10, y: y + 14, class: 'rm-txt xs mono bold'}), o.title || ''));
    var node = this.add(g), rows = [];
    (o.lines || []).forEach(function (line, i) {
      var t = el('text', {x: x + 12, y: y + 38 + i * (o.lh || 17),
                          class: 'rm-txt xs mono t-' + (line.tone || o.tone || 'ok') +
                                 (line.dim ? ' dim' : '')});
      txt(t, line.text == null ? line : line.text);
      rows.push(this.add(t));
    }, this);
    node.rows = rows;
    node.row = function (i) { return rows[i]; };
    return node;
  };

  /* A trace waterfall: one bar per span, addressable. */
  Stage.prototype.waterfall = function (x, y, w, o) {
    o = o || {};
    var rh = o.rh || 22, spans = o.spans || [];
    var total = o.total || spans.reduce(function (m, s) { return Math.max(m, s.at + s.len); }, 1);
    var g = el('g', {class: 't-dim'});
    var bars = [];
    g.appendChild(el('line', {x1: x + 150, y1: y - 10, x2: x + w, y2: y - 10, class: 'rm-hairline'}));
    spans.forEach(function (sp, i) {
      var by = y + i * rh;
      var bg = el('g', {class: 't-' + (sp.tone || 'mac')});
      bg.appendChild(txt(el('text', {x: x, y: by + 11, class: 'rm-txt xs mono dim'}), sp.name));
      bg.appendChild(el('rect', {x: x + 150 + (sp.at / total) * (w - 150), y: by,
                                 width: Math.max(2, (sp.len / total) * (w - 150)), height: rh - 8,
                                 rx: 2, class: 'rm-span'}));
      bg.appendChild(txt(el('text', {x: x + w, y: by + 11, 'text-anchor': 'end',
                                     class: 'rm-txt xs mono'}), sp.cost || ''));
      bars.push(bg);
    });
    var node = this.group(bars);
    node.bars = bars;
    node.bar = function (i) { return bars[i]; };
    return node;
  };

  /* An entity graph: nodes and edges, both addressable, for multi-hop. */
  Stage.prototype.graph = function (o) {
    o = o || {};
    var nodes = {}, edges = {};
    var ng = [], eg = [];
    (o.edges || []).forEach(function (e) {
      var a = o.nodes[e[0]], b = o.nodes[e[1]];
      var g = el('g', {class: 't-' + (e[2] || 'dim')});
      g.appendChild(el('line', {x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'rm-edge'}));
      if (e[3]) {
        g.appendChild(txt(el('text', {x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - 6,
                                      'text-anchor': 'middle', class: 'rm-txt xs mono dim'}), e[3]));
      }
      edges[e[0] + '>' + e[1]] = this.add(g);
      eg.push(g);
    }, this);
    Object.keys(o.nodes).forEach(function (key) {
      var p = o.nodes[key];
      var g = el('g', {class: 't-' + (p[2] || 'mac')});
      g.appendChild(el('circle', {cx: p[0], cy: p[1], r: p[3] || 9, class: 'rm-gnode'}));
      g.appendChild(txt(el('text', {x: p[0], y: p[1] - (p[3] || 9) - 8, 'text-anchor': 'middle',
                                    class: 'rm-txt xs bold'}), p[4] || key));
      nodes[key] = this.add(g);
      ng.push(g);
    }, this);
    return {node: function (k) { return nodes[k]; }, edge: function (a, b) { return edges[a + '>' + b]; },
            nodes: nodes, edges: edges};
  };

  /* --- the timeline ----------------------------------------------------- */

  function applyStep(stage, step, i, n) {
    (step.out || []).forEach(function (e) { e.classList.remove('on'); });
    (step.in || []).forEach(function (e, k) {
      var d = (k * 70) + 'ms';
      e.style.transitionDelay = d;
      e.style.animationDelay = d;
      e.classList.add('on');
    });
    (step.move || []).forEach(function (m) {
      m[0].style.transform = 'translate(' + m[1] + 'px,' + m[2] + 'px)';
    });
    (step.pulse || []).forEach(function (e) {
      e.classList.remove('ping');
      if (e.getBoundingClientRect) e.getBoundingClientRect();
      e.classList.add('ping');
    });
    (step.cls || []).forEach(function (c) { c[0].classList.add(c[1]); });
    (step.decls || []).forEach(function (c) { c[0].classList.remove(c[1]); });
    (step.set || []).forEach(function (s) { s[0].setFrac(s[1], s[2]); });
    (step.text || []).forEach(function (t) {
      var target = t[0].querySelector ? (t[0].querySelector('text') || t[0]) : t[0];
      target.textContent = t[1];
    });
    (step.read || []).forEach(function (r) { stage.readout(r[0], r[1]); });
    if (stage._tick) stage._tick.textContent = (i + 1) + ' / ' + n;
    if (stage._prog) stage._prog.setAttribute('width', Math.round(900 * (i + 1) / n));
  }

  function reset(stage, steps) {
    stage.els.forEach(function (e) {
      e.classList.remove('on');
      e.classList.remove('ping');
      e.style.transform = '';
      e.style.transitionDelay = '';
      e.style.animationDelay = '';
    });
    steps.forEach(function (s) {
      (s.cls || []).forEach(function (c) { c[0].classList.remove(c[1]); });
      (s.set || []).forEach(function (x) { x[0].setFrac(0, ''); });
    });
    if (stage._prog) stage._prog.setAttribute('width', 0);
  }

  var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * render(host, id, lang, opts) -> {replay, stop, steps}
   *   opts.still   draw the end state once, no timers (the door's screen)
   *   opts.loop    restart after the last step
   *   opts.onNote  called with the caption of each step
   *
   * With reduced motion, every step is applied at once: the end state is the
   * one that carries the information.
   */
  function render(host, id, lang, opts) {
    opts = opts || {};
    host.textContent = '';
    var def = scenes[id];
    if (!def) return {replay: function () {}, stop: function () {}, steps: []};
    var stage = new Stage(host, {still: opts.still, code: def.code ? ('DAY ' + def.code) : '',
                                 volume: def.volume || '', hud: def.hud || ''});
    var steps = def.build(stage, lang) || [];
    var timers = [];

    function note(step) {
      if (step && step.note && opts.onNote) opts.onNote(step.note[lang] || step.note.en || '');
    }

    function stop() { timers.forEach(clearTimeout); timers = []; }

    function run() {
      stop();
      reset(stage, steps);
      if (reduced || opts.still) {
        steps.forEach(function (s, i) { applyStep(stage, s, i, steps.length); });
        note(steps[steps.length - 1]);
        return;
      }
      steps.forEach(function (step, i) {
        timers.push(setTimeout(function () {
          applyStep(stage, step, i, steps.length);
          note(step);
        }, step.at || 0));
      });
      var last = steps.reduce(function (m, s) { return Math.max(m, s.at || 0); }, 0);
      timers.push(setTimeout(function () {
        if (opts.onEnd) opts.onEnd();
        if (opts.loop) timers.push(setTimeout(run, 2200));
      }, last + 600));
    }

    run();
    return {replay: run, stop: stop, steps: steps, stage: stage};
  }

  global.Advent = {
    scene: function (id, def) { scenes[id] = def; },
    scenes: scenes,
    render: render,
    reduced: reduced,
    W: W, H: H, BOX: BOX
  };
})(window);
