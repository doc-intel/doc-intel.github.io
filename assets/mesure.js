// Google Analytics 4, loaded by every page of the site (build.py) and by the calendar (/advent/).
// The measurement ID of the GA4 property goes here, and only here; empty, nothing is loaded.
(function () {
  var ID = "G-0YDHDR4FWW";
  if (!ID || location.protocol === "file:") return;
  var s = document.createElement("script");
  s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", ID, { anonymize_ip: true });
})();
