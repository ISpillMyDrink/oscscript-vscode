const fs = require('fs');
const path = require('path');
const { INCLUDE_COMMANDS } = require('../data/languageData');
const { stripSurroundingQuotes, tokenizeLine } = require('./tokenize');

function resolveIncludePath(baseFilePath, rawTarget) {
  const target = stripSurroundingQuotes(rawTarget || '').trim();
  if (!target) {
    return null;
  }

  const candidates = [];
  if (path.isAbsolute(target)) {
    candidates.push(target);
  } else {
    candidates.push(path.resolve(path.dirname(baseFilePath), target));
  }

  const withExt = candidates.flatMap((p) => {
    if (path.extname(p)) {
      return [p];
    }
    return [p, `${p}.osc`, `${p}.oscscript`];
  });

  return withExt.find((p) => fs.existsSync(p)) || null;
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

module.exports = {
  collectSubroutines,
  resolveIncludePath
};
