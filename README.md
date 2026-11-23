# doc-intel.github.io

Static site for **Enterprise Document Intelligence**, a series on building enterprise RAG on real documents, brick by brick.

Bilingual (FR / EN). Plain HTML + CSS + JS, no build step.

## Pages

- `index.html` : home (series pitch, the four bricks, the stance, the volume roadmap, apps).
- `articles.html` : the published articles, grouped by theme, each linking to the full article.
- `apps.html` : ShipAI web demos and the Electron desktop app.
- `cas/index.html` : case studies (French and English, filterable).
- `cas/<slug>.html` : one page per case study.

## Articles

Every published article of the series, with its Medium link, is on the Articles page:
<https://doc-intel.github.io/en/articles.html>. All stories: <https://medium.com/@angela.shi>.

## Assets

- `assets/site.css` : shared styles.
- `assets/site.js` : language toggle (FR / EN, remembered in `localStorage`) and small UI behaviour.

## Language

Every top-level page carries both FR and EN text; the toggle in the header switches between them. Case studies are presented in their original language and filterable by language on the index.

## Local preview

Open `index.html` in a browser. No server required.

Written by Angela &amp; Kezhan Shi.
