import { Router, Request, Response } from 'express';
import { supabase, isSupabaseConfigured, initialDefaultState } from '../supabase.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

export const authRouter = Router();

// Função auxiliar para inicializar dados padrão para um novo usuário
async function seedUserInitialData(userId: string) {
  if (!supabase) return;
  try {
    // Insere eventos padrão
    const events = initialDefaultState.events.map(e => ({
      id: `ev-${userId.substring(0, 5)}-${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      title: e.title,
      day: e.day,
      start_hour: e.startHour,
      start_minute: e.startMinute,
      duration: e.duration,
      color: e.color,
      category: e.category,
    }));
    await supabase.from('events').insert(events);

    // Insere tarefas padrão
    const tasks = initialDefaultState.tasks.map(t => ({
      id: `t-${userId.substring(0, 5)}-${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      text: t.text,
      completed: t.completed,
      category: t.category,
    }));
    await supabase.from('tasks').insert(tasks);

    // Insere hábitos padrão
    const habits = initialDefaultState.habits.map(h => ({
      id: `h-${userId.substring(0, 5)}-${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      name: h.name,
      category: h.category,
      days: h.days,
    }));
    await supabase.from('habits').insert(habits);

    // Insere metas e subtarefas padrão
    for (const g of initialDefaultState.goals) {
      const goalId = `g-${userId.substring(0, 5)}-${Math.random().toString(36).substring(2, 7)}`;
      await supabase.from('goals').insert({
        id: goalId,
        user_id: userId,
        title: g.title,
        category: g.category,
        status: g.status,
      });

      if (g.subtasks && g.subtasks.length > 0) {
        const subtasks = g.subtasks.map(st => ({
          id: `st-${Math.random().toString(36).substring(2, 8)}`,
          goal_id: goalId,
          text: st.text,
          completed: st.completed,
        }));
        await supabase.from('goal_subtasks').insert(subtasks);
      }
    }
    console.log(`✨ Dados de demonstração inicializados com sucesso para o usuário: ${userId}`);
  } catch (err) {
    console.warn('Aviso: Não foi possível pré-carregar dados de demonstração para o novo usuário:', err);
  }
}

// POST /api/auth/signup - Cadastro de novo usuário
authRouter.post('/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'A senha deve conter no mínimo 6 caracteres.' });
      return;
    }

    const userName = name && typeof name === 'string' ? name.trim() : email.split('@')[0];

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            user_name: userName,
            full_name: userName,
          },
        },
      });

      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }

      const user = data.user;
      const session = data.session;

      if (user) {
        // Inicializa perfil
        await supabase.from('profiles').upsert({
          id: user.id,
          user_name: userName,
          email: user.email,
        });

        // Inicializa dados padrão para este usuário novo
        await seedUserInitialData(user.id);
      }

      res.status(201).json({
        user: {
          id: user?.id,
          email: user?.email,
          name: userName,
        },
        token: session?.access_token || null,
        session,
        requiresEmailConfirmation: !session,
      });
      return;
    }

    // Fallback local caso Supabase não esteja ativo
    res.status(201).json({
      user: {
        id: 'local-user-' + Date.now(),
        email: email.trim().toLowerCase(),
        name: userName,
      },
      token: 'local-token-demo',
    });
  } catch (err: any) {
    console.error('Erro no signup:', err);
    res.status(500).json({ error: 'Erro interno ao realizar cadastro.' });
  }
});

// POST /api/auth/login - Login de usuário
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
      return;
    }

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        res.status(401).json({ error: 'E-mail ou senha incorretos.' });
        return;
      }

      const user = data.user;
      const session = data.session;

      // Obtém o nome no perfil se existir
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_name')
        .eq('id', user.id)
        .single();

      const userName = profile?.user_name || user.user_metadata?.user_name || user.email?.split('@')[0] || 'Usuário';

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: userName,
        },
        token: session.access_token,
        session,
      });
      return;
    }

    // Fallback local
    res.json({
      user: {
        id: 'local-user-demo',
        email: email.trim().toLowerCase(),
        name: 'Bookflow Demo',
      },
      token: 'local-token-demo',
    });
  } catch (err: any) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
});

// GET /api/auth/me - Obter dados do usuário autenticado
authRouter.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    let userName = req.userName;
    const email = req.userEmail;

    if (isSupabaseConfigured() && supabase && userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_name, email')
        .eq('id', userId)
        .single();

      if (profile?.user_name) {
        userName = profile.user_name;
      }
    }

    res.json({
      user: {
        id: userId,
        email,
        name: userName,
      },
    });
  } catch (err) {
    console.error('Erro em GET /api/auth/me:', err);
    res.status(500).json({ error: 'Erro ao obter dados do usuário.' });
  }
});

// POST /api/auth/logout - Logout do usuário
authRouter.post('/logout', async (_req: Request, res: Response): Promise<void> => {
  try {
    if (isSupabaseConfigured() && supabase) {
      await supabase.auth.signOut();
    }
    res.json({ success: true, message: 'Logout realizado com sucesso.' });
  } catch (err) {
    console.error('Erro no logout:', err);
    res.json({ success: true });
  }
});
