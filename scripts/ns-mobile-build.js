#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const mobileAppPath = path.join(repoRoot, 'apps', 'mobile');
const [, , platformArg = 'android', ...cliArgs] = process.argv;
const platform = platformArg.startsWith('--') ? 'android' : platformArg;
const extraArgs = platformArg.startsWith('--') ? [platformArg, ...cliArgs] : cliArgs;

const nsArgs = ['build', platform, '--path', mobileAppPath, ...extraArgs];

const child = spawn('ns', nsArgs, {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    npm_config_location: 'global', // avoid ENOWORKSPACES inside npm workspaces
  },
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});
