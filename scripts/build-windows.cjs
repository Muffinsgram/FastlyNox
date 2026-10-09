const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cliPath = path.join(process.cwd(), 'node_modules', 'electron-builder', 'cli.js');
const viteCliPath = path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const outputPath = path.join(process.env.LOCALAPPDATA || require('node:os').tmpdir(), 'Fastlynox', 'windows-build');
const buildEnv = { ...process.env, ELECTRON_BUILD: 'true' };
const viteBuild = spawnSync(process.execPath, [viteCliPath, 'build'], { stdio: 'inherit', env: buildEnv, windowsHide: true });
if (viteBuild.error) {
  console.error(`Could not start the Electron web build: ${viteBuild.error.message}`);
  process.exit(1);
}
if (viteBuild.status !== 0) process.exit(viteBuild.status ?? 1);

const args = [cliPath, '--win', 'nsis', '--x64', `--config.directories.output=${outputPath}`, ...process.argv.slice(2)];
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: buildEnv, windowsHide: true });

if (result.error) {
  console.error(`Could not start the Windows packager: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
