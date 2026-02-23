const fs = require('fs');
const vscode = require('vscode');
const { INCLUDE_COMMANDS } = require('../data/languageData');
const {
  findInlineCommentIndex,
  firstNonWhitespaceIndex,
  stripSurroundingQuotes,
  tokenizeLineWithRanges
} = require('./tokenize');
const { resolveIncludePath } = require('./includeGraph');

function getCodeTokens(line) {
  const commentIndex = findInlineCommentIndex(line);
  const firstCodeIndex = firstNonWhitespaceIndex(line);

  if (commentIndex === firstCodeIndex) {
    return [];
  }

  const tokens = tokenizeLineWithRanges(line);
  if (commentIndex < 0) {
    return tokens;
  }

  return tokens.filter((t) => t.start < commentIndex);
}

function normalizeSubroutineToken(tokenText) {
  if (!tokenText) {
    return null;
  }

  const lowered = tokenText.toLowerCase();
  if (!/^[a-z_][a-z0-9_]*$/.test(lowered)) {
    return null;
  }

  return lowered;
}

function parseSubroutineFile(filePath, fileText) {
  const definitions = [];
  const references = [];
  const includes = [];

  if (!filePath) {
    return { definitions, references, includes };
  }

  const text = typeof fileText === 'string'
    ? fileText
    : (fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null);
  if (typeof text !== 'string') {
    return { definitions, references, includes };
  }

  const lines = text.split(/\r?\n/);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];
    const tokens = getCodeTokens(line);
    if (tokens.length === 0) {
      continue;
    }

    const command = tokens[0].text.toLowerCase();

    if (command === 'subroutine' && tokens[1]) {
      const name = normalizeSubroutineToken(tokens[1].text);
      if (name) {
        definitions.push({
          name,
          location: new vscode.Location(
            vscode.Uri.file(filePath),
            new vscode.Range(lineNumber, tokens[1].start, lineNumber, tokens[1].end)
          )
        });
      }
      continue;
    }

    if (command === 'gosub' && tokens[1]) {
      const name = normalizeSubroutineToken(tokens[1].text);
      if (name) {
        references.push({
          name,
          location: new vscode.Location(
            vscode.Uri.file(filePath),
            new vscode.Range(lineNumber, tokens[1].start, lineNumber, tokens[1].end)
          )
        });
      }
      continue;
    }

    if (INCLUDE_COMMANDS.has(command) && tokens[1]) {
      const includePath = resolveIncludePath(filePath, stripSurroundingQuotes(tokens[1].text));
      if (includePath) {
        includes.push(includePath);
      }
    }
  }

  return { definitions, references, includes };
}

function buildSubroutineIndex(rootFilePath, rootFileText) {
  const visited = new Set();
  const definitions = new Map();
  const references = new Map();

  function add(map, key, value) {
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(value);
  }

  function walk(filePath) {
    if (!filePath || visited.has(filePath)) {
      return;
    }
    visited.add(filePath);

    const parsed = parseSubroutineFile(
      filePath,
      filePath === rootFilePath && typeof rootFileText === 'string' ? rootFileText : undefined
    );
    for (const item of parsed.definitions) {
      add(definitions, item.name, item.location);
    }
    for (const item of parsed.references) {
      add(references, item.name, item.location);
    }
    for (const includeFile of parsed.includes) {
      walk(includeFile);
    }
  }

  walk(rootFilePath);

  return { definitions, references };
}

function getSubroutineSymbolAtPosition(document, position) {
  const line = document.lineAt(position.line).text;
  const tokens = getCodeTokens(line);
  if (tokens.length < 2) {
    return null;
  }

  const command = tokens[0].text.toLowerCase();
  if (command !== 'subroutine' && command !== 'gosub') {
    return null;
  }

  const target = tokens[1];
  const inTarget = position.character >= target.start && position.character < target.end;
  if (!inTarget) {
    return null;
  }

  const name = normalizeSubroutineToken(target.text);
  if (!name) {
    return null;
  }

  return {
    name,
    command,
    range: new vscode.Range(position.line, target.start, position.line, target.end)
  };
}

module.exports = {
  buildSubroutineIndex,
  getSubroutineSymbolAtPosition,
  normalizeSubroutineToken
};
