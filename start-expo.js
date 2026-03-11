const { execSync } = require('child_process');
const path = require('path');
process.chdir(__dirname);
const expoBin = path.join(__dirname, 'node_modules', 'expo', 'bin', 'cli');
execSync(`node "${expoBin}" start --lan --port 8081`, {
  stdio: 'inherit',
  cwd: __dirname,
});
