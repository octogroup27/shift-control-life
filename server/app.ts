import express, { Router } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { profileRouter } from './routes/profile.js';
import { eventsRouter } from './routes/events.js';
import { tasksRouter } from './routes/tasks.js';
import { habitsRouter } from './routes/habits.js';
import { goalsRouter } from './routes/goals.js';
import { stateRouter } from './routes/state.js';
import { isSupabaseConfigured } from './supabase.js';

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Log simples de requisições
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

const apiRouter = Router();

// Rotas da API
apiRouter.use('/profile', profileRouter);
apiRouter.use('/events', eventsRouter);
apiRouter.use('/tasks', tasksRouter);
apiRouter.use('/habits', habitsRouter);
apiRouter.use('/goals', goalsRouter);
apiRouter.use('/', stateRouter);

apiRouter.get('/', (_req, res) => {
  res.json({
    app: 'Shift - Control Life API',
    version: '1.0.0',
    status: 'running',
    supabaseConfigured: isSupabaseConfigured(),
  });
});

// Mapeia tanto em /api quanto na raiz (compatível com dev local e serverless na Vercel)
app.use('/api', apiRouter);
app.use('/', apiRouter);

export default app;
