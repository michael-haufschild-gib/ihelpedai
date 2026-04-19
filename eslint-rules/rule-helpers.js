/**
 * Shared helpers for custom ESLint rules.
 */

function getFilename(context) {
  return context.filename
}

function isTestFile(context) {
  const f = getFilename(context)
  return /\.(test|spec)\.[tj]sx?$/.test(f) || f.includes('/src/test/')
}

function isE2eFile(context) {
  return getFilename(context).includes('/e2e/')
}

function isConfigFile(context) {
  return /\.config\.[cm]?[tj]s$/.test(getFilename(context))
}

export { getFilename, isTestFile, isE2eFile, isConfigFile }
