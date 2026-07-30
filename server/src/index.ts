import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pino from 'pino';
import authRoutes from './routes/auth.routes';
import cloudAccountRoutes from './routes/cloudAccount.routes';
import fileRoutes from './routes/file.routes';
import { errorHandler } from './middlewares/errorHandler';

const app = express();
const logger = pino();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/cloud-accounts', cloudAccountRoutes);
app.use('/api/files', fileRoutes);

// Global Error Handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});
