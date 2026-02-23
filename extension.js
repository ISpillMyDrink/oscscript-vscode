const { createDiagnosticsProvider } = require('./src/providers/diagnosticsProvider');
const { createCompletionProvider } = require('./src/providers/completionProvider');
const { createDocumentSymbolProvider } = require('./src/providers/documentSymbolProvider');
const { createHoverProvider } = require('./src/providers/hoverProvider');
const { createFormatProvider } = require('./src/providers/formatProvider');
const { createScriptLinkProviders } = require('./src/providers/scriptLinkProvider');
const { createSubroutineNavigationProviders } = require('./src/providers/subroutineNavigationProvider');
const { createVariableNavigationProviders } = require('./src/providers/variableNavigationProvider');

function activate(context) {
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
