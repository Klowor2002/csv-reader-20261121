// A faster drop-in for csv-reader 1.0.0 (make.fun's own reference reader): run(input) returns, for every input
// {text, header}, exactly csv-reader's answer {columns, rows, errors} — the same broken-row policy, byte for byte:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled ("" inside it is one quote, and
//     each CRLF or lone CR inside it is read as LF); what follows its closing quote, up to the next comma or line
//     break, is appended as it stands (quote_junk, when the field ends); a quote that never closes is a literal
//     character and the text after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the records after it (every record
//     when header is false), each padded with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record starts on (every LF, CRLF and lone CR
//     inside a quoted field counted), row its record's index in rows (null for the header), in the order met.
//
// Where the reference reads one character at a time and builds each field a character at a time, this reader walks
// the text with one forward regex scan over the four characters that can matter ( , " LF CR ) and cuts each field
// out with slice, so plain fields cost one scan step and one slice each. The reading logic mirrors the reference
// branch for branch; only the mechanics differ. Pure: no clock, no randomness, nothing kept from one call to the
// next (the scan state lives in locals of run).

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input {text, header}: {columns, rows, errors}. */
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
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // One forward scan for every character that can end or mark a field. lastIndex is set at each read's start, so
  // the scan only ever moves forward over the text.
  const scan = /[",\n\r]/g;

  // The field being read, reused across reads (a read never nests inside another's pending result): its value,
  // how it ended, and how many characters the unquoted tail kept (for quote_junk).
  const F = { value: '', ended: END, added: 0 };

  // Reads unquoted characters onto `prefix` up to the next comma or line break: a CR not followed by LF is
  // dropped (stray_cr). Sets F.
  function readUnquoted(prefix) {
    let value = prefix;
    let added = 0;
    let seg = pos; // the start of the stretch not yet cut into value
    scan.lastIndex = pos;
    let m;
    while ((m = scan.exec(text)) !== null) {
      const i = m.index;
      const c = m[0];
      if (c === ',') {
        F.value = value + text.slice(seg, i);
        F.ended = COMMA;
        F.added = added + (i - seg);
        pos = i + 1;
        return;
      }
      if (c === '\n') {
        F.value = value + text.slice(seg, i);
        F.ended = LINE_BREAK;
        F.added = added + (i - seg);
        pos = i + 1;
        line += 1;
        return;
      }
      if (c === '\r') {
        if (text.charCodeAt(i + 1) === 10) {
          F.value = value + text.slice(seg, i);
          F.ended = LINE_BREAK;
          F.added = added + (i - seg);
          pos = i + 2;
          line += 1;
          return;
        }
        // A stray CR: the stretch before it is kept, the CR is dropped, the field goes on.
        value += text.slice(seg, i);
        added += i - seg;
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        seg = i + 1;
        continue;
      }
      // A quote inside an unquoted field is a literal character: the stretch stays open.
    }
    F.value = value + text.slice(seg);
    F.ended = END;
    F.added = added + (n - seg);
    pos = n;
  }

  // Reads a quoted field whose opening quote is at pos. Sets F. The value is gathered as parts and joined once
  // when the field closes, not built up a stretch at a time: a quoted field with many doubled quotes or line
  // breaks (the generator's notes and phrases) would otherwise grow a chain of intermediate strings.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    const parts = [];
    pos += 1;
    let seg = pos;
    scan.lastIndex = pos;
    let closed = false;
    let m;
    while ((m = scan.exec(text)) !== null) {
      const i = m.index;
      const c = m[0];
      if (c === '"') {
        if (text.charCodeAt(i + 1) === 34) {
          // A doubled quote is one quote; the pair is consumed whole.
          parts.push(text.slice(seg, i), '"');
          seg = i + 2;
          scan.lastIndex = seg;
          continue;
        }
        parts.push(text.slice(seg, i));
        pos = i + 1;
        closed = true;
        break;
      }
      if (c === '\r') {
        // CRLF and a lone CR inside quotes are each one LF.
        parts.push(text.slice(seg, i), '\n');
        line += 1;
        seg = text.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
        scan.lastIndex = seg;
        continue;
      }
      if (c === '\n') {
        parts.push(text.slice(seg, i), '\n');
        line += 1;
        seg = i + 1;
        continue;
      }
      // A comma inside quotes is a literal character: the stretch stays open.
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted
      // (the parts gathered above are discarded, exactly as the reference discards its reading).
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      readUnquoted('"');
      return;
    }
    const value = parts.length === 1 ? parts[0] : parts.join('');
    if (pos >= n) {
      F.value = value;
      F.ended = END;
      F.added = 0;
      return;
    }
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      F.value = value;
      F.ended = COMMA;
      F.added = 0;
      return;
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      F.value = value;
      F.ended = LINE_BREAK;
      F.added = 0;
      return;
    }
    if (c === '\r' && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      F.value = value;
      F.ended = LINE_BREAK;
      F.added = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    readUnquoted(value);
    if (F.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text[pos];
      if (c === '\n') {
        pos += 1;
        line += 1;
      } else if (c === '\r' && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text[pos] === '"';
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(F.value);
    } while (F.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
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
