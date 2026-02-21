const path = require('path');
const vscode = require('vscode');
const {
  BUILTIN_FUNCTION_DOCS,
  BUILTIN_FUNCTION_LINKS,
  BUILTIN_VARIABLE_DOCS,
  DEFAULT_VARIABLES_LINK,
  COMMANDS,
  CONTROL_KEYWORD_DOCS,
  CONTROL_KEYWORDS,
  INCLUDE_COMMANDS
} = require('../data/languageData');
const { collectSubroutines, collectVariables } = require('../analysis/includeGraph');
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

  return tokens.filter((token) => token.start < commentIndex);
}

function getReplaceRange(document, position) {
  return document.getWordRangeAtPosition(position, /\$?[A-Za-z_][A-Za-z0-9_]*/)
    || new vscode.Range(position, position);
}

function markdownFor(label, doc, linkUrl) {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${label}**\n\n`);
  md.appendMarkdown(doc);
  if (linkUrl) {
    md.appendMarkdown(`\n\n[Script Reference](${linkUrl})`);
  }
  md.isTrusted = false;
  return md;
}

function createCommandItem(command, range) {
  const item = new vscode.CompletionItem(command, vscode.CompletionItemKind.Function);
  item.range = range;
  item.insertText = command;
  item.detail = 'OSCScript command';

  const doc = BUILTIN_FUNCTION_DOCS[command];
  if (doc) {
    item.documentation = markdownFor(command, doc, BUILTIN_FUNCTION_LINKS[command]);
  }

  return item;
}

function createKeywordItem(keyword, range) {
  const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
  item.range = range;
  item.insertText = keyword;
  item.detail = 'OSCScript control keyword';

  const doc = CONTROL_KEYWORD_DOCS[keyword];
  if (doc) {
    item.documentation = markdownFor(keyword, doc);
  }

  return item;
}

function createVariableItem(name, range) {
  const label = `$${name}`;
  const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Variable);
  item.range = range;
  item.insertText = label;
  item.detail = 'Built-in variable';
  item.documentation = markdownFor(label, BUILTIN_VARIABLE_DOCS[name], DEFAULT_VARIABLES_LINK);
  return item;
}

function createUserVariableItem(name, range) {
  const label = `$${name}`;
  const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Variable);
  item.range = range;
  item.insertText = label;
  item.detail = 'User-defined variable';
  item.documentation = new vscode.MarkdownString(`**${label}**\n\nVariable defined in this script.`);
  item.documentation.isTrusted = false;
  return item;
}

function createSnippetItems(range) {
  const snippets = [
    {
      label: 'if...endif',
      snippet: 'if ${1:left} ${2:eq} ${3:right}\n\t$0\nendif',
      detail: 'If block snippet'
    },
    {
      label: 'if...else...endif',
      snippet: 'if ${1:left} ${2:eq} ${3:right}\n\t${4}\nelse\n\t$0\nendif',
      detail: 'If/else block snippet'
    },
    {
      label: 'while...done',
      snippet: 'while ${1:left} ${2:eq} ${3:right}\n\t$0\ndone',
      detail: 'While loop snippet'
    },
    {
      label: 'subroutine...endsubroutine',
      snippet: 'subroutine ${1:name}\n\t$0\nendsubroutine',
      detail: 'Subroutine block snippet'
    },
    {
      label: 'setbuffer...endbuffer',
      snippet: 'setbuffer ${1:offset}\n$0\nendbuffer',
      detail: 'Setbuffer block snippet'
    },
    {
      label: 'setscratchpad...endscratchpad',
      snippet: 'setscratchpad ${1:offset}\n$0\nendscratchpad',
      detail: 'Setscratchpad block snippet'
    }
  ];

  return snippets.map((entry) => {
    const item = new vscode.CompletionItem(entry.label, vscode.CompletionItemKind.Snippet);
    item.range = range;
    item.insertText = new vscode.SnippetString(entry.snippet);
    item.detail = entry.detail;
    return item;
  });
}

async function createIncludeItems(document, range, prefix) {
  const files = await vscode.workspace.findFiles('**/*.{osc,oscscript}', '**/{.git,node_modules}/**', 500);
  const baseDir = path.dirname(document.uri.fsPath);
  const normalizedPrefix = (prefix || '').replace(/^['\"]/, '').toLowerCase();

  return files
    .map((uri) => {
      const rel = path.relative(baseDir, uri.fsPath).replace(/\\/g, '/');
      const item = new vscode.CompletionItem(rel, vscode.CompletionItemKind.File);
      item.range = range;
      item.insertText = rel;
      item.detail = 'OSCScript file';
      return item;
    })
    .filter((item) => !normalizedPrefix || item.label.toLowerCase().startsWith(normalizedPrefix))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function createSubroutineItems(document, range) {
  const names = Array.from(collectSubroutines(document.uri.fsPath || '')).sort();

  return names.map((name) => {
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Method);
    item.range = range;
    item.insertText = name;
    item.detail = 'OSCScript subroutine';
    return item;
  });
}

function createCompletionProvider() {
  const selector = { language: 'oscscript' };

  const provider = {
    async provideCompletionItems(document, position) {
      const line = document.lineAt(position.line).text;
      const codeTokens = getCodeTokens(line);
      const range = getReplaceRange(document, position);
      const currentText = document.getText(range);
      const activeTokenIndex = codeTokens.findIndex(
        (token) => position.character >= token.start && position.character <= token.end
      );
      const tokenIndex = activeTokenIndex >= 0
        ? activeTokenIndex
        : codeTokens.filter((token) => token.end <= position.character).length;

      if (currentText.startsWith('$')) {
        const userVariables = document.uri.fsPath
          ? Array.from(collectVariables(document.uri.fsPath, document.getText()))
          : [];
        const builtinNames = new Set(Object.keys(BUILTIN_VARIABLE_DOCS));
        const items = [
          ...Array.from(builtinNames).sort().map((name) => createVariableItem(name, range)),
          ...userVariables
            .filter((name) => !builtinNames.has(name))
            .sort()
            .map((name) => createUserVariableItem(name, range))
        ];
        return items;
      }

      if (tokenIndex === 0) {
        const items = [
          ...Array.from(COMMANDS).sort().map((command) => createCommandItem(command, range)),
          ...Array.from(CONTROL_KEYWORDS).sort().map((keyword) => createKeywordItem(keyword, range)),
          ...createSnippetItems(range)
        ];
        return items;
      }

      const command = codeTokens[0] ? codeTokens[0].text.toLowerCase() : '';

      if (command === 'gosub' && tokenIndex === 1) {
        return createSubroutineItems(document, range);
      }

      if (INCLUDE_COMMANDS.has(command) && tokenIndex === 1) {
        return createIncludeItems(document, range, currentText);
      }

      return undefined;
    }
  };

  const triggerChars = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', '$', '_'];
  return vscode.languages.registerCompletionItemProvider(selector, provider, ...triggerChars);
}

module.exports = {
  createCompletionProvider
};
