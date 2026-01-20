const { spawnSync } = require('child_process')
const path = require('path')

function getConvexBin() {
  if (process.platform === 'win32') {
    return path.join(__dirname, '..', 'node_modules', '.bin', 'convex.cmd')
  }
  return path.join(__dirname, '..', 'node_modules', '.bin', 'convex')
}

function runConvexLogin(env) {
  const convexBin = getConvexBin()
  const result =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', `${convexBin} login`], {
          env: { ...process.env, ...env },
          stdio: 'inherit',
        })
      : spawnSync(convexBin, ['login'], {
          env: { ...process.env, ...env },
          stdio: 'inherit',
        })

  return result
}

function main() {
  const insecure = process.argv.includes('--insecure')

  if (!insecure) {
    const r = runConvexLogin({})
    process.exit(r.status ?? 1)
  }

  console.error(
    'Warning: NODE_TLS_REJECT_UNAUTHORIZED=0 disables certificate verification (insecure).'
  )
  const r = runConvexLogin({ NODE_TLS_REJECT_UNAUTHORIZED: '0' })
  process.exit(r.status ?? 1)
}

main()
