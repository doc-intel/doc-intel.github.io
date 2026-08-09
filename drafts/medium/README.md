# drafts/medium — provisional Medium-import HTML

**These files are provisional.** They exist only so the articles can be imported
into Medium via `https://medium.com/p/import`, then they can be deleted. This is
not permanent site content. The real presentation-site source lives in the `rag`
repo under `case_studies/github_page`; this repo is a disposable deploy target
and its git history carries no value (force-push is fine).

## What each file is

`<stem>.html` is one Vol.1 article rendered for Medium import (William-Chong
template: decoy `og:title`, kicker + title + subtitle, featured image injected,
per-article watermark). `<stem>/img/` holds its images. Generated from
`rag/book_1/en_medium/<stem>.qmd`.

## How they are generated (from the `rag` repo root)

```bash
python scripts/render/publish_medium_william_template.py \
    book_1/en_medium/<stem>.qmd \
    --out <this-repo>/drafts/medium/<stem>.html \
    --images-base https://doc-intel.github.io/drafts/medium/<stem>/img
# then copy <stem>/*.jpg and the referenced ../_figures/*.png into <stem>/img/
```

## Import workflow

1. In the en_medium outline (`rag/book_1/en_medium/_rendered/00_outline.html`),
   each ready article has an **Import** column with a "copy URL" button.
2. Paste the URL at `https://medium.com/p/import`, Import.
3. In the Medium editor: set the real title, apply Kicker + Subtitle styles,
   pick the featured image, add captions, tags, submit to the publication.
4. Record the resulting Medium URL in `rag/ARTICLE_LINKS.md` (Medium column).

Articles already live on Medium are not staged here (no import button).
