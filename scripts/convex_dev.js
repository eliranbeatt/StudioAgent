const { spawn } = require('child_process')
const path = require('path')

function getConvexBin() {
  if (process.platform === 'win32') {
    return path.join(__dirname, '..', 'node_modules', '.bin', 'convex.cmd')
  }
  return path.join(__dirname, '..', 'node_modules', '.bin', 'convex')
}

function main() {
  const insecure = process.argv.includes('--insecure')

  const convexBin = getConvexBin()
  const env = { ...process.env }
  if (insecure) {
    env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    console.error(
      'Warning: NODE_TLS_REJECT_UNAUTHORIZED=0 disables certificate verification (insecure).'
    )
  }

  const child =
    process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', `${convexBin} dev`], {
          env,
          stdio: 'inherit',
        })
      : spawn(convexBin, ['dev'], {
          env,
          stdio: 'inherit',
        })

  child.on('exit', (code) => process.exit(code ?? 0))
  child.on('error', (err) => {
    console.error(String(err))
    process.exit(1)
  })
}

main()
