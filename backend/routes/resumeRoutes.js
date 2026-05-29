const express = require('express');
const multer = require('multer');
const { parseDocument } = require('../utils/documentParser');
const { extractProfile } = require('../services/geminiService');
const UserProfile = require('../models/UserProfile');

const router = express.Router();

// Maps raw errors to clean user-facing messages
function friendlyError(err) {
  const msg = (err.message || '').toLowerCase();

  if (msg.includes('invalid file type')) return 'Please upload a PDF or DOCX file.';
  if (msg.includes('limit_file_size')) return 'File too large. Max 5 MB.';
  if (msg.includes('pdf parsing failed')) return 'Couldn\'t read this PDF. It may be corrupted or password-protected.';
  if (msg.includes('docx parsing failed')) return 'Couldn\'t read this DOCX. It may be corrupted.';
  if (msg.includes('no text could be extracted')) return 'File appears scanned or image-based. Use a text-based PDF/DOCX.';
  if (msg.includes('unsupported file type')) return 'Only PDF and DOCX files are supported.';
  if (msg.includes('gemini') && msg.includes('api key')) return 'AI service not configured. Contact the administrator.';
  if (msg.includes('gemini') && (msg.includes('quota') || msg.includes('rate'))) return 'AI service is busy. Try again shortly.';
  if (msg.includes('gemini')) return 'AI service had an issue parsing your resume. Try again.';
  if (msg.includes('timeout') || msg.includes('econnrefused')) return 'Service temporarily unavailable. Try again shortly.';
  if (msg.includes('mongo') || msg.includes('not primary')) return 'Resume parsed, but cloud save failed. Stored locally instead.';

  return 'Something went wrong. Please try again.';
}

const ALLOWED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    ALLOWED_MIMES.includes(file.mimetype) ? cb(null, true) : cb(new Error('Invalid file type'), false);
  },
});

// POST /api/resume/parse — Upload + Gemini extraction
router.post('/resume/parse', upload.single('resume'), async (req, res) => {
  const t0 = Date.now();

  try {
    if (!req.file) return res.status(400).json({ error: 'Please select a resume file to upload.' });

    const userId = req.query.userId || req.body.userId || 'default_user';
    console.log(`[PARSE] ${req.file.originalname} (${req.file.size}B) for ${userId}`);

    const rawText = await parseDocument(req.file.buffer, req.file.mimetype);
    const profileData = await extractProfile(rawText);

    // Non-blocking DB save — profile returned regardless
    let dbSaved = false;
    try {
      await UserProfile.findOneAndUpdate(
        { userId },
        { ...profileData, rawText, userId },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
      dbSaved = true;
    } catch (dbErr) {
      console.warn('[PARSE] DB save failed (non-fatal):', dbErr.message);
    }

    console.log(`[PARSE] Done in ${Date.now() - t0}ms | DB: ${dbSaved}`);
    res.json({ success: true, profile: profileData, dbSaved });
  } catch (err) {
    console.error('[PARSE]', err.message);
    const status = err instanceof multer.MulterError ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : 500;
    res.status(status).json({ error: friendlyError(err) });
  }
});

// GET /api/profile/:userId — Retrieve stored profile
router.get('/profile/:userId', async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.params.userId }).lean();
    if (!profile) return res.status(404).json({ error: 'No profile found. Upload a resume first.' });
    res.json({ success: true, profile });
  } catch (err) {
    console.error('[PROFILE]', err.message);
    res.status(500).json({ error: 'Could not retrieve your profile. Please try again.' });
  }
});

module.exports = router;
