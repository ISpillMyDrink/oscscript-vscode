const vscode = require('vscode');
const {
  getSubroutineSymbolAtPosition,
  normalizeSubroutineToken
} = require('../analysis/subroutineIndex');
const { getCachedSubroutineIndex } = require('../analysis/workspaceAnalysisCache');

function createSubroutineNavigationProviders() {
  const selector = { language: 'oscscript' };

  const definitionProvider = vscode.languages.registerDefinitionProvider(selector, {
    provideDefinition(document, position) {
      if (!document.uri.fsPath) {
        return undefined;
      }

      const symbol = getSubroutineSymbolAtPosition(document, position);
      if (!symbol) {
        return undefined;
      }

      const index = getCachedSubroutineIndex(document.uri.fsPath, document.getText(), document.version);
      const defs = index.definitions.get(symbol.name) || [];
      return defs.length > 0 ? defs : undefined;
    }
  });

  const referenceProvider = vscode.languages.registerReferenceProvider(selector, {
    provideReferences(document, position, context) {
      if (!document.uri.fsPath) {
        return undefined;
      }

      const symbol = getSubroutineSymbolAtPosition(document, position);
      if (!symbol) {
        return undefined;
      }

      const index = getCachedSubroutineIndex(document.uri.fsPath, document.getText(), document.version);
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

      const symbol = getSubroutineSymbolAtPosition(document, position);
      if (!symbol) {
        return undefined;
      }

      const index = getCachedSubroutineIndex(document.uri.fsPath, document.getText(), document.version);
      const defs = index.definitions.get(symbol.name) || [];
      if (defs.length === 0) {
        throw new Error('Only user-defined subroutines can be renamed.');
      }

      return symbol.range;
    },
    provideRenameEdits(document, position, newName) {
      if (!document.uri.fsPath) {
        return undefined;
      }

      const symbol = getSubroutineSymbolAtPosition(document, position);
      if (!symbol) {
        return undefined;
      }

      const normalizedNewName = normalizeSubroutineToken(newName.trim());
      if (!normalizedNewName) {
        throw new Error('Subroutine name must match [A-Za-z_][A-Za-z0-9_]*.');
      }

      const index = getCachedSubroutineIndex(document.uri.fsPath, document.getText(), document.version);
      const defs = index.definitions.get(symbol.name) || [];
      if (defs.length === 0) {
        throw new Error('Only user-defined subroutines can be renamed.');
      }

      const refs = index.references.get(symbol.name) || [];
      const edit = new vscode.WorkspaceEdit();
      for (const location of [...defs, ...refs]) {
        edit.replace(location.uri, location.range, normalizedNewName);
      }
      return edit;
    }
  });

  return [definitionProvider, referenceProvider, renameProvider];
}

module.exports = {
  createSubroutineNavigationProviders
};
