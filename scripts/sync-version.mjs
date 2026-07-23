import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]?.trim()
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

if (process.argv.length !== 3 || !version || !semverPattern.test(version)) {
  console.error('Usage: npm run version:sync -- <version>')
  console.error('Version must be semantic versioning without the v prefix (for example: 0.3.0 or 0.3.0-beta.1).')
  process.exit(1)
}

const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = resolve(scriptDir, '..')

function replaceOnce(content, pattern, replacement, filePath) {
  let replacements = 0
  const updated = content.replace(pattern, (...args) => {
    replacements += 1
    return replacement(...args)
  })

  if (replacements !== 1) {
    throw new Error(`Expected one version entry in ${filePath}, found ${replacements}.`)
  }

  return updated
}

const files = [
  {
    path: 'package.json',
    update: (content) => replaceOnce(
      content,
      /^(\s*"version"\s*:\s*)"[^"]+"/m,
      (_, prefix) => `${prefix}"${version}"`,
      'package.json',
    ),
  },
  {
    path: 'package-lock.json',
    update: (content) => {
      const rootUpdated = replaceOnce(
        content,
        /^(\s*"version"\s*:\s*)"[^"]+"/m,
        (_, prefix) => `${prefix}"${version}"`,
        'package-lock.json root package',
      )

      return replaceOnce(
        rootUpdated,
        /(^[ \t]*""\s*:\s*\{\r?\n^[ \t]*"name"\s*:\s*"ai-novel",\r?\n^[ \t]*"version"\s*:\s*)"[^"]+"/m,
        (_, prefix) => `${prefix}"${version}"`,
        'package-lock.json workspace package',
      )
    },
  },
  {
    path: 'src-tauri/tauri.conf.json',
    update: (content) => replaceOnce(
      content,
      /^(\s*"version"\s*:\s*)"[^"]+"/m,
      (_, prefix) => `${prefix}"${version}"`,
      'src-tauri/tauri.conf.json',
    ),
  },
  {
    path: 'src-tauri/Cargo.toml',
    update: (content) => replaceOnce(
      content,
      /(\[package\][\s\S]*?^version\s*=\s*)"[^"]+"/m,
      (_, prefix) => `${prefix}"${version}"`,
      'src-tauri/Cargo.toml',
    ),
  },
  {
    path: 'src-tauri/Cargo.lock',
    update: (content) => replaceOnce(
      content,
      /(\[\[package\]\]\r?\nname = "ai-novel"\r?\nversion = )"[^"]+"/,
      (_, prefix) => `${prefix}"${version}"`,
      'src-tauri/Cargo.lock',
    ),
  },
]

const updatedFiles = await Promise.all(files.map(async ({ path, update }) => {
  const absolutePath = resolve(projectRoot, path)
  const content = await readFile(absolutePath, 'utf8')
  return { absolutePath, path, content: update(content) }
}))

await Promise.all(updatedFiles.map(({ absolutePath, content }) => writeFile(absolutePath, content, 'utf8')))

console.log(`Synchronized project version to ${version}:`)
for (const { path } of updatedFiles) console.log(`- ${path}`)
