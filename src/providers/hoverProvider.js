const vscode = require('vscode');
const {
  BUILTIN_FUNCTION_DOCS,
  BUILTIN_FUNCTION_LINKS,
  BUILTIN_VARIABLE_DOCS,
  DEFAULT_VARIABLES_LINK,
  CONTROL_KEYWORD_DOCS
} = require('../data/languageData');

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

        // If token starts with '$', it is always a variable; do not fall back to command docs.
        return undefined;
      }

      const commandRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
      if (!commandRange) {
        return undefined;
      }

      const command = document.getText(commandRange).toLowerCase();
      const commandDoc = BUILTIN_FUNCTION_DOCS[command];
      const keywordDoc = CONTROL_KEYWORD_DOCS[command];
      const docText = commandDoc || keywordDoc;
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
