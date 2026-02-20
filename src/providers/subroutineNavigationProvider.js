const fs = require('fs');
const path = require('path');
const vscode = require('vscode');
const { INCLUDE_COMMANDS } = require('../data/languageData');
const {
  findInlineCommentIndex,
  firstNonWhitespaceIndex,
  stripSurroundingQuotes,
  tokenizeLineWithRanges
} = require('../analysis/tokenize');
const { resolveIncludePath } = require('../analysis/includeGraph');

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

function parseFile(filePath) {
  const definitions = [];
  const references = [];
  const includes = [];

  if (!filePath || !fs.existsSync(filePath)) {
    return { definitions, references, includes };
  }

  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];
    const tokens = getCodeTokens(line);
    if (tokens.length === 0) {
      continue;
    }

    const command = tokens[0].text.toLowerCase();

    if (command === 'subroutine' && tokens[1]) {
      const name = tokens[1].text.toLowerCase();
      definitions.push({
        name,
        location: new vscode.Location(
          vscode.Uri.file(filePath),
          new vscode.Range(lineNumber, tokens[1].start, lineNumber, tokens[1].end)
        )
      });
      continue;
    }

    if (command === 'gosub' && tokens[1]) {
      const name = tokens[1].text.toLowerCase();
      references.push({
        name,
        location: new vscode.Location(
          vscode.Uri.file(filePath),
          new vscode.Range(lineNumber, tokens[1].start, lineNumber, tokens[1].end)
        )
      });
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

function buildSubroutineIndex(entryFilePath) {
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

    const parsed = parseFile(filePath);
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

  walk(entryFilePath);

  return { definitions, references };
}

function getSymbolAtPosition(document, position) {
  const line = document.lineAt(position.line).text;
  const tokens = getCodeTokens(line);
  if (tokens.length < 2) {
    return null;
  }

  const command = tokens[0].text.toLowerCase();
  const target = tokens[1];
  const inTarget = position.character >= target.start && position.character <= target.end;
  if (!inTarget) {
    return null;
  }

  if (command !== 'subroutine' && command !== 'gosub') {
    return null;
  }

  return {
    name: target.text.toLowerCase(),
    command
  };
}

function createSubroutineNavigationProviders() {
  const selector = { language: 'oscscript' };

  const definitionProvider = vscode.languages.registerDefinitionProvider(selector, {
    provideDefinition(document, position) {
      if (!document.uri.fsPath) {
        return undefined;
      }

      const symbol = getSymbolAtPosition(document, position);
      if (!symbol) {
        return undefined;
      }

      const index = buildSubroutineIndex(document.uri.fsPath);
      const defs = index.definitions.get(symbol.name) || [];
      return defs.length > 0 ? defs : undefined;
    }
  });

  const referenceProvider = vscode.languages.registerReferenceProvider(selector, {
    provideReferences(document, position, context) {
      if (!document.uri.fsPath) {
        return undefined;
      }

      const symbol = getSymbolAtPosition(document, position);
      if (!symbol) {
        return undefined;
      }

      const index = buildSubroutineIndex(document.uri.fsPath);
      const refs = index.references.get(symbol.name) || [];
      const defs = context.includeDeclaration ? (index.definitions.get(symbol.name) || []) : [];
      const results = [...defs, ...refs];

      return results.length > 0 ? results : undefined;
    }
  });

  return [definitionProvider, referenceProvider];
}

module.exports = {
  createSubroutineNavigationProviders
};
