// Enterprise Document Intelligence · shared site behaviour
// Pages are monolingual per-language (/fr, /en); language is chosen by URL, not JS.
(function () {
  // Light is the default; dark is opt-in via the toggle (we do not follow the OS).
  function resolved(){ return document.documentElement.getAttribute('data-theme') || 'light'; }
  function apply(t){
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    try { if (t) localStorage.setItem('edi-theme', t); else localStorage.removeItem('edi-theme'); } catch (e) {}
  }
  function paint(btn){
    var dark = resolved() === 'dark';
    btn.textContent = dark ? '☀' : '☾'; // sun when dark (click -> light), moon when light
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    btn.setAttribute('title', dark ? 'Light theme' : 'Dark theme');
  }
  document.addEventListener('DOMContentLoaded', function () {
    var top = document.getElementById('top');
    if (top) {
      var onScroll = function () { top.classList.toggle('scrolled', window.scrollY > 10); };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
    var lang = document.querySelector('header.top .lang');
    // Ko-fi: one cup in every header, written here once rather than in each page
    if (lang && !document.querySelector('.nav-kofi')) {
      var kofi = document.createElement('a');
      kofi.className = 'nav-kofi';
      kofi.href = 'https://ko-fi.com/angelashi';
      kofi.title = 'Ko-fi';
      kofi.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c-.6.8.6 1.7 0 2.5M12 3.5c-.6.8.6 1.7 0 2.5"/></svg><span>Ko-fi</span>';
      lang.parentNode.insertBefore(kofi, lang);
    }
    if (lang && !document.querySelector('.theme-tog')) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-tog';
      paint(btn);
      btn.addEventListener('click', function () {
        apply(resolved() === 'dark' ? 'light' : 'dark');
        paint(btn);
      });
      lang.parentNode.insertBefore(btn, lang);
    }

    // mobile menu: nav links are hidden on small screens, expose them via a hamburger
    var wrap = document.querySelector('header.top .wrap');
    var nav = document.querySelector('header.top .nav');
    if (wrap && nav && !document.querySelector('.menu-btn')) {
      var mb = document.createElement('button');
      mb.type = 'button';
      mb.className = 'menu-btn';
      mb.setAttribute('aria-label', 'Menu');
      mb.setAttribute('aria-expanded', 'false');
      mb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
      function setOpen(o){ nav.classList.toggle('open', o); mb.setAttribute('aria-expanded', o ? 'true' : 'false'); }
      mb.addEventListener('click', function (e) { e.stopPropagation(); setOpen(!nav.classList.contains('open')); });
      nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
      document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) setOpen(false); });
      window.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
      wrap.appendChild(mb);
    }

    // volumes: one sommaire at a time. The hash carries the choice, so a volume is a shareable
    // link (articles.html#vol-3) and the back button undoes one step. No JS: every panel shows.
    var vsw = document.querySelector('.vswitch');
    if (vsw) {
      var panels = [].slice.call(document.querySelectorAll('.vpanel'));
      var tabs = [].slice.call(vsw.querySelectorAll('.vtab'));
      var isVol = function (h) { return /^vol-\d+$/.test(h); };
      document.documentElement.setAttribute('data-vswitch', 'on');
      var show = function (id, writeHash) {
        if (!panels.some(function (p) { return p.id === id; })) id = panels.length ? panels[0].id : '';
        panels.forEach(function (p) { p.classList.toggle('on', p.id === id); });
        tabs.forEach(function (t) {
          var me = t.getAttribute('data-vol') === id;
          t.classList.toggle('active', me);
          t.setAttribute('aria-selected', me ? 'true' : 'false');
        });
        if (writeHash && location.hash.slice(1) !== id) {
          try { history.replaceState(null, '', '#' + id); } catch (e) { location.hash = id; }
        }
      };
      tabs.forEach(function (t) {
        t.addEventListener('click', function () { show(t.getAttribute('data-vol'), true); });
      });
      window.addEventListener('hashchange', function () {
        if (isVol(location.hash.slice(1))) show(location.hash.slice(1), false);
      });
      show(isVol(location.hash.slice(1)) ? location.hash.slice(1) : 'vol-1', false);
    }
  });
})();
