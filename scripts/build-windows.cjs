const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cliPath = path.join(process.cwd(), 'node_modules', 'electron-builder', 'cli.js');
const outputPath = path.join(process.env.LOCALAPPDATA || require('node:os').tmpdir(), 'Fastlynox', 'windows-build');
const args = [cliPath, '--win', 'nsis', '--x64', `--config.directories.output=${outputPath}`, ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, { stdio: 'inherit', windowsHide: true });

if (result.error) {
  console.error(`Could not start the Windows packager: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
