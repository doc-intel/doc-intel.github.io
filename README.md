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

The site currently features the two core bricks of the pipeline. Each links to the full article.

**Brick 2 · Question parsing**

- 6A · [Parse the question before you search](https://towardsdatascience.com/question-parsing-in-rag-structure-before-you-search/)
- 6B · [Five fields RAG should extract from any question](https://towardsdatascience.com/what-the-question-parser-extracts-from-a-user-string-keywords-scope-shape-decomposition-clarification/)
- 6C · [One parsed question, four decisions](https://towardsdatascience.com/dispatching-the-parsed-rag-question-chunk-strategy-model-tier-activations-audit/)

**Brick 3 · Retrieval**

- 7A · [Retrieval is filtering, not search](https://towardsdatascience.com/retrieval-is-filtering-not-search-a-mental-model-for-enterprise-rag/)
- 7B · [Finding the right anchors for RAG](https://towardsdatascience.com/anchor-detection-for-rag-parallel-detectors-then-one-llm-call-at-the-end/)
- 7C · [An LLM as arbiter in RAG retrieval](https://towardsdatascience.com/letting-an-llm-pick-the-right-rag-page-the-arbiter-pattern-at-the-end-of-retrieval/)

Full series: <https://towardsdatascience.com/author/angela-shi/>

## Assets

- `assets/site.css` : shared styles.
- `assets/site.js` : language toggle (FR / EN, remembered in `localStorage`) and small UI behaviour.

## Language

Every top-level page carries both FR and EN text; the toggle in the header switches between them. Case studies are presented in their original language and filterable by language on the index.

## Local preview

Open `index.html` in a browser. No server required.

Written by Angela &amp; Kezhan Shi.
