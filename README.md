# AutoFill Engine

> One-click job application autofill. Upload your resume once, fill any form instantly.

A Chrome/Edge browser extension that parses your resume with Gemini AI and auto-fills job application forms on any portal — Lever, Greenhouse, Workday, Ashby, and more.

## Features

- **AI-powered resume parsing** — Gemini 2.5 Flash extracts structured data from PDF/DOCX
- **One-click form fill** — fills name, email, phone, location, LinkedIn, GitHub, and more
- **Framework-agnostic** — bypasses React, Vue, and Angular controlled inputs using native setters
- **Smart label detection** — 8 strategies including `aria-label`, `data-automation-id`, and parent walk
- **Fuzzy dropdown matching** — selects the right option even when labels don't match exactly
- **Multi-step form support** — MutationObserver auto-fills dynamically loaded sections
- **Offline-first** — profile stored locally in the browser, no server needed after parsing
- **Visual feedback** — toast notification confirms how many fields were filled

## Quick Start

```bash
# Backend
cd backend && npm install && npm run dev

# Extension
# Chrome → chrome://extensions → Developer mode → Load unpacked → select extension/
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | Chrome Manifest V3, Vanilla JS |
| Backend | Node.js, Express |
| AI | Gemini 2.5 Flash |
| Database | MongoDB Atlas (optional) |
| Hosting | Vercel (serverless) |

## Architecture

```
├── backend/
│   ├── server.js                  Express app (Vercel-compatible)
│   ├── routes/resumeRoutes.js     POST /api/resume/parse, GET /api/profile/:userId
│   ├── services/geminiService.js  Gemini structured extraction
│   ├── utils/documentParser.js    PDF/DOCX → plain text
│   └── models/UserProfile.js     Mongoose schema
│
└── extension/
    ├── manifest.json              Manifest V3
    ├── popup/                     Upload UI + profile display
    ├── content/content.js         Autofill injection engine
    ├── background/service-worker.js  Badge + storage management
    └── styles/content.css         In-page toast styles
```

## How It Works

1. **Upload** — Extension sends resume to `POST /api/resume/parse`
2. **Extract** — Backend pulls text via pdf-parse / mammoth
3. **Parse** — Gemini returns structured JSON (personal, education, experience, skills, links)
4. **Store** — Profile saved to `chrome.storage.local` + optional MongoDB sync
5. **Fill** — Content script matches form fields by label and sets values with native setters
6. **Observe** — MutationObserver re-fills when new form sections appear

## Browser Support

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | ✅ | — |
| Edge | ✅ | — |
| Brave | ✅ | — |
| Opera | ✅ | — |
| Kiwi Browser | — | ✅ Android |
| Firefox | ❌ | ❌ |
| Safari | ❌ | ❌ |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | [Google AI API key](https://aistudio.google.com/apikey) |
| `MONGODB_URI` | No | MongoDB Atlas connection string |
| `PORT` | No | Server port (default: `8080`) |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/resume/parse` | Upload + parse resume (multipart/form-data) |
| `GET` | `/api/profile/:userId` | Retrieve stored profile |

