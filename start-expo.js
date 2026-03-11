const { execSync } = require('child_process');
const path = require('path');
process.chdir(__dirname);
const expoBin = path.join(__dirname, 'node_modules', 'expo', 'bin', 'cli');
const args = process.argv.slice(2).join(' ') || '--tunnel --port 8081';
execSync(`node "${expoBin}" start ${args}`, {
  stdio: 'inherit',
  cwd: __dirname,
});
