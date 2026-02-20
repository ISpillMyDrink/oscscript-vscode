const vscode = require('vscode');
const { INCLUDE_COMMANDS } = require('../data/languageData');
const {
  findInlineCommentIndex,
  firstNonWhitespaceIndex,
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

function getIncludeTargetAtPosition(document, position) {
  const line = document.lineAt(position.line).text;
  const tokens = getCodeTokens(line);
  if (tokens.length < 2) {
    return null;
  }

  const command = tokens[0].text.toLowerCase();
  if (!INCLUDE_COMMANDS.has(command)) {
    return null;
  }

  const pathToken = tokens[1];
  const inToken = position.character >= pathToken.start && position.character <= pathToken.end;
  if (!inToken) {
    return null;
  }

  if (!document.uri.fsPath) {
    return null;
  }

  const resolved = resolveIncludePath(document.uri.fsPath, pathToken.text);
  if (!resolved) {
    return null;
  }

  return {
    range: new vscode.Range(position.line, pathToken.start, position.line, pathToken.end),
    uri: vscode.Uri.file(resolved)
  };
}

function createScriptLinkProviders() {
  const selector = { language: 'oscscript' };

  const linkProvider = vscode.languages.registerDocumentLinkProvider(selector, {
    provideDocumentLinks(document) {
      const links = [];

      if (!document.uri.fsPath) {
        return links;
      }

      for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
        const line = document.lineAt(lineNumber).text;
        const tokens = getCodeTokens(line);
        if (tokens.length < 2) {
          continue;
        }

        const command = tokens[0].text.toLowerCase();
        if (!INCLUDE_COMMANDS.has(command)) {
          continue;
        }

        const pathToken = tokens[1];
        const resolved = resolveIncludePath(document.uri.fsPath, pathToken.text);
        if (!resolved) {
          continue;
        }

        const range = new vscode.Range(lineNumber, pathToken.start, lineNumber, pathToken.end);
        const link = new vscode.DocumentLink(range, vscode.Uri.file(resolved));
        link.tooltip = 'Open loaded script';
        links.push(link);
      }

      return links;
    }
  });

  const definitionProvider = vscode.languages.registerDefinitionProvider(selector, {
    provideDefinition(document, position) {
      const target = getIncludeTargetAtPosition(document, position);
      if (!target) {
        return undefined;
      }
      return new vscode.Location(target.uri, new vscode.Position(0, 0));
    }
  });

  return [linkProvider, definitionProvider];
}

module.exports = {
  createScriptLinkProviders
};
