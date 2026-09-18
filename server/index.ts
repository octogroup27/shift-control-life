import express from 'express';
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
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Log simples de requisições na API
app.use('/api', (req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Rotas da API
app.use('/api/profile', profileRouter);
app.use('/api/events', eventsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/habits', habitsRouter);
app.use('/api/goals', goalsRouter);
app.use('/api', stateRouter);

// Rota raiz da API para verificação rápida
app.get('/api', (_req, res) => {
  res.json({
    app: 'Shift - Control Life API',
    version: '1.0.0',
    status: 'running',
    supabaseConfigured: isSupabaseConfigured(),
  });
});

// Tratamento de rotas não encontradas na API
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

// Inicia servidor
app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 Shift - Control Life Backend rodando na porta ${PORT}`);
  console.log(`📍 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📊 Estado Completo: http://localhost:${PORT}/api/state`);
  console.log(`🔌 Provedor de Banco: ${isSupabaseConfigured() ? 'Supabase (Nuvem)' : 'Armazenamento Local'}`);
  console.log('====================================================');
});
