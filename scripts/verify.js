
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 3000;
const BASE_URL = 'http://localhost:' + PORT;

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL: ' + message);
    process.exit(1);
  }
}

async function request(path, options = {}) {
  const url = BASE_URL + path;
  const res = await fetch(url, options);
  let json = null;
  try {
    json = await res.json();
  } catch (e) {}
  return { status: res.status, data: json };
}

async function runVerification() {
  console.log('--- Starting Saathi Verification Suite ---');

  // 1. Check Files
  console.log('[1/5] Checking required files...');
  assert(fs.existsSync('package.json'), 'package.json missing');
  assert(fs.existsSync('server.js'), 'server.js missing');
  assert(fs.existsSync('public/index.html'), 'public/index.html missing');

  // 2. Security: Check for hardcoded API keys
  console.log('[2/5] Checking for hardcoded API keys...');
  const serverCode = fs.readFileSync('server.js', 'utf8');
  const htmlCode = fs.readFileSync('public/index.html', 'utf8');
  const keyRegex = /AIza[0-9A-Za-z_-]{30,}/;
  assert(!keyRegex.test(serverCode), 'Hardcoded API key found in server.js');
  assert(!keyRegex.test(htmlCode), 'Hardcoded API key found in public/index.html');

  // 3. UI Requirements in public/index.html
  console.log('[3/5] Checking UI rules in public/index.html...');
  assert(htmlCode.includes('id="font-slider"'), 'Missing id="font-slider"');
  assert(htmlCode.includes('id="contrast-toggle"'), 'Missing id="contrast-toggle"');
  assert(htmlCode.includes('id="simple-toggle"'), 'Missing id="simple-toggle"');
  assert(htmlCode.includes('id="back-home"'), 'Missing id="back-home"');
  assert(htmlCode.toLowerCase().includes('electricity bill'), 'Missing sample electricity bill');
  assert(htmlCode.toLowerCase().includes('kyc'), 'Missing sample KYC message');
  assert(htmlCode.includes('56px'), 'Missing min-height 56px button specification');
  assert(htmlCode.includes('20px'), 'Missing base font 20px specification');

  // 4. Test API Endpoints
  console.log('[4/5] Testing API Endpoints on ' + BASE_URL + '...');

  // 4a. /api/simplify empty input
  const simEmpty = await request('/api/simplify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '' })
  });
  assert(simEmpty.status === 400, 'POST /api/simplify empty input must return 400, got ' + simEmpty.status);
  assert(simEmpty.data && typeof simEmpty.data.error === 'string', 'POST /api/simplify empty input must return {error}');

  // 4b. /api/simplify valid input
  const simValid = await request('/api/simplify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'MAHAVITARAN ELECTRICITY BILL NOTICE: Amount Payable: Rs 1,420. Due Date: 25th of this month.' })
  });
  assert(simValid.status === 200, 'POST /api/simplify valid input must return 200, got ' + simValid.status);
  assert(simValid.data && typeof simValid.data.summary === 'string', 'POST /api/simplify must return summary string');
  assert(Array.isArray(simValid.data.actions), 'POST /api/simplify must return actions array');
  assert(simValid.data.deadline !== undefined, 'POST /api/simplify must return deadline string or null');

  // 4c. /api/scam empty input
  const scamEmpty = await request('/api/scam', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '' })
  });
  assert(scamEmpty.status === 400, 'POST /api/scam empty input must return 400, got ' + scamEmpty.status);
  assert(scamEmpty.data && typeof scamEmpty.data.error === 'string', 'POST /api/scam empty input must return {error}');

  // 4d. /api/scam valid input (Danger)
  const scamDanger = await request('/api/scam', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'URGENT: Bank account BLOCKED due to expired KYC! Click bit.ly/test now.' })
  });
  assert(scamDanger.status === 200, 'POST /api/scam valid input must return 200, got ' + scamDanger.status);
  assert(['Safe', 'Suspicious', 'Danger'].includes(scamDanger.data.verdict), 'POST /api/scam must return valid verdict');
  assert(Array.isArray(scamDanger.data.reasons), 'POST /api/scam must return reasons array');
  assert(typeof scamDanger.data.advice === 'string', 'POST /api/scam must return advice string');
  assert(scamDanger.data.verdict === 'Danger', 'KYC threat must be evaluated as Danger, got ' + scamDanger.data.verdict);

  // 4e. /api/scam valid input (Safe)
  const scamSafe = await request('/api/scam', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '492019 is your secret OTP for login. Never share this OTP with anyone.' })
  });
  assert(scamSafe.status === 200, 'POST /api/scam valid safe input must return 200');
  assert(scamSafe.data.verdict === 'Safe', 'Legitimate OTP notification should be Safe, got ' + scamSafe.data.verdict);

  // 4f. /api/ask empty input
  const askEmpty = await request('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: '' })
  });
  assert(askEmpty.status === 400, 'POST /api/ask empty input must return 400, got ' + askEmpty.status);
  assert(askEmpty.data && typeof askEmpty.data.error === 'string', 'POST /api/ask empty input must return {error}');

  // 4g. /api/ask valid input
  const askValid = await request('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Tell me a gentle joke' })
  });
  assert(askValid.status === 200, 'POST /api/ask valid input must return 200, got ' + askValid.status);
  assert(askValid.data && typeof askValid.data.answer === 'string' && askValid.data.answer.length > 0, 'POST /api/ask must return answer string');

  // 4h. /api/ask simple words toggle
  const askSimple = await request('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'How to exercise my knees?', simple: true })
  });
  assert(askSimple.status === 200, 'POST /api/ask simple=true must return 200');
  // 4i. /api/health
  const healthRes = await request('/api/health');
  assert(healthRes.status === 200, 'GET /api/health must return 200');
  assert(healthRes.data && healthRes.data.status === 'ok', 'GET /api/health must return status ok');

  // 4j. /api/prescription empty input
  const rxEmpty = await request('/api/prescription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: '' })
  });
  assert(rxEmpty.status === 400, 'POST /api/prescription empty input must return 400');

  // 4k. /api/prescription valid fallback
  const rxValid = await request('/api/prescription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      mimeType: 'image/png'
    })
  });
  assert(rxValid.status === 200, 'POST /api/prescription valid input must return 200');
  assert(rxValid.data && Array.isArray(rxValid.data.medicines), 'POST /api/prescription must return medicines array');

  // 4l. /api/today with Laxmi Jindal name
  const todayRes = await request('/api/today', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Laxmi Jindal' })
  });
  assert(todayRes.status === 200, 'POST /api/today must return 200');
  assert(todayRes.data && todayRes.data.greeting && todayRes.data.greeting.includes('Laxmi Jindal'), 'POST /api/today must personalize greeting for Laxmi Jindal');

  // 4m. /api/prescription with PDF payload
  const dummyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF').toString('base64');
  const rxPdfRes = await request('/api/prescription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: dummyPdf,
      mimeType: 'application/pdf'
    })
  });
  assert(rxPdfRes.status === 200, 'POST /api/prescription with PDF must return 200');
  assert(rxPdfRes.data && rxPdfRes.data.readable === true, 'PDF prescription must be readable');
  assert(Array.isArray(rxPdfRes.data.medicines) && rxPdfRes.data.medicines.length > 0, 'PDF prescription must return extracted medicines');

  // 4n. WhatsApp flow check for Laxmi Jindal -> Rahul (Son)
  assert(htmlCode.includes('id="rx-share-wa"'), 'Missing id="rx-share-wa" for WhatsApp sharing');
  assert(htmlCode.includes('api.whatsapp.com/send'), 'Missing WhatsApp universal API URL');
  assert(htmlCode.includes('Laxmi Jindal'), 'Missing default elder persona Laxmi Jindal');
  assert(htmlCode.includes('Rahul (Son)'), 'Missing default emergency contact Rahul');

  // 5. Test Frontend Static Serving
  console.log('[5/5] Testing public/index.html serving...');
  const resHtml = await fetch(BASE_URL + '/');
  assert(resHtml.status === 200, 'GET / must return 200');
  const htmlContent = await resHtml.text();
  assert(htmlContent.includes('Saathi'), 'GET / must serve index.html containing Saathi');

  console.log('\n==============================');
  console.log('      ALL CHECKS PASSED       ');
  console.log('==============================');
}

runVerification().catch(err => {
  console.error('FAIL: Unexpected verification error:', err);
  process.exit(1);
});
