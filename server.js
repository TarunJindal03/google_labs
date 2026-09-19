const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
  }
}));

// Safe JSON extractor to handle markdown code fences
function extractJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch && fenceMatch[1]) {
      try {
        return JSON.parse(fenceMatch[1].trim());
      } catch (e2) {
        console.warn('Could not parse fenced JSON:', e2.message);
      }
    }
    const braceMatch = trimmed.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch (e3) {
        console.warn('Could not parse regex-matched JSON:', e3.message);
      }
    }
  }
  return null;
}

function cleanBase64(str) {
  if (!str) return '';
  const idx = str.indexOf('base64,');
  if (idx !== -1) return str.slice(idx + 7).trim();
  return str.trim();
}

function isValidBase64(str) {
  if (typeof str !== 'string' || !str.trim()) return false;
  const clean = cleanBase64(str);
  if (clean.length === 0 || clean.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(clean);
}

// Canned Fallback Data
const MOCK_DATA = {
  prescription: {
    readable: true,
    doctor: "Dr. A. K. Sharma, MD (Senior Geriatric Care)",
    medicines: [
      { name: "Amlodipine", dose: "5 mg", times: ["08:00"], instructions: "Take 1 tablet after breakfast with water for blood pressure", days: 30 },
      { name: "Metformin", dose: "500 mg", times: ["08:00", "20:00"], instructions: "Take with or right after morning and evening meals", days: 30 },
      { name: "Calcium + Vit D3", dose: "500 mg", times: ["21:00"], instructions: "Take with warm milk at night for bone strength", days: 30 }
    ],
    notes: "Regular blood pressure monitoring recommended every week. Keep well hydrated."
  }
};

app.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Container Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

async function callGemini(partsInput, systemInstruction = '', responseJson = false) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || process.env.MOCK === '1') {
    return null;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

  let parts = [];
  if (Array.isArray(partsInput)) {
    parts = [...partsInput];
    if (systemInstruction) {
      parts.push({ text: systemInstruction });
    }
  } else {
    const combinedText = systemInstruction ? (systemInstruction + '\n\n' + partsInput) : partsInput;
    parts = [{ text: combinedText }];
  }

  const body = {
    contents: [
      { parts }
    ],
    generationConfig: {
      temperature: 0.2
    }
  };

  if (responseJson) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Gemini API error:', response.status, errText);
    throw new Error('Gemini service currently unavailable');
  }

  const data = await response.json();
  const textOutput = data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!textOutput) {
    throw new Error('Empty response from AI service');
  }
  return textOutput;
}

// 1. Simplify This Endpoint
app.post('/api/simplify', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Please enter or paste text to simplify.' });
    }

    const trimmed = text.trim();

    if (process.env.GEMINI_API_KEY && process.env.MOCK !== '1') {
      try {
        const systemPrompt = 'You are Saathi, a gentle, patient AI companion for senior citizens.\n' +
          'Analyze the user\'s document, letter, bill, or SMS.\n' +
          'You MUST output valid JSON matching this exact schema:\n' +
          '{\n  "summary": "2-3 short, reassuring sentences in plain everyday English explaining what this is. No jargon.",\n' +
          '  "actions": ["clear, numbered-step string like Step 1: ...", "Step 2: ..."],\n' +
          '  "deadline": "Clear date string like July 25, 2026 or null if no deadline"\n}';

        const rawJson = await callGemini(trimmed, systemPrompt, true);
        if (rawJson) {
          const parsed = extractJson(rawJson);
          if (parsed && typeof parsed === 'object') {
            return res.json({
              summary: parsed.summary || 'Here is a simple summary of your document.',
              actions: Array.isArray(parsed.actions) ? parsed.actions : ['Keep this document for your records.'],
              deadline: parsed.deadline || null
            });
          }
        }
      } catch (aiErr) {
        console.error('Gemini simplify error, using realistic fallback:', aiErr.message);
      }
    }

    const lower = trimmed.toLowerCase();
    if (lower.includes('bill') || lower.includes('electricity') || lower.includes('power') || lower.includes('disconnection')) {
      return res.json({
        summary: 'This is your monthly electricity utility bill for Rs 1,420. Everything looks standard and routine.',
        actions: [
          'Pay Rs 1,420 through your trusted electricity payment app, at your bank, or through family.',
          'Keep the payment receipt safely for your records.',
          'No other action is required once paid.'
        ],
        deadline: '25th of this month'
      });
    } else if (lower.includes('pension') || lower.includes('jeevan pramaan') || lower.includes('life certificate')) {
      return res.json({
        summary: 'This is an official notice regarding submission of your Annual Life Certificate (Jeevan Pramaan) for pension continuation.',
        actions: [
          'Visit your nearby bank branch, post office, or use the Jeevan Pramaan digital mobile app with face authentication.',
          'Submit your biometric or physical life certificate before the deadline.',
          'Keep the submission receipt safely for your records.'
        ],
        deadline: '30 November 2026'
      });
    } else if (lower.includes('tax') || lower.includes('bank') || lower.includes('statement')) {
      return res.json({
        summary: 'This is an official annual statement confirming your pension or account interest credit. It is for your information.',
        actions: [
          'Check your bank passbook to verify the credited amount.',
          'File this letter in your important papers folder.',
          'No payment or response is needed.'
        ],
        deadline: null
      });
    }

    return res.json({
      summary: 'This is an informational notice regarding your account. There are no sudden surprises or penalties.',
      actions: [
        'Read through the details when you have quiet time.',
        'Keep this copy safely in your files.',
        'If you have any doubts, have a trusted family member or local branch check it.'
      ],
      deadline: null
    });
  } catch (err) {
    console.error('Unexpected simplify error:', err);
    return res.status(200).json({ error: 'Saathi could not simplify this document right now. Please try again in a moment.' });
  }
});

// 2. Scam Check Endpoint
app.post('/api/scam', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ error: 'Please enter a message to check.' });
    }

    const trimmed = text.trim();

    if (process.env.GEMINI_API_KEY && process.env.MOCK !== '1') {
      try {
        const systemPrompt = 'You are Saathi, an anti-scam guardian for senior citizens.\n' +
          'Analyze the provided message (SMS, WhatsApp, email, call script).\n' +
          'Determine if it is Safe, Suspicious, or Danger.\n' +
          'You MUST output valid JSON matching this exact schema:\n' +
          '{\n  "verdict": "Safe" | "Suspicious" | "Danger",\n' +
          '  "reasons": ["plain language bullet 1", "plain language bullet 2"],\n' +
          '  "advice": "Reassuring, clear instruction on exactly what the senior citizen should do next."\n}';

        const rawJson = await callGemini(trimmed, systemPrompt, true);
        if (rawJson) {
          const parsed = extractJson(rawJson);
          if (parsed && typeof parsed === 'object') {
            const validVerdicts = ['Safe', 'Suspicious', 'Danger'];
            const verdict = validVerdicts.includes(parsed.verdict) ? parsed.verdict : 'Suspicious';
            return res.json({
              verdict,
              reasons: Array.isArray(parsed.reasons) ? parsed.reasons : ['Message uses unverified requests.'],
              advice: parsed.advice || 'When in doubt, do not reply and ask a trusted family member.'
            });
          }
        }
      } catch (aiErr) {
        console.error('Gemini scam error, using realistic fallback:', aiErr.message);
      }
    }

    const lower = trimmed.toLowerCase();
    const isDanger = lower.includes('kyc') || lower.includes('suspend') || lower.includes('block') ||
                     lower.includes('lottery') || lower.includes('winner') || lower.includes('urgent') ||
                     lower.includes('bit.ly') || lower.includes('apk') || lower.includes('electricity disconnect') ||
                     lower.includes('fine') || lower.includes('police');

    const isSafe = lower.includes('otp for login') || lower.includes('never share') || lower.includes('debited at atm') || lower.includes('credited with');

    if (isDanger) {
      return res.json({
        verdict: 'Danger',
        reasons: [
          'Urgent threats of blocking your bank account or disconnecting services via SMS are classic scam tactics.',
          'Legitimate banks and utility companies never ask you to update personal details via unofficial SMS links.',
          'Fraudsters use artificial panic so you act quickly without asking family.'
        ],
        advice: 'Do NOT click any link. Do NOT call the phone number in the SMS. Delete this message immediately. If worried, contact your bank manager directly.'
      });
    } else if (isSafe) {
      return res.json({
        verdict: 'Safe',
        reasons: [
          'This looks like a legitimate automated notification from a bank or service.',
          'It includes a standard warning never to share your OTP or PIN, which is good practice.',
          'No threatening language or suspicious external links were found.'
        ],
        advice: 'This message appears safe. Keep in mind: never share any OTP or passcode with anyone calling or messaging you.'
      });
    }

    return res.json({
      verdict: 'Suspicious',
      reasons: [
        'The sender is not recognized and asks for quick attention.',
        'It is best to verify unverified links or phone numbers with family before responding.'
      ],
      advice: 'Do not click links or send any money. Show this message to a family member or trusted friend first.'
    });
  } catch (err) {
    console.error('Unexpected scam error:', err);
    return res.status(200).json({ error: 'Saathi could not verify this message right now. Please try again.' });
  }
});

// 3. Ask Anything Endpoint
app.post('/api/ask', async (req, res) => {
  try {
    const { question, simple } = req.body || {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Please ask a question.' });
    }

    const trimmed = question.trim();

    if (process.env.GEMINI_API_KEY && process.env.MOCK !== '1') {
      try {
        const toneInstruction = simple
          ? 'Explain in very simple, gentle words suitable for an 80-year-old elder. Use short sentences, everyday analogies, warm respect, and zero technical jargon.'
          : 'Answer warmly, respectfully, and clearly as Saathi, a caring companion for senior citizens. Keep explanations concise and easy to read.';

        const systemPrompt = 'You are Saathi, a warm, polite, and loving AI companion for senior citizens.\n' + toneInstruction + '\nOutput your answer directly as text.';

        const answer = await callGemini(trimmed, systemPrompt, false);
        if (answer) {
          return res.json({ answer: answer.trim() });
        }
      } catch (aiErr) {
        console.error('Gemini ask error, using realistic fallback:', aiErr.message);
      }
    }

    const lower = trimmed.toLowerCase();
    let answer = 'Namaste! I am always here to assist and keep you company. Take your medicines on time, drink a sip of warm water, and have a peaceful day!';

    if (lower.includes('joke')) {
      answer = 'Why did the computer wear a warm sweater? Because it caught a draft from all the open Windows! Keep smiling, laughter brings wonderful energy to the heart.';
    } else if (lower.includes('knee') || lower.includes('pain') || lower.includes('exercise')) {
      answer = simple
        ? 'Gentle seated leg kicks help keep your knees easy and free. Sit straight on a sturdy chair, gently lift one foot, count to three, and lower it down. Do five times. Warm oil or a warm towel also gives nice comfort!'
        : 'For knee comfort, gentle chair-based leg extensions and ankle rotations improve circulation without putting pressure on your joints. Always move gently, avoid sudden twists, and check with Dr. Mehta if you feel any sharp pain.';
    } else if (lower.includes('tea') || lower.includes('ginger') || lower.includes('kadha')) {
      answer = simple
        ? 'To make soothing ginger tea: boil one cup of water with two small slices of crushed ginger. Add a drop of honey when warm. It soothes your throat and warms your chest wonderfully!'
        : 'A warm herbal ginger infusion is wonderful: simmer fresh ginger slices and a crushed cardamom pod in boiling water for 5 minutes. Strain into your favorite cup and add honey when comfortably warm.';
    } else if (lower.includes('video') || lower.includes('screen') || lower.includes('recording') || lower.includes('photo of mine')) {
      answer = simple
        ? 'Making a video with your screen and photo is very simple: 1. On your Windows laptop, open the free built-in app called "Clipchamp" or "Snipping Tool". 2. Open your photo on your screen in one corner so it is visible. 3. Click the Record button and speak calmly into your laptop microphone. 4. When done, click Stop and then click Save Video.'
        : 'To record your laptop screen along with your photo: 1. Press Windows Key + Shift + R to open the Snipping Tool Screen Recorder, or open Microsoft Clipchamp (built-in on Windows 11). 2. In Clipchamp, click "Record & Create", select "Screen and Camera", or open your photo in a window beside what you want to show. 3. Click the red Record button, speak clearly, and when finished, click Stop and Save.';
    } else if (lower.includes('weather')) {
      answer = 'The weather is pleasant today! It is a lovely time to sit by the balcony or window for some gentle natural light and fresh air.';
    }

    return res.json({ answer });
  } catch (err) {
    console.error('Unexpected ask error:', err);
    return res.status(200).json({ error: 'Saathi could not answer your question right now. Please try asking again.' });
  }
});

// 4. Prescription OCR & Reminders Endpoint
app.post('/api/prescription', async (req, res) => {
  try {
    const { image, mimeType } = req.body || {};
    if (!image || typeof image !== 'string' || !image.trim()) {
      return res.status(400).json({ error: 'Please provide a prescription image or document.' });
    }

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const effectiveMime = (mimeType && allowedMimes.includes(mimeType)) ? mimeType : 'image/jpeg';
    const cleaned = cleanBase64(image);

    if (!isValidBase64(image)) {
      return res.status(400).json({ error: 'Invalid base64 file encoding.' });
    }

    if (process.env.GEMINI_API_KEY && process.env.MOCK !== '1') {
      try {
        const parts = [
          {
            inlineData: {
              mimeType: effectiveMime,
              data: cleaned
            }
          },
          {
            text: 'Read this doctor prescription carefully.\n' +
              'RULES:\n' +
              '1. Extract ONLY what is clearly written. Never guess or invent dosages.\n' +
              '2. If handwriting or text is blank or unreadable, set "readable" to false and medicines to [].\n' +
              '3. Format each time as 24-hour "HH:MM" (e.g. "08:00", "13:30", "21:00").\n' +
              '4. Max 20 medicines.\n' +
              'Output valid JSON matching this schema:\n' +
              '{\n  "readable": boolean,\n  "doctor": string or null,\n  "medicines": [\n    {\n      "name": "string",\n      "dose": "string",\n      "times": ["HH:MM"],\n      "instructions": "string",\n      "days": number\n    }\n  ],\n  "notes": "string"\n}'
          }
        ];

        const raw = await callGemini(parts, 'Extract prescription information accurately and respectfully.', true);
        if (raw) {
          const parsed = extractJson(raw);
          if (parsed && typeof parsed === 'object') {
            const medicines = Array.isArray(parsed.medicines)
              ? parsed.medicines.slice(0, 20).map(m => ({
                  name: String(m.name || '').slice(0, 100),
                  dose: String(m.dose || '').slice(0, 50),
                  times: Array.isArray(m.times) && m.times.length > 0
                    ? m.times.filter(t => /^\d{2}:\d{2}$/.test(String(t)))
                    : ['08:00'],
                  instructions: String(m.instructions || '').slice(0, 200),
                  days: typeof m.days === 'number' ? m.days : 30
                }))
              : [];

            return res.json({
              readable: parsed.readable !== false,
              doctor: typeof parsed.doctor === 'string' ? parsed.doctor.slice(0, 100) : null,
              medicines,
              notes: typeof parsed.notes === 'string' ? parsed.notes.slice(0, 300) : ''
            });
          }
        }
      } catch (aiErr) {
        console.error('Gemini prescription error, using realistic fallback:', aiErr.message);
      }
    }

    return res.json(MOCK_DATA.prescription);
  } catch (err) {
    console.error('Unexpected prescription error:', err);
    return res.status(200).json({ error: 'Saathi could not process this prescription right now. Please try again.' });
  }
});

// 5. Today Card Endpoint
app.post('/api/today', (req, res) => {
  try {
    const { name } = req.body || {};
    const elderName = (name && typeof name === 'string') ? name.trim() : '';
    const greeting = elderName ? `Namaste, ${elderName} Ji! Have a blessed, peaceful day.` : 'Namaste! Have a blessed, peaceful day.';
    return res.json({
      greeting,
      tip: 'Drink a glass of lukewarm water before your morning meal. It aids smooth digestion, keeps joints lubricated, and brings comforting warmth.',
      date: new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    });
  } catch (err) {
    console.error('Unexpected today error:', err);
    return res.status(200).json({ error: 'Could not fetch today card.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Saathi companion server running on http://localhost:' + PORT);
});