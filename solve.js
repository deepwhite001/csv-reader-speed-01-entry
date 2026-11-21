// A fast, dependency-free reader for broken CSV, written to return exactly
// what csv-reader 1.0.0 returns for the same input: {columns, rows, errors}.
// One left-to-right pass over the text. Unquoted fields are found with a
// tight scan for the next comma / LF / CR and cut out with one slice each,
// so a field costs one string instead of one per character. Quoted fields
// jump from quote to quote with indexOf and only walk a span character by
// character when it holds a line break that must be counted or a CR that
// must become an LF.
//
// The broken-row policy, as the competition states it:
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it is one quote, and each CRLF or lone CR inside
//     it is read as LF; what follows its closing quote, up to the next comma
//     or line break, is appended as it stands (quote_junk, when the field
//     ends); a quote that never closes is a literal character, and the text
//     after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its field count) or cut (long_row,
//     with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met: line the 1-based
//     line its record starts on, counting every LF, CRLF and lone CR inside
//     quotes, and row its record's index in rows, null for the header.

const COMMA = 0;
const BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n !== 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Field readers below report their errors
  // against this record.
  let recordLine = 1;
  let recordRow = null;

  // readPlain's results, shared so it allocates nothing per field.
  let pv = '';
  let pe = 0;
  let pa = 0;
  let pn = 0;

  // Appends one span of a quoted field to `parts`, counting the line breaks
  // it holds and turning each CRLF or lone CR into one LF. A span with no
  // line break at all goes in whole, untouched.
  function pushSpan(parts, s) {
    if (s.length === 0) return;
    if (s.indexOf('\n') === -1 && s.indexOf('\r') === -1) {
      parts.push(s);
      return;
    }
    let start = 0;
    for (let k = 0; k < s.length; k++) {
      const c = s.charCodeAt(k);
      if (c === 13) {
        if (k > start) parts.push(s.slice(start, k));
        parts.push('\n');
        line++;
        if (s.charCodeAt(k + 1) === 10) k++;
        start = k + 1;
      } else if (c === 10) {
        if (k > start) parts.push(s.slice(start, k));
        parts.push('\n');
        line++;
        start = k + 1;
      }
    }
    if (start < s.length) parts.push(s.slice(start));
  }

  // Reads unquoted characters from `start`, starting from the value `init`,
  // up to the next comma or line break. A CR not followed by LF is dropped
  // (stray_cr) and the field goes on. The field lands in pv, how it ended
  // in pe, how many characters were kept after `init` in pa, and where
  // reading stops in pn.
  function readPlain(init, start) {
    let out = init;
    let added = 0;
    let seg = start; // start of the not-yet-copied stretch
    let p = start;
    for (;;) {
      let q = p;
      while (q < n) {
        const c = text.charCodeAt(q);
        if (c === 44 || (c < 14 && (c === 10 || c === 13))) break;
        q++;
      }
      if (q >= n) {
        if (q > seg) {
          out += text.slice(seg, q);
          added += q - seg;
        }
        pv = out; pe = END; pa = added; pn = n;
        return;
      }
      const c = text.charCodeAt(q);
      if (c === 44) {
        if (q > seg) {
          out += text.slice(seg, q);
          added += q - seg;
        }
        pv = out; pe = COMMA; pa = added; pn = q + 1;
        return;
      }
      if (c === 10) {
        if (q > seg) {
          out += text.slice(seg, q);
          added += q - seg;
        }
        line++;
        pv = out; pe = BREAK; pa = added; pn = q + 1;
        return;
      }
      if (text.charCodeAt(q + 1) === 10) {
        if (q > seg) {
          out += text.slice(seg, q);
          added += q - seg;
        }
        line++;
        pv = out; pe = BREAK; pa = added; pn = q + 2;
        return;
      }
      // A lone CR: report it, drop it, and carry on from just past it.
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (q > seg) {
        out += text.slice(seg, q);
        added += q - seg;
      }
      p = q + 1;
      seg = q + 1;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    let ended = COMMA;
    do {
      if (text.charCodeAt(pos) === 34) {
        // A field that opens with a quote.
        quoted = true;
        const open = pos;
        const openLine = line;
        const parts = [];
        let p = pos + 1;
        let closedAt = -1;
        for (;;) {
          const q = text.indexOf('"', p);
          if (q === -1) break;
          if (text.charCodeAt(q + 1) === 34) {
            // A doubled quote: one quote in the value, and onward.
            pushSpan(parts, text.slice(p, q));
            parts.push('"');
            p = q + 2;
            continue;
          }
          closedAt = q;
          pushSpan(parts, text.slice(p, q));
          break;
        }
        if (closedAt === -1) {
          // The quote never closes: it is a literal character, and the
          // text after it is read again as an unquoted field.
          line = openLine;
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          readPlain('"', open + 1);
          fields.push(pv);
          pos = pn;
          ended = pe;
          continue;
        }
        pos = closedAt + 1;
        const value = parts.length === 0 ? '' : parts.length === 1 ? parts[0] : parts.join('');
        if (pos >= n) {
          fields.push(value);
          ended = END;
        } else {
          const c = text.charCodeAt(pos);
          if (c === 44) {
            fields.push(value);
            pos++;
            ended = COMMA;
          } else if (c === 10) {
            fields.push(value);
            pos++;
            line++;
            ended = BREAK;
          } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
            fields.push(value);
            pos += 2;
            line++;
            ended = BREAK;
          } else {
            // What follows the closing quote is appended as it stands, up
            // to the next comma or line break.
            readPlain(value, pos);
            if (pa > 0) {
              errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
            }
            fields.push(pv);
            pos = pn;
            ended = pe;
          }
        }
      } else {
        quoted = false;
        readPlain('', pos);
        fields.push(pv);
        pos = pn;
        ended = pe;
      }
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
