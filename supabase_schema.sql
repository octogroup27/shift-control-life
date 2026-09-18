-- =============================================================================
-- SHIFT - CONTROL LIFE: ESQUEMA DE BANCO DE DADOS SUPABASE (POSTGRESQL)
-- =============================================================================
-- Instruções:
-- 1. Acesse o painel do seu projeto no Supabase (https://supabase.com/dashboard)
-- 2. No menu lateral, clique em "SQL Editor"
-- 3. Crie uma "New Query", cole todo o conteúdo deste arquivo e clique em "Run" (Ctrl+Enter)
-- =============================================================================

-- Habilita extensão para geração de UUID se necessário
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. TABELA: PROFILES (Perfil do Usuário)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY DEFAULT 'default-user',
  user_name TEXT NOT NULL DEFAULT 'Bookflow',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 2. TABELA: EVENTS (Agenda estilo Google Calendar)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  day INTEGER NOT NULL CHECK (day >= 0 AND day <= 6), -- 0: Seg, 1: Ter, ..., 6: Dom
  start_hour INTEGER NOT NULL CHECK (start_hour >= 0 AND start_hour <= 23),
  start_minute INTEGER NOT NULL DEFAULT 0 CHECK (start_minute >= 0 AND start_minute <= 59),
  duration NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
  color TEXT NOT NULL DEFAULT 'blue',
  category TEXT NOT NULL DEFAULT 'Geral',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 3. TABELA: TASKS (Tarefas Diárias)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  category TEXT NOT NULL DEFAULT 'Geral',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 4. TABELA: HABITS (Rastreador de Hábitos Semanal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  days BOOLEAN[] NOT NULL DEFAULT ARRAY[false, false, false, false, false, false, false],
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 5. TABELA: GOALS (Metas Kanban)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- 6. TABELA: GOAL_SUBTASKS (Subtarefas / Checklist das Metas)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.goal_subtasks (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- ÍNDICES DE PERFORMANCE
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_events_day ON public.events(day);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON public.tasks(completed);
CREATE INDEX IF NOT EXISTS idx_goals_status ON public.goals(status);
CREATE INDEX IF NOT EXISTS idx_subtasks_goal_id ON public.goal_subtasks(goal_id);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Políticas para permitir leitura e escrita públicas/anônimas via API Key
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_subtasks ENABLE ROW LEVEL SECURITY;

-- Drop policies se já existirem (para permitir reexecução idempotente)
DROP POLICY IF EXISTS "Permitir acesso total ao profiles" ON public.profiles;
DROP POLICY IF EXISTS "Permitir acesso total ao events" ON public.events;
DROP POLICY IF EXISTS "Permitir acesso total ao tasks" ON public.tasks;
DROP POLICY IF EXISTS "Permitir acesso total ao habits" ON public.habits;
DROP POLICY IF EXISTS "Permitir acesso total ao goals" ON public.goals;
DROP POLICY IF EXISTS "Permitir acesso total ao goal_subtasks" ON public.goal_subtasks;

CREATE POLICY "Permitir acesso total ao profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total ao events" ON public.events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total ao tasks" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total ao habits" ON public.habits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total ao goals" ON public.goals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir acesso total ao goal_subtasks" ON public.goal_subtasks FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- DADOS INICIAIS (SEED)
-- Insere os dados padrão de demonstração se as tabelas estiverem vazias
-- =============================================================================

-- Perfil
INSERT INTO public.profiles (id, user_name)
VALUES ('default-user', 'Bookflow')
ON CONFLICT (id) DO NOTHING;

-- Eventos da Agenda
INSERT INTO public.events (id, title, day, start_hour, start_minute, duration, color, category) VALUES
  ('ev-1', 'Reunião de Alinhamento Semanal', 0, 9, 0, 1.5, 'blue', 'Trabalho'),
  ('ev-2', 'Treino Funcional & Cardio', 1, 7, 30, 1.0, 'green', 'Saúde'),
  ('ev-3', 'Bloco de Foco: Estudo & Leitura', 2, 14, 0, 2.0, 'purple', 'Reunião'),
  ('ev-4', 'Planejamento Pessoal & Finanças', 3, 18, 0, 1.0, 'pink', 'Pessoal'),
  ('ev-5', 'Revisão de Metas & Portfólio', 4, 16, 0, 1.5, 'orange', 'Foco'),
  ('ev-6', 'Almoço em Família', 5, 12, 0, 2.0, 'red', 'Urgente')
ON CONFLICT (id) DO NOTHING;

-- Tarefas Diárias
INSERT INTO public.tasks (id, text, completed, category) VALUES
  ('t-1', 'Revisar cronograma da semana na Agenda', true, 'Trabalho'),
  ('t-2', 'Ler 20 páginas de design e desenvolvimento', false, 'Estudos'),
  ('t-3', 'Caminhada de 30 minutos ao ar livre', false, 'Saúde')
ON CONFLICT (id) DO NOTHING;

-- Hábitos Semanais
INSERT INTO public.habits (id, name, category, days) VALUES
  ('h-1', 'Beber 2L de água', 'Saúde', ARRAY[true, true, true, false, false, false, false]),
  ('h-2', 'Leitura diária (15 min)', 'Estudos', ARRAY[true, true, false, false, false, false, false]),
  ('h-3', 'Exercício ou alongamento', 'Saúde', ARRAY[false, true, true, false, false, false, false]),
  ('h-4', 'Meditação matinal', 'Rotina', ARRAY[true, false, false, false, false, false, false])
ON CONFLICT (id) DO NOTHING;

-- Metas Kanban
INSERT INTO public.goals (id, title, category, status) VALUES
  ('g-1', 'Lançar Novo Portfólio Pessoal', 'Profissional', 'in_progress'),
  ('g-2', 'Rotina de Saúde & Corrida 5km', 'Saúde', 'todo'),
  ('g-3', 'Especialização em UI/UX & Produtividade', 'Estudos', 'done')
ON CONFLICT (id) DO NOTHING;

-- Subtarefas das Metas
INSERT INTO public.goal_subtasks (id, goal_id, text, completed) VALUES
  ('st-1', 'g-1', 'Estruturar seções e wireframe', true),
  ('st-2', 'g-1', 'Configurar domínio e deploy rápido', true),
  ('st-3', 'g-1', 'Revisar responsividade mobile', false),
  ('st-4', 'g-2', 'Comprar tênis de corrida adequado', false),
  ('st-5', 'g-2', 'Treinar 3x na semana (intervalado)', false),
  ('st-6', 'g-2', 'Completar prova de 5km', false),
  ('st-7', 'g-3', 'Módulos de micro-interações', true),
  ('st-8', 'g-3', 'Projeto prático final', true)
ON CONFLICT (id) DO NOTHING;
