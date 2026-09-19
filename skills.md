# Skill: Saathi, senior citizen companion (Gemini)

## Stack (do not change)
- Node 18+, Express, no build step. `npm start` runs `node server.js` on port 3000.
- Frontend: `public/index.html` (single file, inline CSS/JS).
- Gemini called ONLY from server.js using env GEMINI_API_KEY (model: env GEMINI_MODEL or "gemini-2.5-flash").
- If GEMINI_API_KEY is missing or MOCK=1, return realistic canned responses so every flow still works.

## API contract (exact JSON shapes)
- POST /api/simplify {text} -> {summary, actions: string[], deadline: string|null}
- POST /api/scam {text} -> {verdict: "Safe"|"Suspicious"|"Danger", reasons: string[], advice: string}
- POST /api/ask {question, simple?: boolean} -> {answer}
- All errors return HTTP 200 with a friendly {error: "..."} message. Never crash or return a stack trace.
- Empty input returns 400 with {error}.

## UI rules
- Base font 20px+, high contrast, big buttons (min 56px tall).
- Home screen has 3 big tiles: Simplify This, Scam Check, Ask Anything (+ a "Today" card).
- Every screen has a "Back to Home" button (id="back-home").
- Accessibility bar: text size slider (id="font-slider"), high contrast toggle (id="contrast-toggle"), Simpler words toggle (id="simple-toggle").
- Each feature shows a loading state and a friendly error state. No dead ends.
- Include sample buttons: fake electricity bill, fake "KYC expired" SMS.

## Definition of done
1. Run `bash scripts/check.sh`.
2. If anything FAILS, fix the code and re-run. Repeat until it prints "ALL CHECKS PASSED".
3. Do not stop before that.