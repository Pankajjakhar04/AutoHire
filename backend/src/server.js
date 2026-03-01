import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment files based on NODE_ENV
const isProductionEnv = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
const envFile = isProductionEnv ? '.env.production' : '.env';

// Force load production file if it exists
const productionEnvPath = path.resolve(__dirname, '../.env.production');
if (fs.existsSync(productionEnvPath)) {
  dotenv.config({ path: productionEnvPath });
  console.log('[Server] Loading environment from: .env.production (forced)');
} else {
  dotenv.config({ path: path.resolve(__dirname, `../${envFile}`) });
  console.log(`[Server] Loading environment from: ${envFile}`);
}

console.log(`[Server] Production mode: ${isProductionEnv}`);

// Debug: Check if .env is loaded
console.log("[Server] Environment check:");
console.log("[Server] ML_BASE_URL:", process.env.ML_BASE_URL || "undefined");
console.log("[Server] ML_API_KEY:", process.env.ML_API_KEY ? "***" : "undefined");
console.log("[Server] GMAIL_USER:", process.env.GMAIL_USER || "undefined");
console.log("[Server] GMAIL_APP_PASSWORD:", process.env.GMAIL_APP_PASSWORD ? "***" : "undefined");

// Ensure required directories exist
const uploadsDir = path.resolve(__dirname, '../uploads');
const testDataDir = path.resolve(__dirname, '../test/data');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(testDataDir)) fs.mkdirSync(testDataDir, { recursive: true });

// Create minimal test PDF for pdf-parse library if not exists
const testPdfPath = path.resolve(testDataDir, '05-versions-space.pdf');
if (!fs.existsSync(testPdfPath)) {
  const minimalPdf = Buffer.from('JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjE5MQolJUVPRgo=', 'base64');
  fs.writeFileSync(testPdfPath, minimalPdf);
  console.log('[Server] Created test PDF for pdf-parse');
}

const app = express();
const port = process.env.PORT || 5000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-recruitment';
const isProduction = process.env.NODE_ENV === 'production';

// CORS configuration
const allowList = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((o) => o.trim()) : ['*'];
const corsOptions = {
  origin: allowList.includes('*')
    ? true
    : (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin || allowList.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Trust proxy for Render/Vercel deployments
app.set('trust proxy', 1);

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use(cookieParser());
app.use(morgan(isProduction ? 'combined' : 'dev'));
app.use('/api', apiRoutes);

// Health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'backend' });
});

async function start() {
  try {
    await mongoose.connect(mongoUri, { dbName: 'ai-recruitment' });
    console.log('Connected to MongoDB');
    app.listen(port, () => console.log(`Backend running on port ${port}`));
  } catch (err) {
    console.error('Startup error', err);
    process.exit(1);
  }
}

start();
