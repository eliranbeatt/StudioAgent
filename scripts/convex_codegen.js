const { spawnSync } = require('child_process')
const path = require('path')

function getConvexBin() {
  if (process.platform === 'win32') {
    return path.join(__dirname, '..', 'node_modules', '.bin', 'convex.cmd')
  }
  return path.join(__dirname, '..', 'node_modules', '.bin', 'convex')
}

function runConvexCodegen(env) {
  const convexBin = getConvexBin()
  const result =
    process.platform === 'win32'
        ? spawnSync('cmd.exe', ['/d', '/s', '/c', `${convexBin} codegen`], {
          env: { ...process.env, ...env },
          stdio: ['inherit', 'pipe', 'pipe'],
          encoding: 'utf8',
        })
      : spawnSync(convexBin, ['codegen'], {
          env: { ...process.env, ...env },
          stdio: ['inherit', 'pipe', 'pipe'],
          encoding: 'utf8',
        })

  if (result.error) {
    console.error(String(result.error))
  }

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  return result
}

function main() {
  const insecure = process.argv.includes('--insecure')

  const first = runConvexCodegen({})
  if (first.status === 0) process.exit(0)

  const combinedErr = `${first.stderr ?? ''}${first.stdout ?? ''}`
  const looksLikeTlsError = /unable to get local issuer certificate|self signed certificate|fetch failed/i.test(
    combinedErr
  )

  if (!looksLikeTlsError) {
    process.exit(first.status ?? 1)
  }

  if (!insecure) {
    console.error('\nConvex codegen failed due to TLS certificate validation.')
    console.error('If you are on a restricted corporate network, rerun with:')
    console.error('  npm run codegen:insecure')
    console.error('\nOr configure your machine/Node to trust your corporate root CA.')
    process.exit(first.status ?? 1)
  }

  console.error('\nRetrying Convex codegen with NODE_TLS_REJECT_UNAUTHORIZED=0 (insecure)...')
  const second = runConvexCodegen({ NODE_TLS_REJECT_UNAUTHORIZED: '0' })
  process.exit(second.status ?? 1)
}

main()
