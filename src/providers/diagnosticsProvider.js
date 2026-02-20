const path = require('path');
const vscode = require('vscode');
const {
  BLOCK_CLOSERS,
  BLOCK_OPENERS,
  COMMANDS,
  CONTROL_KEYWORDS,
  INCLUDE_COMMANDS
} = require('../data/languageData');
const { collectSubroutines, resolveIncludePath } = require('../analysis/includeGraph');
const {
  findInlineCommentIndex,
  firstNonWhitespaceIndex,
  stripSurroundingQuotes,
  tokenizeLine
} = require('../analysis/tokenize');

function addDiagnostic(diagnostics, line, start, end, message, severity = vscode.DiagnosticSeverity.Error) {
  const range = new vscode.Range(line, start, line, Math.max(start + 1, end));
  diagnostics.push(new vscode.Diagnostic(range, message, severity));
}

function validateDocument(document, collection) {
  if (document.languageId !== 'oscscript') {
    return;
  }

  const diagnostics = [];
  const blockStack = [];
  const subroutinesInFile = new Set();
  const gosubRefs = [];
  const includeRefs = [];

  for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex += 1) {
    const raw = document.lineAt(lineIndex).text;
    const trimmed = raw.trim();

    if (!trimmed) {
      continue;
    }

    const firstCodeIndex = firstNonWhitespaceIndex(raw);
    const commentIndex = findInlineCommentIndex(raw);

    if (commentIndex === firstCodeIndex) {
      continue;
    }

    if (commentIndex > -1) {
      addDiagnostic(
        diagnostics,
        lineIndex,
        commentIndex,
        raw.length,
        'Inline comments are not allowed. Comments must start the line with #.',
        vscode.DiagnosticSeverity.Warning
      );
    }

    const code = commentIndex > -1 ? raw.slice(0, commentIndex).trim() : trimmed;
    if (!code) {
      continue;
    }

    const tokens = tokenizeLine(code);
    if (tokens.length === 0) {
      continue;
    }

    const firstToken = tokens[0];
    const lowerCommand = firstToken.toLowerCase();
    const cmdStart = raw.indexOf(firstToken);

    const hasLower = /[a-z]/.test(firstToken);
    const hasUpper = /[A-Z]/.test(firstToken);
    if (hasLower && hasUpper) {
      addDiagnostic(
        diagnostics,
        lineIndex,
        cmdStart,
        cmdStart + firstToken.length,
        'Command must be either all uppercase or all lowercase.',
        vscode.DiagnosticSeverity.Warning
      );
    }

    if (!COMMANDS.has(lowerCommand) && !CONTROL_KEYWORDS.has(lowerCommand) && !BLOCK_CLOSERS.has(lowerCommand)) {
      addDiagnostic(
        diagnostics,
        lineIndex,
        cmdStart,
        cmdStart + firstToken.length,
        `Unknown command: ${firstToken}`
      );
      continue;
    }

    if (lowerCommand === 'subroutine' && tokens[1]) {
      subroutinesInFile.add(tokens[1].toLowerCase());
    }

    if (INCLUDE_COMMANDS.has(lowerCommand)) {
      const includeValue = stripSurroundingQuotes(tokens[1] || '');
      includeRefs.push({
        line: lineIndex,
        token: tokens[1] || '',
        value: includeValue
      });
    }

    if (lowerCommand === 'gosub') {
      gosubRefs.push({
        line: lineIndex,
        target: (tokens[1] || '').toLowerCase(),
        token: tokens[1] || ''
      });
      if (!tokens[1]) {
        addDiagnostic(diagnostics, lineIndex, cmdStart, cmdStart + firstToken.length, 'gosub requires a subroutine name.');
      }
    }

    if (BLOCK_OPENERS[lowerCommand]) {
      blockStack.push({
        opener: lowerCommand,
        expected: BLOCK_OPENERS[lowerCommand],
        line: lineIndex
      });
      continue;
    }

    if (lowerCommand === 'elseif' || lowerCommand === 'else') {
      const top = blockStack[blockStack.length - 1];
      if (!top || top.opener !== 'if') {
        addDiagnostic(diagnostics, lineIndex, cmdStart, cmdStart + firstToken.length, `${lowerCommand} must appear inside an if/endif block.`);
      }
      continue;
    }

    if (BLOCK_CLOSERS.has(lowerCommand)) {
      const top = blockStack[blockStack.length - 1];
      if (!top) {
        addDiagnostic(diagnostics, lineIndex, cmdStart, cmdStart + firstToken.length, `Unexpected ${lowerCommand} without a matching opener.`);
        continue;
      }
      if (top.expected !== lowerCommand) {
        addDiagnostic(
          diagnostics,
          lineIndex,
          cmdStart,
          cmdStart + firstToken.length,
          `Unexpected ${lowerCommand}; expected ${top.expected} for ${top.opener} opened on line ${top.line + 1}.`
        );
        continue;
      }
      blockStack.pop();
      continue;
    }

    if (lowerCommand === 'break') {
      const inWhile = blockStack.some((b) => b.opener === 'while');
      if (!inWhile) {
        addDiagnostic(diagnostics, lineIndex, cmdStart, cmdStart + firstToken.length, 'break must be used inside a while/done block.');
      }
    }

    if (lowerCommand === 'returnsub') {
      const inSub = blockStack.some((b) => b.opener === 'subroutine');
      if (!inSub) {
        addDiagnostic(diagnostics, lineIndex, cmdStart, cmdStart + firstToken.length, 'returnsub must be used inside a subroutine/endsubroutine block.');
      }
    }
  }

  for (const block of blockStack) {
    const lineText = document.lineAt(block.line).text;
    const col = lineText.search(/\S|$/);
    addDiagnostic(
      diagnostics,
      block.line,
      col,
      col + block.opener.length,
      `Missing ${block.expected} for ${block.opener} block opened here.`
    );
  }

  const docPath = document.uri.fsPath;
  const visibleSubroutines = new Set(subroutinesInFile);

  if (docPath) {
    for (const include of includeRefs) {
      const includePath = resolveIncludePath(docPath, include.token);
      if (!includePath) {
        const lineText = document.lineAt(include.line).text;
        const start = lineText.indexOf(include.token || '');
        addDiagnostic(
          diagnostics,
          include.line,
          start >= 0 ? start : 0,
          start >= 0 ? start + (include.token || '').length : lineText.length,
          `Included script not found: ${include.value || '(missing path)'}`
        );
        continue;
      }

      for (const name of collectSubroutines(includePath)) {
        visibleSubroutines.add(name);
      }
    }

    for (const ref of gosubRefs) {
      if (!ref.target) {
        continue;
      }
      if (!visibleSubroutines.has(ref.target)) {
        const lineText = document.lineAt(ref.line).text;
        const start = lineText.indexOf(ref.token);
        addDiagnostic(
          diagnostics,
          ref.line,
          start >= 0 ? start : 0,
          start >= 0 ? start + ref.token.length : lineText.length,
          `Unknown subroutine: ${ref.target}`
        );
      }
    }
  }

  collection.set(document.uri, diagnostics);
}

function createDiagnosticsProvider(context) {
  const collection = vscode.languages.createDiagnosticCollection('oscscript');

  const refresh = (doc) => validateDocument(doc, collection);

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      refresh(doc);
      for (const openDoc of vscode.workspace.textDocuments) {
        if (openDoc.languageId === 'oscscript' && openDoc.uri.fsPath !== doc.uri.fsPath) {
          refresh(openDoc);
        }
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri))
  );

  for (const doc of vscode.workspace.textDocuments) {
    if (doc.languageId === 'oscscript') {
      refresh(doc);
    }
  }
}

module.exports = {
  createDiagnosticsProvider
};
