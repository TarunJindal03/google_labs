#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."
export PORT=${PORT:-3000}

[ -f package.json ] || { echo "FAIL  package.json missing"; exit 1; }
[ -f server.js ] || { echo "FAIL  server.js missing"; exit 1; }
[ -f public/index.html ] || { echo "FAIL  public/index.html missing"; exit 1; }

npm install --silent || { echo "FAIL  npm install"; exit 1; }
node --check server.js || { echo "FAIL  syntax error in server.js"; exit 1; }

# No hardcoded API keys
if grep -rE "AIza[0-9A-Za-z_-]{30,}" server.js public 2>/dev/null; then
  echo "FAIL  hardcoded API key found"; exit 1
fi

node server.js > /tmp/saathi.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT

for i in $(seq 1 20); do
  curl -s "http://localhost:$PORT/" > /dev/null && break
  sleep 0.5
done

node scripts/verify.js
RESULT=$?
[ $RESULT -ne 0 ] && { echo "--- server log ---"; tail -20 /tmp/saathi.log; }
exit $RESULT
