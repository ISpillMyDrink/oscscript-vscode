function tokenizeLine(line) {
  const tokens = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (quote) {
      current += ch;
      if (ch === quote && line[i - 1] !== '\\') {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      if (current) {
        tokens.push(current);
      }
      current = ch;
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += ch;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

function tokenizeLineWithRanges(line) {
  const tokens = [];
  let current = '';
  let currentStart = -1;
  let quote = null;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (quote) {
      current += ch;
      if (ch === quote && line[i - 1] !== '\\') {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      if (!current) {
        currentStart = i;
      }
      current += ch;
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push({ text: current, start: currentStart, end: i });
        current = '';
        currentStart = -1;
      }
      continue;
    }

    if (!current) {
      currentStart = i;
    }
    current += ch;
  }

  if (current) {
    tokens.push({ text: current, start: currentStart, end: line.length });
  }

  return tokens;
}

function firstNonWhitespaceIndex(line) {
  for (let i = 0; i < line.length; i += 1) {
    if (!/\s/.test(line[i])) {
      return i;
    }
  }
  return -1;
}

function findInlineCommentIndex(line) {
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (quote) {
      if (ch === quote && line[i - 1] !== '\\') {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }

    if (ch === '#') {
      return i;
    }
  }

  return -1;
}

function stripSurroundingQuotes(value) {
  if (!value || value.length < 2) {
    return value;
  }
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

module.exports = {
  findInlineCommentIndex,
  firstNonWhitespaceIndex,
  stripSurroundingQuotes,
  tokenizeLine,
  tokenizeLineWithRanges
};
