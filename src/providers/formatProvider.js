const vscode = require('vscode');
const { BLOCK_CLOSERS, BLOCK_OPENERS } = require('../data/languageData');
const {
  firstNonWhitespaceIndex,
  tokenizeLine
} = require('../analysis/tokenize');

function buildIndentUnit(options) {
  if (!options || !options.insertSpaces) {
    return '\t';
  }

  const size = Number.isInteger(options.tabSize) ? Math.max(1, options.tabSize) : 2;
  return ' '.repeat(size);
}

function createFormatProvider() {
  const selector = { language: 'oscscript' };

  return vscode.languages.registerDocumentFormattingEditProvider(selector, {
    provideDocumentFormattingEdits(document, options) {
      const indentUnit = buildIndentUnit(options);
      const originalText = document.getText();
      const formattedLines = [];
      const blockStack = [];
      let indentLevel = 0;
      let emptyLineRun = 0;

      for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
        const rawLine = document.lineAt(lineNumber).text;
        const trimmedLine = rawLine.trim();

        if (!trimmedLine) {
          if (emptyLineRun < 2) {
            formattedLines.push('');
          }
          emptyLineRun += 1;
          continue;
        }
        emptyLineRun = 0;

        const firstCodeIndex = firstNonWhitespaceIndex(rawLine);
        if (firstCodeIndex > -1 && rawLine[firstCodeIndex] === '#') {
          const indent = indentUnit.repeat(Math.max(0, indentLevel));
          formattedLines.push(`${indent}${trimmedLine}`);
          continue;
        }

        const code = trimmedLine;
        const tokens = tokenizeLine(code);
        const firstToken = tokens[0] || '';
        const command = firstToken.toLowerCase();
        const topBlock = blockStack[blockStack.length - 1];
        const inDataEntryBlock =
          topBlock && (topBlock.opener === 'setbuffer' || topBlock.opener === 'setscratchpad');
        const isDataEntryLine = inDataEntryBlock && command !== topBlock.expected;
        const isMidBlock = command === 'else' || command === 'elseif';
        const isCloser = BLOCK_CLOSERS.has(command) || isMidBlock;
        const indentForLine = Math.max(0, isCloser ? indentLevel - 1 : indentLevel);
        const indent = indentUnit.repeat(indentForLine);
        formattedLines.push(`${indent}${code}`);

        if (isDataEntryLine) {
          indentLevel = indentForLine;
          continue;
        }

        if (BLOCK_OPENERS[command]) {
          blockStack.push({ opener: command, expected: BLOCK_OPENERS[command] });
        } else if (BLOCK_CLOSERS.has(command)) {
          const top = blockStack[blockStack.length - 1];
          if (top && top.expected === command) {
            blockStack.pop();
          }
        }

        if (BLOCK_OPENERS[command]) {
          indentLevel = indentForLine + 1;
        } else if (isMidBlock) {
          indentLevel = indentForLine + 1;
        } else {
          indentLevel = indentForLine;
        }
      }

      const endsWithNewline = /\r?\n$/.test(originalText);
      while (formattedLines.length > 0 && formattedLines[0] === '') {
        formattedLines.shift();
      }
      while (formattedLines.length > 0 && formattedLines[formattedLines.length - 1] === '') {
        formattedLines.pop();
      }

      const formattedText = `${formattedLines.join('\n')}${endsWithNewline && formattedLines.length > 0 ? '\n' : ''}`;
      if (formattedText === originalText) {
        return [];
      }

      const lastLine = document.lineCount - 1;
      const fullRange = new vscode.Range(0, 0, lastLine, document.lineAt(lastLine).text.length);
      return [vscode.TextEdit.replace(fullRange, formattedText)];
    }
  });
}

module.exports = {
  createFormatProvider
};
