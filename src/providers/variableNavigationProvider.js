const vscode = require('vscode');
const { BUILTIN_VARIABLE_DOCS } = require('../data/languageData');
const {
  buildVariableIndex,
  getVariableSymbolAtPosition,
  normalizeVariableToken
} = require('../analysis/variableIndex');

function createVariableNavigationProviders() {
  const selector = { language: 'oscscript' };
  const builtinVariables = new Set(Object.keys(BUILTIN_VARIABLE_DOCS));

  const definitionProvider = vscode.languages.registerDefinitionProvider(selector, {
    provideDefinition(document, position) {
      if (!document.uri.fsPath) {
        return undefined;
      }

      const symbol = getVariableSymbolAtPosition(document, position);
      if (!symbol) {
        return undefined;
      }

      const index = buildVariableIndex(document.uri.fsPath, document.getText());
      const defs = index.definitions.get(symbol.name) || [];
      return defs.length > 0 ? defs : undefined;
    }
  });

  const referenceProvider = vscode.languages.registerReferenceProvider(selector, {
    provideReferences(document, position, context) {
      if (!document.uri.fsPath) {
        return undefined;
      }

      const symbol = getVariableSymbolAtPosition(document, position);
      if (!symbol) {
        return undefined;
      }

      const index = buildVariableIndex(document.uri.fsPath, document.getText());
      const defs = index.definitions.get(symbol.name) || [];
      if (defs.length === 0) {
        return undefined;
      }

      const refs = index.references.get(symbol.name) || [];
      const results = context.includeDeclaration ? [...defs, ...refs] : refs;
      return results.length > 0 ? results : undefined;
    }
  });

  const renameProvider = vscode.languages.registerRenameProvider(selector, {
    prepareRename(document, position) {
      if (!document.uri.fsPath) {
        return undefined;
      }

      const symbol = getVariableSymbolAtPosition(document, position);
      if (!symbol) {
        return undefined;
      }

      if (builtinVariables.has(symbol.name)) {
        throw new Error('Built-in variables cannot be renamed.');
      }

      const index = buildVariableIndex(document.uri.fsPath, document.getText());
      const defs = index.definitions.get(symbol.name) || [];
      if (defs.length === 0) {
        throw new Error('Only user-defined variables can be renamed.');
      }

      return symbol.range;
    },
    provideRenameEdits(document, position, newName) {
      if (!document.uri.fsPath) {
        return undefined;
      }

      const symbol = getVariableSymbolAtPosition(document, position);
      if (!symbol) {
        return undefined;
      }

      if (builtinVariables.has(symbol.name)) {
        throw new Error('Built-in variables cannot be renamed.');
      }

      const normalizedNewName = normalizeVariableToken(newName.trim().startsWith('$')
        ? newName.trim()
        : `$${newName.trim()}`);
      if (!normalizedNewName) {
        throw new Error('Variable name must match $[A-Za-z_][A-Za-z0-9_]*.');
      }

      if (builtinVariables.has(normalizedNewName)) {
        throw new Error('Cannot rename to a built-in variable name.');
      }

      const index = buildVariableIndex(document.uri.fsPath, document.getText());
      const defs = index.definitions.get(symbol.name) || [];
      if (defs.length === 0) {
        throw new Error('Only user-defined variables can be renamed.');
      }

      const refs = index.references.get(symbol.name) || [];
      const edit = new vscode.WorkspaceEdit();
      const replacement = `$${normalizedNewName}`;
      for (const location of [...defs, ...refs]) {
        edit.replace(location.uri, location.range, replacement);
      }
      return edit;
    }
  });

  return [definitionProvider, referenceProvider, renameProvider];
}

module.exports = {
  createVariableNavigationProviders
};
