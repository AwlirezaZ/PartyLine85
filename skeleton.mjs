// The page shell the Artifact host wraps around party-line-85.html (which has no doctype/html/head/body).
// Used by serve.mjs for local preview and by build-site.mjs for the GitHub Pages build.
export const head = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px/1.4 system-ui,sans-serif;background:#fafaf9}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body>`;

export const tail = '</body></html>';

/** Wraps the page fragment into a complete HTML document. */
export const wrap = (body) => head + body + tail;
