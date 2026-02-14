import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const roots = [
  'convex/sdk',
  'src/app/projects/[id]/sdk-agent/_components',
]

const includeExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.md', '.json'])
const badPatterns = [
  /Ã/g,
  /Â/g,
  /â€[^\s]*/g,
  /Ã¢â‚¬/g,
  /×(?=[^\u0590-\u05FF\d\s])/g,
  /�/g,
]

function shouldScan(filePath) {
  const idx = filePath.lastIndexOf('.')
  if (idx === -1) return false
  return includeExt.has(filePath.slice(idx))
}

function walk(dir, out = []) {
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full, out)
      continue
    }
    if (stat.isFile() && shouldScan(full)) out.push(full)
  }
  return out
}

const cwd = process.cwd()
const files = roots.flatMap((root) => walk(join(cwd, root)))
const violations = []

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  const lines = content.split(/\r?\n/)
  lines.forEach((line, index) => {
    for (const pattern of badPatterns) {
      pattern.lastIndex = 0
      if (pattern.test(line)) {
        violations.push({
          file: relative(cwd, file).replace(/\\/g, '/'),
          line: index + 1,
          sample: line.trim().slice(0, 180),
        })
        break
      }
    }
  })
}

if (violations.length > 0) {
  console.error('Mojibake markers detected in SDK paths:')
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} ${v.sample}`)
  }
  process.exit(1)
}

console.log(`Mojibake check passed (${files.length} files scanned).`)
