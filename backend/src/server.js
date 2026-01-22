import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import apiRoutes from './routes/index.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-recruitment';
const allowList = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((o) => o.trim()) : ['*'];
const corsOptions = {
  origin: allowList.includes('*')
    ? true
    : (origin, callback) => {
        if (!origin || allowList.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use(cookieParser());
app.use(morgan('dev'));

// Health check route
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'backend' });
});

app.use('/api', apiRoutes);

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
