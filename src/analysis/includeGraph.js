const fs = require('fs');
const path = require('path');
const { INCLUDE_COMMANDS } = require('../data/languageData');
const { stripSurroundingQuotes, tokenizeLine } = require('./tokenize');

function resolveIncludePath(baseFilePath, rawTarget) {
  const target = stripSurroundingQuotes(rawTarget || '').trim();
  if (!target) {
    return null;
  }

  const resolved = path.isAbsolute(target)
    ? target
    : path.resolve(path.dirname(baseFilePath), target);

  return fs.existsSync(resolved) ? resolved : null;
}

function collectSubroutines(rootFilePath) {
  const visited = new Set();
  const subroutines = new Set();

  function walk(filePath) {
    if (!filePath || visited.has(filePath) || !fs.existsSync(filePath)) {
      return;
    }

    visited.add(filePath);

    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const tokens = tokenizeLine(trimmed);
      if (tokens.length === 0) {
        continue;
      }

      const command = tokens[0].toLowerCase();

      if (command === 'subroutine' && tokens[1]) {
        subroutines.add(tokens[1].toLowerCase());
      }

      if (INCLUDE_COMMANDS.has(command) && tokens[1]) {
        const includePath = resolveIncludePath(filePath, tokens[1]);
        if (includePath) {
          walk(includePath);
        }
      }
    }
  }

  walk(rootFilePath);
  return subroutines;
}

function collectVariables(rootFilePath, rootFileText) {
  const visited = new Set();
  const variables = new Set();

  function walk(filePath) {
    if (!filePath || visited.has(filePath) || !fs.existsSync(filePath)) {
      return;
    }

    visited.add(filePath);

    const text = (filePath === rootFilePath && typeof rootFileText === 'string')
      ? rootFileText
      : fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      const tokens = tokenizeLine(trimmed);
      if (tokens.length === 0) {
        continue;
      }

      const command = tokens[0].toLowerCase();

      if ((command === 'seti' || command === 'sets' || command === 'userinput') && tokens[1]) {
        const variableToken = tokens[1].toLowerCase();
        if (/^\$[a-z_][a-z0-9_]*$/.test(variableToken)) {
          variables.add(variableToken.slice(1));
        }
      }

      if (INCLUDE_COMMANDS.has(command) && tokens[1]) {
        const includePath = resolveIncludePath(filePath, tokens[1]);
        if (includePath) {
          walk(includePath);
        }
      }
    }
  }

  walk(rootFilePath);
  return variables;
}

module.exports = {
  collectVariables,
  collectSubroutines,
  resolveIncludePath
};
