// minify.mjs — token-aware JS compactor used by assemble.mjs (no dependencies).
// Strips every comment, collapses whitespace, and joins lines only where ASI cannot change meaning
// (previous token ends with { ( [ , ; = : ? & | ! ~ ^ % < > * or the next token starts with } ) ] , ; : ? or .ident).
// Strings, regex literals and template literals are copied verbatim (template newlines are preserved).
const W = /[A-Za-z0-9_$]/;
const KW_RE = /(?:^|[^A-Za-z0-9_$])(return|typeof|case|do|else|in|of|new|delete|void|throw|instanceof|yield|await)$/;
const JOIN_AFTER = '{([,;=:?&|!~^%<>*';
const JOIN_BEFORE = '}),];:?';
const BS = '\\';

export function minify(code) {
  let o = '', i = 0, pendingSpace = false, pendingNL = false;
  const n = code.length;
  const lastNonWs = () => { for (let k = o.length - 1; k >= 0; k--) if (o[k] !== ' ' && o[k] !== '\n') return o[k]; return ''; };
  const emit = (s) => {
    const a = o[o.length - 1] || '', b = s[0];
    if (pendingNL) {
      const join = !o.length || JOIN_AFTER.includes(a) || JOIN_BEFORE.includes(b) || (b === '.' && W.test(s[1] || '') && !/[0-9]/.test(s[1] || ''));
      if (!join) o += '\n';
      else if ((W.test(a) && W.test(b)) || (a === b && '+-/'.includes(a))) o += ' ';
    } else if (pendingSpace) {
      if ((W.test(a) && W.test(b)) || (a === b && '+-/'.includes(a)) || (a === '/' && b === '*')) o += ' ';
    }
    pendingNL = false; pendingSpace = false;
    o += s;
  };
  while (i < n) {
    const c = code[i], d = code[i + 1];
    if (c === '\n') { pendingNL = true; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿') { pendingSpace = true; i++; continue; }
    if (c === '/' && d === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const e = code.indexOf('*/', i + 2), body = code.slice(i, e < 0 ? n : e);
      i = e < 0 ? n : e + 2;
      if (body.includes('\n')) pendingNL = true; else pendingSpace = true;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && code[j] !== c) {
        if (code[j] === BS) j++;
        else if (c === '`' && code[j] === '$' && code[j + 1] === '{') throw new Error('minify: template substitution unsupported');
        else if (c !== '`' && code[j] === '\n') throw new Error('minify: unterminated string');
        j++;
      }
      emit(code.slice(i, j + 1)); i = j + 1; continue;
    }
    if (c === '/') {
      const p = lastNonWs(), tail = o.slice(-12);
      const isRe = p === '' || '(,=:[!&|?{};+-*%<>~^'.includes(p) || KW_RE.test(tail);
      if (isRe) {
        let j = i + 1, cls = false;
        while (j < n) {
          const ch = code[j];
          if (ch === BS) { j += 2; continue; }
          if (ch === '\n') throw new Error('minify: unterminated regex near ' + code.slice(i, i + 40));
          if (ch === '[') cls = true; else if (ch === ']') cls = false; else if (ch === '/' && !cls) break;
          j++;
        }
        j++;
        while (j < n && /[a-z]/.test(code[j])) j++;
        emit(code.slice(i, j)); i = j; continue;
      }
    }
    let j = i + 1;
    if (W.test(c)) { while (j < n && W.test(code[j])) j++; }
    emit(code.slice(i, j)); i = j;
  }
  return o.trim();
}
