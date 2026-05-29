require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const resumeRoutes = require('./routes/resumeRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serverless-safe DB connection (cached across warm invocations)
let dbConnected = false;

async function connectDB() {
  if (dbConnected || !process.env.MONGODB_URI) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    dbConnected = true;
    console.log('[DB] Connected');
  } catch (err) {
    console.warn('[DB] Connection failed:', err.message);
  }
}

// Connect before each request (Vercel spins up fresh instances)
app.use(async (_req, _res, next) => {
  await connectDB();
  next();
});

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'warm', db: dbConnected ? 'connected' : 'offline' });
});

// API routes
app.use('/api', resumeRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// Global error handler — never expose internals to users
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// Local dev server (Vercel imports the exported app directly)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 8080;
  app.listen(PORT, () => console.log(`[SERVER] Listening on :${PORT}`));
}

process.on('SIGTERM', () => mongoose.connection.close().then(() => process.exit(0)));
process.on('SIGINT', () => mongoose.connection.close().then(() => process.exit(0)));

module.exports = app;
