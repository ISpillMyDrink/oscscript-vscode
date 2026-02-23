const vscode = require('vscode');
const { createDiagnosticsProvider } = require('./src/providers/diagnosticsProvider');
const { createCompletionProvider } = require('./src/providers/completionProvider');
const { createDocumentSymbolProvider } = require('./src/providers/documentSymbolProvider');
const { createHoverProvider } = require('./src/providers/hoverProvider');
const { createFormatProvider } = require('./src/providers/formatProvider');
const { createScriptLinkProviders } = require('./src/providers/scriptLinkProvider');
const { createSubroutineNavigationProviders } = require('./src/providers/subroutineNavigationProvider');
const { createVariableNavigationProviders } = require('./src/providers/variableNavigationProvider');
const { invalidateAnalysisCaches } = require('./src/analysis/workspaceAnalysisCache');

function isOscscriptPath(path) {
  return path.endsWith('.osc') || path.endsWith('.oscscript');
}

function activate(context) {
  const invalidate = () => invalidateAnalysisCaches();
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.languageId === 'oscscript') {
        invalidate();
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId === 'oscscript') {
        invalidate();
      }
    }),
    vscode.workspace.onDidCreateFiles((event) => {
      if (event.files.some((uri) => isOscscriptPath(uri.fsPath || ''))) {
        invalidate();
      }
    }),
    vscode.workspace.onDidDeleteFiles((event) => {
      if (event.files.some((uri) => isOscscriptPath(uri.fsPath || ''))) {
        invalidate();
      }
    }),
    vscode.workspace.onDidRenameFiles((event) => {
      if (event.files.some((file) => isOscscriptPath(file.oldUri.fsPath || '') || isOscscriptPath(file.newUri.fsPath || ''))) {
        invalidate();
      }
    })
  );

  context.subscriptions.push(createHoverProvider());
  context.subscriptions.push(createCompletionProvider());
  context.subscriptions.push(createFormatProvider());
  context.subscriptions.push(createDocumentSymbolProvider());
  context.subscriptions.push(...createScriptLinkProviders());
  context.subscriptions.push(...createSubroutineNavigationProviders());
  context.subscriptions.push(...createVariableNavigationProviders());
  createDiagnosticsProvider(context);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate
};
