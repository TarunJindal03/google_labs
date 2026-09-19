
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const PORT = process.env.PORT || 3000;

function fail(msg) {
  console.error('FAIL  ' + msg);
  process.exit(1);
}

// 1. Files existence
if (!fs.existsSync('package.json')) fail('package.json missing');
if (!fs.existsSync('server.js')) fail('server.js missing');
if (!fs.existsSync('public/index.html')) fail('public/index.html missing');

// 2. Syntax check
try {
  execSync('node --check server.js', { stdio: 'pipe' });
} catch (e) {
  fail('syntax error in server.js');
}

// 3. Check for hardcoded API keys
const keyRegex = /AIza[0-9A-Za-z_-]{30,}/;
const serverContent = fs.readFileSync('server.js', 'utf8');
const htmlContent = fs.readFileSync('public/index.html', 'utf8');
if (keyRegex.test(serverContent) || keyRegex.test(htmlContent)) {
  fail('hardcoded API key found');
}

// 4. Start server
console.log('Starting Saathi server on port ' + PORT + '...');
const serverProcess = spawn('node', ['server.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
serverProcess.stdout.on('data', (d) => { serverOutput += d.toString(); });
serverProcess.stderr.on('data', (d) => { serverOutput += d.toString(); });

function cleanup() {
  try {
    serverProcess.kill('SIGTERM');
  } catch (e) {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
process.on('SIGTERM', () => { cleanup(); process.exit(1); });

async function waitForServer() {
  for (let i = 0; i < 25; i++) {
    try {
      const res = await fetch('http://localhost:' + PORT + '/');
      if (res.ok) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function main() {
  const ready = await waitForServer();
  if (!ready) {
    console.error('--- server log ---');
    console.error(serverOutput);
    fail('Server failed to start within timeout');
  }

  console.log('Server is responsive. Running verify.js...');
  const verifyProcess = spawn('node', ['scripts/verify.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit'
  });

  verifyProcess.on('close', (code) => {
    cleanup();
    if (code !== 0) {
      console.error('--- server log ---');
      console.error(serverOutput);
    }
    process.exit(code);
  });
}

main().catch(err => {
  cleanup();
  console.error('Unexpected check error:', err);
  process.exit(1);
});
