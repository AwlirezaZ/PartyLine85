# Party Line '85

A retro-futuristic interactive art world. A neon city is drawn by one unbroken beam of light, and touching any line plucks it like a string. Built with raw WebGL2 and Web Audio in a single HTML file, with no libraries.

**▶ Live site: https://awlirezaz.github.io/PartyLine85/**
(rebuilt and published by [.github/workflows/pages.yml](.github/workflows/pages.yml) on every push to `main`)

Published artifact: https://claude.ai/artifact/9RL398NPB6uBMYtCoxjzBj

## Files

| Path | What it is |
|---|---|
| `party-line-85.html` | The finished page, the same file that is published |
| `parts/` | Readable source: `ui.html` plus JS modules concatenated in filename order |
| `assemble.mjs`, `minify.mjs` | Build `parts/` into `party-line-85.html` |
| `serve.mjs` | Local preview server that wraps the page in the artifact host skeleton |
| `skeleton.mjs` | That page shell (doctype, head, body), shared by `serve.mjs` and `build-site.mjs` |
| `build-site.mjs` | Builds the GitHub Pages site: wraps the page into `_site/index.html` |
| `qa.mjs` | Headless-Chrome test harness (clicks, touches, keys, screenshots, console log) |
| `parts-v1/`, `party-line-85-v1.html` | Backup of the build from before the polish pass |
| `qa-*/` | Screenshots from the test runs |
| `docs/` | Build spec, interface contracts, judge verdicts, builder and integration reports |

## Commands

Build the page:

```bash
node assemble.mjs
```

Build an unminified page for debugging:

```bash
node assemble.mjs --debug
```

Preview at http://localhost:5173:

```bash
node serve.mjs party-line-85.html 5173
```
