#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build the bilingual site from _src/ into per-language folders /fr and /en.

Why: one URL per language is the SEO-correct shape (distinct, monolingual pages
with hreflang alternates), instead of a single page toggled by ?lang=. Edit the
bilingual sources in _src/, then run `python build.py` and commit.

Outputs:
  /fr/*.html, /fr/cas/*.html   (French, monolingual)
  /en/*.html, /en/cas/*.html   (English, monolingual)
  /index.html                  (root: language redirect + hreflang)
  /sitemap.xml, /robots.txt
"""
import os, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "_src"
BASE = "https://doc-intel.github.io"
OG_IMAGE = BASE + "/assets/img/electron/electron-pipeline.png"

TOP = ["index.html", "articles.html", "apps.html"]
FR_CASES = ["assistant-assurance", "emprunteur-comparison", "mrh-comparison", "prevoyance-comparison", "mutuelle-comparison",
            "mrh-qa", "mrh-agentic", "claims-sql-agent", "claim-declaration", "compliance-check", "regulatory-summary",
            "funds-chatbot", "version-diff", "claims-etl", "reinsurance-slips", "translation", "anonymisation", "table-diff-fr", "proofreading-fr", "classification",
            "rib-fraude", "photo-fraude", "contexte-360", "contrats-360", "assistant-agents", "souscription-chatbot"]
EN_CASES = ["flood-agentic", "cv-parsing", "invoice-fraud", "pii-redaction",
            "proofreading", "table-diff", "paper-summary",
            "homeowners-qa", "claims-query", "claim-chat", "claims-ingest", "paper-redline", "abstract-translation", "policy-comparison", "assistant-hr", "candidate-query", "job-posting",
            "assistant-assurance", "assistant-agents", "contexte-360", "contrats-360", "souscription-chatbot"]
CASES = {"fr": FR_CASES, "en": EN_CASES}

# slug -> business domain, parsed from the index cards, so a case page's "back"
# link can return to the index already filtered on that domain.
def _domain_map():
    src = (SRC / "cas" / "index.html").read_text(encoding="utf-8")
    out = {}
    for a in re.finditer(r'<a class="card" href="([^"/]+)\.html"[^>]*data-domaine="([^"]+)"', src):
        out[a.group(1)] = a.group(2)
    return out

DOMAIN_OF = _domain_map()

# Per-language SEO for the generated (bilingual-source) pages.
SEO = {
    "index.html": {
        "fr": ("Enterprise Document Intelligence : le RAG sur de vrais documents",
               "Construire le RAG d'entreprise brique par brique, d'un PDF a l'echelle du corpus. Articles, apps et etudes de cas sur documents publics."),
        "en": ("Enterprise Document Intelligence: RAG on real documents",
               "Build enterprise RAG brick by brick, from a single PDF to corpus scale. Articles, apps and real case studies on public documents."),
    },
    "articles.html": {
        "fr": ("Articles RAG, Volume 1 - Enterprise Document Intelligence",
               "Toute la serie, brique par brique. Parsing de la question et retrieval : les articles publies, chacun vers l'article complet."),
        "en": ("RAG articles, Volume 1 - Enterprise Document Intelligence",
               "The whole series, brick by brick. Question parsing and retrieval: the published articles, each linking to the full piece."),
    },
    "apps.html": {
        "fr": ("Apps - Enterprise Document Intelligence",
               "Le moteur de RAG documentaire dans de vraies interfaces : une app bureau Electron qui indexe un dossier et repond, et des demos web ShipAI."),
        "en": ("Apps - Enterprise Document Intelligence",
               "The document-intelligence engine in real interfaces: an Electron desktop app that indexes a folder and answers, and ShipAI web demos."),
    },
    "cas/index.html": {
        "fr": ("Etudes de cas - Enterprise Document Intelligence",
               "La methode RAG sur des cas reels : comparaison de contrats, extraction, recherche agentique, diff de versions, ETL. Documents publics."),
        "en": ("Case studies - Enterprise Document Intelligence",
               "The RAG method on real cases: contract comparison, extraction, agentic search, version diffing, ETL. Public documents."),
    },
}

OTHER = {"fr": "en", "en": "fr"}


def monolingual(html: str, lang: str) -> str:
    other = OTHER[lang]
    # remove the other language's spans entirely
    html = re.sub(r'<span class="' + other + r'(?: blk)?">.*?</span>', "", html, flags=re.S)
    # unwrap the kept language's spans
    html = re.sub(r'<span class="' + lang + r'(?: blk)?">(.*?)</span>', r'\1', html, flags=re.S)
    return html


def toggle_html(lang: str, fr_href: str, en_href: str) -> str:
    fr_cls = ' class="active"' if lang == "fr" else ""
    en_cls = ' class="active"' if lang == "en" else ""
    return ('<div class="lang" role="group" aria-label="language">\n'
            '      <a href="' + fr_href + '"' + fr_cls + '>FR</a>\n'
            '      <a href="' + en_href + '"' + en_cls + '>EN</a>\n'
            '    </div>')


TOGGLE_RE = re.compile(r'<div class="lang" role="group"[^>]*>.*?</div>', re.S)


def canonical_path(rel: str, lang: str) -> str:
    if rel == "index.html":
        return "/%s/" % lang
    if rel == "cas/index.html":
        return "/%s/cas/" % lang
    return "/%s/%s" % (lang, rel)


def seo_head(rel: str, lang: str, title: str, desc: str, has_counterpart: bool) -> str:
    url = BASE + canonical_path(rel, lang)
    lines = ['<link rel="canonical" href="%s">' % url]
    if has_counterpart:
        lines.append('<link rel="alternate" hreflang="fr" href="%s">' % (BASE + canonical_path(rel, "fr")))
        lines.append('<link rel="alternate" hreflang="en" href="%s">' % (BASE + canonical_path(rel, "en")))
        lines.append('<link rel="alternate" hreflang="x-default" href="%s">' % (BASE + canonical_path(rel, "en")))
    else:
        lines.append('<link rel="alternate" hreflang="%s" href="%s">' % (lang, url))
        lines.append('<link rel="alternate" hreflang="x-default" href="%s">' % url)
    locale = "fr_FR" if lang == "fr" else "en_US"
    lines += [
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="Enterprise Document Intelligence">',
        '<meta property="og:locale" content="%s">' % locale,
        '<meta property="og:title" content="%s">' % title,
        '<meta property="og:description" content="%s">' % desc,
        '<meta property="og:url" content="%s">' % url,
        '<meta property="og:image" content="%s">' % OG_IMAGE,
        '<meta name="twitter:card" content="summary_large_image">',
        '<meta name="twitter:title" content="%s">' % title,
        '<meta name="twitter:description" content="%s">' % desc,
        '<meta name="twitter:image" content="%s">' % OG_IMAGE,
    ]
    return "\n".join(lines)


# Set the saved theme before first paint (no flash); absence -> CSS follows the OS.
THEME_INIT = ('<script>(function(){try{var t=localStorage.getItem("edi-theme");'
              'if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>')


def set_head(html: str, title: str, desc: str, seo_block: str) -> str:
    if title is not None:
        html = re.sub(r'<title>.*?</title>', '<title>' + title + '</title>', html, count=1, flags=re.S)
    if desc is not None:
        html = re.sub(r'<meta name="description" content=".*?">',
                      '<meta name="description" content="' + desc + '">', html, count=1, flags=re.S)
    html = html.replace('</head>', seo_block + '\n' + THEME_INIT + '\n</head>', 1)
    return html


def fix_assets(html: str, depth: int) -> str:
    # sources: top-level use "assets/", cas use "../assets/"
    if depth == 1:
        html = html.replace('href="assets/', 'href="../assets/').replace('src="assets/', 'src="../assets/')
    elif depth == 2:
        html = html.replace('href="../assets/', 'href="../../assets/').replace('src="../assets/', 'src="../../assets/')
    return html


def add_new_tab(html: str) -> str:
    # external links (TDS articles, GitHub, Ko-fi) open in a new tab
    return re.sub(r'(<a\b(?![^>]*\btarget=)[^>]*href="https?://[^"]*")',
                  r'\1 target="_blank" rel="noopener noreferrer"', html)


def set_lang(html: str, lang: str) -> str:
    html = re.sub(r'<html lang="[^"]*">', '<html lang="%s">' % lang, html, count=1)
    html = re.sub(r'<body class="lang-(?:fr|en)"[^>]*>', '<body class="lang-%s">' % lang, html, count=1)
    return html


def localize_cards(html: str, lang: str) -> str:
    """Show EVERY case on both indexes (the catalog is bilingual via .fr/.en
    spans). A case PAGE only exists in its origin language, so a card whose
    origin differs from the page language deep-links to the origin-language
    folder and gets a small origin badge (e.g. 'EN' on the French index)."""
    def fix(m):
        block = m.group(0)
        mm = re.search(r'data-lang="([^"]*)"', block)
        card_lang = (mm.group(1).strip() if mm else lang)
        if lang not in card_lang:
            # cross-language: point at the origin-language page + tag the card
            block = re.sub(r'(class="card)(" href=")([^"/]+\.html")',
                           r'\1 xlang\2../../%s/cas/\3' % card_lang, block, count=1)
            badge = '<span class="olang">%s</span>' % card_lang.upper()
            block = re.sub(r'(<a class="card[^>]*>)', r'\1' + badge, block, count=1)
        # strip the now-useless data-item/data-lang attrs
        block = re.sub(r'\s*data-item\s+data-lang="[^"]*"', "", block)
        return block
    return re.sub(r'<a class="card"[^>]*data-item[^>]*>.*?</a>', fix, html, flags=re.S)


def write(path: pathlib.Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def build_top(rel: str, lang: str):
    src = (SRC / rel).read_text(encoding="utf-8")
    html = monolingual(src, lang)
    html = set_lang(html, lang)
    other = OTHER[lang]
    fr_href = rel if lang == "fr" else "../fr/" + rel
    en_href = rel if lang == "en" else "../en/" + rel
    html = TOGGLE_RE.sub(toggle_html(lang, fr_href, en_href), html, count=1)
    html = fix_assets(html, depth=1)
    title, desc = SEO[rel][lang]
    html = set_head(html, title, desc, seo_head(rel, lang, title, desc, has_counterpart=True))
    html = add_new_tab(html)
    write(ROOT / lang / rel, html)


def build_cas_index(lang: str):
    rel = "cas/index.html"
    src = (SRC / rel).read_text(encoding="utf-8")
    html = monolingual(src, lang)
    html = localize_cards(html, lang)
    html = set_lang(html, lang)
    fr_href = "index.html" if lang == "fr" else "../../fr/cas/index.html"
    en_href = "index.html" if lang == "en" else "../../en/cas/index.html"
    html = TOGGLE_RE.sub(toggle_html(lang, fr_href, en_href), html, count=1)
    html = fix_assets(html, depth=2)
    title, desc = SEO[rel][lang]
    html = set_head(html, title, desc, seo_head(rel, lang, title, desc, has_counterpart=True))
    html = add_new_tab(html)
    write(ROOT / lang / "cas" / "index.html", html)


def build_case(name: str, lang: str):
    rel = "cas/%s.html" % name
    both = name in FR_CASES and name in EN_CASES
    # per-language source override: a `<slug>.<lang>.html` twin (hand-localised, not a
    # literal translation) wins over the base file for that language.
    lang_src = SRC / "cas" / ("%s.%s.html" % (name, lang))
    src = (lang_src if lang_src.exists() else (SRC / rel)).read_text(encoding="utf-8")
    # make the "back" links return to the index filtered on this case's domain
    dom = DOMAIN_OF.get(name)
    if dom:
        q = "index.html?d=%s" % dom
        src = src.replace('class="crumbs"><a href="index.html"', 'class="crumbs"><a href="%s"' % q)
        src = src.replace('<a href="index.html"><span class="fr">← Autres cas', '<a href="%s"><span class="fr">← Autres cas' % q)
        src = src.replace('<a href="index.html">← Autres cas', '<a href="%s">← Autres cas' % q)
    html = monolingual(src, lang)
    html = html.replace(' data-fixed-lang="%s"' % lang, "").replace(' data-fixed-lang="fr"', "").replace(' data-fixed-lang="en"', "")
    html = set_lang(html, lang)
    # the language toggle points to the counterpart page when the case exists in both
    # languages, otherwise to the other language's case index.
    fr_href = "%s.html" % name if lang == "fr" else ("../../fr/cas/%s.html" % name if both else "../../fr/cas/index.html")
    en_href = "%s.html" % name if lang == "en" else ("../../en/cas/%s.html" % name if both else "../../en/cas/index.html")
    html = TOGGLE_RE.sub(toggle_html(lang, fr_href, en_href), html, count=1)
    html = fix_assets(html, depth=2)
    # keep the page's own title/description; add SEO block (hreflang alternates if bilingual)
    mt = re.search(r'<title>(.*?)</title>', html, re.S)
    md = re.search(r'<meta name="description" content="(.*?)">', html, re.S)
    title = mt.group(1) if mt else None
    desc = md.group(1) if md else None
    html = set_head(html, None, None, seo_head(rel, lang, title or "", desc or "", has_counterpart=both))
    html = add_new_tab(html)
    write(ROOT / lang / "cas" / ("%s.html" % name), html)


def build_root():
    html = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Enterprise Document Intelligence: RAG on real documents</title>
<meta name="description" content="Build enterprise RAG brick by brick, from a single PDF to corpus scale. Articles, apps and real case studies on public documents.">
<link rel="canonical" href="%(base)s/en/">
<link rel="alternate" hreflang="fr" href="%(base)s/fr/">
<link rel="alternate" hreflang="en" href="%(base)s/en/">
<link rel="alternate" hreflang="x-default" href="%(base)s/en/">
<script>
  // English is the default landing; French visitors can switch below or via the toggle.
  location.replace('en/');
</script>
<meta http-equiv="refresh" content="0; url=en/">
</head>
<body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:40rem;margin:12vh auto;padding:0 1.5rem;color:#0f172a">
  <h1 style="font-weight:800;letter-spacing:-.02em">Enterprise Document Intelligence</h1>
  <p style="color:#475569">Choose your language / Choisissez votre langue :</p>
  <p><a href="fr/">Francais</a> &middot; <a href="en/">English</a></p>
</body>
</html>
""" % {"base": BASE}
    write(ROOT / "index.html", html)


def build_sitemap():
    urls = []
    for rel in TOP:
        for lang in ("fr", "en"):
            urls.append(BASE + canonical_path(rel, lang))
    for lang in ("fr", "en"):
        urls.append(BASE + canonical_path("cas/index.html", lang))
        for name in CASES[lang]:
            urls.append(BASE + "/%s/cas/%s.html" % (lang, name))
    body = "\n".join('  <url><loc>%s</loc></url>' % u for u in urls)
    xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + body + "\n</urlset>\n")
    write(ROOT / "sitemap.xml", xml)
    write(ROOT / "robots.txt",
          "User-agent: *\nAllow: /\nDisallow: /_src/\n\nSitemap: %s/sitemap.xml\n" % BASE)


def main():
    for lang in ("fr", "en"):
        for rel in TOP:
            build_top(rel, lang)
        build_cas_index(lang)
        for name in CASES[lang]:
            build_case(name, lang)
    build_root()
    build_sitemap()
    print("built /fr and /en, root redirect, sitemap.xml, robots.txt")


if __name__ == "__main__":
    main()
