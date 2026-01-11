
const { spawn } = require('child_process');

const id = process.argv[2];
if (!id) { console.error("Please provide ChangeSet ID"); process.exit(1); }
// Escape quotes for Windows shell (batch/cmd)
const args = JSON.stringify({ changeSetId: id }).replace(/"/g, '\\"');

console.log(`Applying ChangeSet ${id} with args: ${args}`);

const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(cmd, ['convex', 'run', 'changeSets:applyChangeSet', args], {
    stdio: 'inherit',
    shell: true // Required for .cmd files on Windows
});

child.on('close', (code) => {
    if (code !== 0) {
        console.error(`Process exited with code ${code}`);
        process.exit(code);
    }
    console.log("Success!");
});
