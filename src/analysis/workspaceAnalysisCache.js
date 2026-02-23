const { buildSubroutineIndex } = require('./subroutineIndex');
const { buildVariableIndex } = require('./variableIndex');

let workspaceRevision = 0;
const subroutineIndexCache = new Map();
const variableIndexCache = new Map();

function buildKey(rootFilePath, rootFileText, documentVersion) {
  const textVersion = Number.isInteger(documentVersion) ? documentVersion : 'na';
  const hasText = typeof rootFileText === 'string' ? 't' : 'f';
  return `${rootFilePath}::${textVersion}::${workspaceRevision}::${hasText}`;
}

function invalidateAnalysisCaches() {
  workspaceRevision += 1;
  subroutineIndexCache.clear();
  variableIndexCache.clear();
}

function getCachedSubroutineIndex(rootFilePath, rootFileText, documentVersion) {
  if (!rootFilePath) {
    return { definitions: new Map(), references: new Map() };
  }

  const key = buildKey(rootFilePath, rootFileText, documentVersion);
  if (!subroutineIndexCache.has(key)) {
    subroutineIndexCache.set(key, buildSubroutineIndex(rootFilePath, rootFileText));
  }

  return subroutineIndexCache.get(key);
}

function getCachedVariableIndex(rootFilePath, rootFileText, documentVersion) {
  if (!rootFilePath) {
    return { definitions: new Map(), references: new Map() };
  }

  const key = buildKey(rootFilePath, rootFileText, documentVersion);
  if (!variableIndexCache.has(key)) {
    variableIndexCache.set(key, buildVariableIndex(rootFilePath, rootFileText));
  }

  return variableIndexCache.get(key);
}

function getCachedSubroutines(rootFilePath, rootFileText, documentVersion) {
  const index = getCachedSubroutineIndex(rootFilePath, rootFileText, documentVersion);
  return new Set(index.definitions.keys());
}

function getCachedVariables(rootFilePath, rootFileText, documentVersion) {
  const index = getCachedVariableIndex(rootFilePath, rootFileText, documentVersion);
  return new Set(index.definitions.keys());
}

module.exports = {
  getCachedSubroutineIndex,
  getCachedSubroutines,
  getCachedVariableIndex,
  getCachedVariables,
  invalidateAnalysisCaches
};
