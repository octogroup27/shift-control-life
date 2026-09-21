-- =============================================================================
-- SHIFT - CONTROL LIFE: ESQUEMA MULTIUSUÁRIO COM SUPABASE AUTH & RLS
-- =============================================================================
-- Instruções:
-- 1. Acesse o painel do seu projeto no Supabase (https://supabase.com/dashboard)
-- 2. No menu lateral esquerdo, clique em "SQL Editor" -> "New Query"
-- 3. Cole todo o conteúdo deste script e clique em "Run" (Ctrl+Enter)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. TABELA: PROFILES (Recria para garantir compatibilidade com UUID do Auth)
-- =============================================================================
DROP TABLE IF EXISTS public.profiles CASCADE;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL DEFAULT 'Usuário',
  email TEXT,
  password_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Garante adição da coluna caso a tabela já exista
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'password_hash') IS FALSE THEN
    ALTER TABLE public.profiles ADD COLUMN password_hash TEXT;
  END IF;
END $$;

-- =============================================================================
-- 2. TABELA: EVENTS (Agenda com vínculo ao usuário)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.events (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  day INTEGER NOT NULL CHECK (day >= 0 AND day <= 6),
  start_hour INTEGER NOT NULL CHECK (start_hour >= 0 AND start_hour <= 23),
  start_minute INTEGER NOT NULL DEFAULT 0 CHECK (start_minute >= 0 AND start_minute <= 59),
  duration NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
  color TEXT NOT NULL DEFAULT 'blue',
  category TEXT NOT NULL DEFAULT 'Geral',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'user_id') IS FALSE THEN
    ALTER TABLE public.events ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- 3. TABELA: TASKS (Tarefas Diárias com vínculo ao usuário)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  category TEXT NOT NULL DEFAULT 'Geral',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'user_id') IS FALSE THEN
    ALTER TABLE public.tasks ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- 4. TABELA: HABITS (Rastreador de Hábitos com vínculo ao usuário)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.habits (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  days BOOLEAN[] NOT NULL DEFAULT ARRAY[false, false, false, false, false, false, false],
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'habits' AND column_name = 'user_id') IS FALSE THEN
    ALTER TABLE public.habits ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- 5. TABELA: GOALS (Metas Kanban com vínculo ao usuário)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.goals (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'user_id') IS FALSE THEN
    ALTER TABLE public.goals ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- =============================================================================
-- 6. TABELA: GOAL_SUBTASKS (Subtarefas das Metas)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.goal_subtasks (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- =============================================================================
-- ÍNDICES DE PERFORMANCE POR USUÁRIO
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_events_user ON public.events(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_habits_user ON public.habits(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals(user_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_goal ON public.goal_subtasks(goal_id);

-- =============================================================================
-- TRIGGER AUTOMÁTICO: CRIAÇÃO DE PERFIL APÓS CADASTRO
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, user_name, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'user_name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) - ISOLAMENTO ESTRITO POR USUÁRIO COM TYPE CAST SEGURO
-- =============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_subtasks ENABLE ROW LEVEL SECURITY;

-- Remove políticas anteriores
DROP POLICY IF EXISTS "Permitir acesso total ao profiles" ON public.profiles;
DROP POLICY IF EXISTS "Permitir acesso total ao events" ON public.events;
DROP POLICY IF EXISTS "Permitir acesso total ao tasks" ON public.tasks;
DROP POLICY IF EXISTS "Permitir acesso total ao habits" ON public.habits;
DROP POLICY IF EXISTS "Permitir acesso total ao goals" ON public.goals;
DROP POLICY IF EXISTS "Permitir acesso total ao goal_subtasks" ON public.goal_subtasks;

DROP POLICY IF EXISTS "Users can only access own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can only access own events" ON public.events;
DROP POLICY IF EXISTS "Users can only access own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can only access own habits" ON public.habits;
DROP POLICY IF EXISTS "Users can only access own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can only access own goal_subtasks" ON public.goal_subtasks;

-- Políticas com cast explícito (::text) garantindo compatibilidade sem erro de tipos
CREATE POLICY "Users can only access own profile" ON public.profiles
  FOR ALL TO authenticated
  USING (auth.uid()::text = id::text)
  WITH CHECK (auth.uid()::text = id::text);

CREATE POLICY "Users can only access own events" ON public.events
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can only access own tasks" ON public.tasks
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can only access own habits" ON public.habits
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can only access own goals" ON public.goals
  FOR ALL TO authenticated
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can only access own goal_subtasks" ON public.goal_subtasks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = goal_subtasks.goal_id AND g.user_id::text = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.goals g
      WHERE g.id = goal_subtasks.goal_id AND g.user_id::text = auth.uid()::text
    )
  );
