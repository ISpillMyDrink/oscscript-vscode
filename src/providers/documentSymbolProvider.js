const vscode = require('vscode');
const {
  findInlineCommentIndex,
  firstNonWhitespaceIndex,
  tokenizeLineWithRanges
} = require('../analysis/tokenize');

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

function createDocumentSymbolProvider() {
  const selector = { language: 'oscscript' };

  return vscode.languages.registerDocumentSymbolProvider(selector, {
    provideDocumentSymbols(document) {
      const symbols = [];
      const stack = [];

      for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
        const line = document.lineAt(lineNumber).text;
        const tokens = getCodeTokens(line);
        if (tokens.length === 0) {
          continue;
        }

        const command = tokens[0].text.toLowerCase();

        if (command === 'subroutine' && tokens[1]) {
          const nameToken = tokens[1];
          const selectionRange = new vscode.Range(
            lineNumber,
            nameToken.start,
            lineNumber,
            nameToken.end
          );
          const fallbackRange = new vscode.Range(
            lineNumber,
            tokens[0].start,
            lineNumber,
            line.length
          );

          const symbol = new vscode.DocumentSymbol(
            nameToken.text,
            'Subroutine',
            vscode.SymbolKind.Function,
            fallbackRange,
            selectionRange
          );

          stack.push({ symbol, startLine: lineNumber });
          continue;
        }

        if (command === 'endsubroutine' && stack.length > 0) {
          const open = stack.pop();
          open.symbol.range = new vscode.Range(
            open.startLine,
            open.symbol.range.start.character,
            lineNumber,
            line.length
          );
          symbols.push(open.symbol);
        }
      }

      while (stack.length > 0) {
        symbols.push(stack.pop().symbol);
      }

      return symbols.sort((a, b) => a.range.start.line - b.range.start.line);
    }
  });
}

module.exports = {
  createDocumentSymbolProvider
};
