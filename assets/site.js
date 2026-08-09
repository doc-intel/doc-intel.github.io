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
  });
})();
