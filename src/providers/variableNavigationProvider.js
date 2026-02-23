const fs = require('fs');
const vscode = require('vscode');
const { INCLUDE_COMMANDS } = require('../data/languageData');
const {
  findInlineCommentIndex,
  firstNonWhitespaceIndex,
  stripSurroundingQuotes,
  tokenizeLineWithRanges
} = require('../analysis/tokenize');
const { resolveIncludePath } = require('../analysis/includeGraph');

const VARIABLE_DEFINITION_COMMANDS = new Set(['seti', 'sets', 'userinput']);

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

function normalizeVariableToken(tokenText) {
  if (!tokenText) {
    return null;
  }

  const lowered = tokenText.toLowerCase();
  if (!/^\$[a-z_][a-z0-9_]*$/.test(lowered)) {
    return null;
  }

  return lowered.slice(1);
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

    if (INCLUDE_COMMANDS.has(command) && tokens[1]) {
      const includePath = resolveIncludePath(filePath, stripSurroundingQuotes(tokens[1].text));
      if (includePath) {
        includes.push(includePath);
      }
    }

    for (let i = 1; i < tokens.length; i += 1) {
      const token = tokens[i];
      const variableName = normalizeVariableToken(token.text);
      if (!variableName) {
        continue;
      }

      const location = new vscode.Location(
        vscode.Uri.file(filePath),
        new vscode.Range(lineNumber, token.start, lineNumber, token.end)
      );

      if (i === 1 && VARIABLE_DEFINITION_COMMANDS.has(command)) {
        definitions.push({ name: variableName, location });
      } else {
        references.push({ name: variableName, location });
      }
    }
  }

  return { definitions, references, includes };
}

function buildVariableIndex(entryFilePath) {
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

function getVariableAtPosition(document, position) {
  const line = document.lineAt(position.line).text;
  const tokens = getCodeTokens(line);

  const target = tokens.find(
    (token) => position.character >= token.start && position.character <= token.end
  );
  if (!target) {
    return null;
  }

  const name = normalizeVariableToken(target.text);
  if (!name) {
    return null;
  }

  return name;
}

function createVariableNavigationProviders() {
  const selector = { language: 'oscscript' };

  const definitionProvider = vscode.languages.registerDefinitionProvider(selector, {
    provideDefinition(document, position) {
      if (!document.uri.fsPath) {
        return undefined;
      }

      const name = getVariableAtPosition(document, position);
      if (!name) {
        return undefined;
      }

      const index = buildVariableIndex(document.uri.fsPath);
      const defs = index.definitions.get(name) || [];
      return defs.length > 0 ? defs : undefined;
    }
  });

  const referenceProvider = vscode.languages.registerReferenceProvider(selector, {
    provideReferences(document, position, context) {
      if (!document.uri.fsPath) {
        return undefined;
      }

      const name = getVariableAtPosition(document, position);
      if (!name) {
        return undefined;
      }

      const index = buildVariableIndex(document.uri.fsPath);
      const defs = index.definitions.get(name) || [];
      if (defs.length === 0) {
        return undefined;
      }

      const refs = index.references.get(name) || [];
      const results = context.includeDeclaration ? [...defs, ...refs] : refs;
      return results.length > 0 ? results : undefined;
    }
  });

  return [definitionProvider, referenceProvider];
}

module.exports = {
  createVariableNavigationProviders
};
