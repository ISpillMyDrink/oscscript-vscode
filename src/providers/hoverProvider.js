const vscode = require('vscode');
const {
  BUILTIN_FUNCTION_DOCS,
  BUILTIN_FUNCTION_LINKS,
  BUILTIN_VARIABLE_DOCS,
  CONSTANT_DOCS,
  DEFAULT_VARIABLES_LINK,
  CONTROL_KEYWORD_DOCS
} = require('../data/languageData');
const { buildSubroutineIndex, getSubroutineSymbolAtPosition } = require('../analysis/subroutineIndex');
const { buildVariableIndex } = require('../analysis/variableIndex');

function createHoverProvider() {
  return vscode.languages.registerHoverProvider({ language: 'oscscript' }, {
    provideHover(document, position) {
      const variableRange = document.getWordRangeAtPosition(position, /\$[A-Za-z_][A-Za-z0-9_]*/);
      if (variableRange) {
        const token = document.getText(variableRange).replace(/^\$/, '').toLowerCase();
        const doc = BUILTIN_VARIABLE_DOCS[token];
        if (doc) {
          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**\\$${token}**\n\n`);
          md.appendMarkdown(doc);
          md.appendMarkdown(`\n\n[Script Reference](${DEFAULT_VARIABLES_LINK})`);
          md.isTrusted = false;

          return new vscode.Hover(md, variableRange);
        }

        if (document.uri.fsPath) {
          const index = buildVariableIndex(document.uri.fsPath, document.getText());
          const defs = index.definitions.get(token) || [];
          if (defs.length > 0) {
            const firstDef = defs
              .slice()
              .sort((a, b) => {
                const pathCompare = a.uri.fsPath.localeCompare(b.uri.fsPath);
                if (pathCompare !== 0) {
                  return pathCompare;
                }
                return a.range.start.line - b.range.start.line;
              })[0];
            const rel = vscode.workspace.asRelativePath(firstDef.uri, false);
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**\\$${token}**\n\n`);
            md.appendMarkdown('User-defined variable.\n\n');
            md.appendMarkdown(`Defined in \`${rel}:${firstDef.range.start.line + 1}\`.`);
            md.isTrusted = false;
            return new vscode.Hover(md, variableRange);
          }
        }

        // If token starts with '$', it is always a variable; do not fall back to command docs.
        return undefined;
      }

      const commandRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
      if (!commandRange) {
        return undefined;
      }

      if (document.uri.fsPath) {
        const subroutineSymbol = getSubroutineSymbolAtPosition(document, position);
        if (subroutineSymbol) {
          const index = buildSubroutineIndex(document.uri.fsPath, document.getText());
          const defs = index.definitions.get(subroutineSymbol.name) || [];
          if (defs.length > 0) {
            const firstDef = defs
              .slice()
              .sort((a, b) => {
                const pathCompare = a.uri.fsPath.localeCompare(b.uri.fsPath);
                if (pathCompare !== 0) {
                  return pathCompare;
                }
                return a.range.start.line - b.range.start.line;
              })[0];
            const rel = vscode.workspace.asRelativePath(firstDef.uri, false);
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**${subroutineSymbol.name}**\n\n`);
            md.appendMarkdown('User-defined subroutine.\n\n');
            md.appendMarkdown(`Defined in \`${rel}:${firstDef.range.start.line + 1}\`.`);
            md.isTrusted = false;
            return new vscode.Hover(md, subroutineSymbol.range);
          }
        }
      }

      const command = document.getText(commandRange).toLowerCase();
      const commandDoc = BUILTIN_FUNCTION_DOCS[command];
      const keywordDoc = CONTROL_KEYWORD_DOCS[command];
      const constantDoc = CONSTANT_DOCS[command];
      const docText = commandDoc || keywordDoc || constantDoc;
      if (!docText) {
        return undefined;
      }

      const md = new vscode.MarkdownString();
      md.appendMarkdown(`**${command}**\n\n`);
      md.appendMarkdown(docText);
      if (commandDoc) {
        md.appendMarkdown(`\n\n[Script Reference](${BUILTIN_FUNCTION_LINKS[command]})`);
      }
      md.isTrusted = false;

      return new vscode.Hover(md, commandRange);
    }
  });
}

module.exports = {
  createHoverProvider
};
