import { Router, Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseAdmin, getScopedSupabase, isSupabaseConfigured, initialDefaultState } from '../supabase.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

export const authRouter = Router();

// Função auxiliar para inicializar dados padrão para um novo usuário
async function seedUserInitialData(userId: string, client: SupabaseClient) {
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
    await client.from('events').insert(events);

    // Insere tarefas padrão
    const tasks = initialDefaultState.tasks.map(t => ({
      id: `t-${userId.substring(0, 5)}-${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      text: t.text,
      completed: t.completed,
      category: t.category,
    }));
    await client.from('tasks').insert(tasks);

    // Insere hábitos padrão
    const habits = initialDefaultState.habits.map(h => ({
      id: `h-${userId.substring(0, 5)}-${Math.random().toString(36).substring(2, 7)}`,
      user_id: userId,
      name: h.name,
      category: h.category,
      days: h.days,
    }));
    await client.from('habits').insert(habits);

    // Insere metas e subtarefas padrão
    for (const g of initialDefaultState.goals) {
      const goalId = `g-${userId.substring(0, 5)}-${Math.random().toString(36).substring(2, 7)}`;
      await client.from('goals').insert({
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
        await client.from('goal_subtasks').insert(subtasks);
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

    const cleanEmail = email.trim().toLowerCase();
    const userName = name && typeof name === 'string' && name.trim() ? name.trim() : cleanEmail.split('@')[0];

    if (isSupabaseConfigured() && supabase) {
      let createdUser: any = null;
      let userSession: any = null;

      // Se houver service_role key configurada, criamos via admin (auto-confirmação, sem rate limit de e-mail)
      if (supabaseAdmin) {
        const { data: adminData, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: true,
          user_metadata: {
            user_name: userName,
            full_name: userName,
          },
        });

        if (adminErr) {
          if (adminErr.message.includes('already registered') || adminErr.message.includes('unique constraint')) {
            res.status(400).json({ error: 'Este e-mail já está cadastrado. Faça login ou utilize outro e-mail.' });
            return;
          }
          res.status(400).json({ error: adminErr.message });
          return;
        }

        createdUser = adminData.user;

        // Login imediato para obter a sessão JWT
        const { data: loginData } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        userSession = loginData?.session || null;
      } else {
        // Fluxo padrão com a anon key
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              user_name: userName,
              full_name: userName,
            },
          },
        });

        if (error) {
          if (error.message.includes('rate limit') || error.status === 429) {
            res.status(429).json({
              error: 'Limite de envio de e-mails do Supabase atingido. Para resolver, desative a opção "Confirm email" no painel do Supabase (Authentication > Providers > Email) ou configure a chave SUPABASE_SERVICE_ROLE_KEY.',
            });
            return;
          }
          res.status(400).json({ error: error.message });
          return;
        }

        // Se o usuário já existia previamente, o Supabase retorna identities vazio
        if (data.user && (!data.user.identities || data.user.identities.length === 0)) {
          res.status(400).json({ error: 'Este e-mail já está cadastrado. Por favor, faça login.' });
          return;
        }

        createdUser = data.user;
        userSession = data.session;
      }

      if (createdUser) {
        // Obtém cliente com credencial autenticada do usuário ou admin para contornar bloqueio de RLS
        const scopedClient = getScopedSupabase(userSession?.access_token) || supabase;

        // Salva perfil no Supabase
        await scopedClient.from('profiles').upsert({
          id: createdUser.id,
          user_name: userName,
          email: createdUser.email,
        });

        // Inicializa dados padrão para este usuário novo
        await seedUserInitialData(createdUser.id, scopedClient);
      }

      res.status(201).json({
        user: {
          id: createdUser?.id,
          email: createdUser?.email,
          name: userName,
        },
        token: userSession?.access_token || null,
        session: userSession,
        requiresEmailConfirmation: !userSession,
      });
      return;
    }

    // Fallback local caso Supabase não esteja ativo
    res.status(201).json({
      user: {
        id: 'local-user-' + Date.now(),
        email: cleanEmail,
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

    const cleanEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        let message = 'E-mail ou senha incorretos.';
        if (error.message.includes('Email not confirmed')) {
          message = 'E-mail ainda não confirmado no Supabase. Desative a opção "Confirm email" no painel do Supabase (Authentication > Providers > Email) para permitir login imediato.';
        } else if (error.message.includes('Invalid login credentials')) {
          message = 'E-mail ou senha incorretos. Verifique seus dados ou crie uma conta.';
        } else {
          message = error.message;
        }
        res.status(401).json({ error: message });
        return;
      }

      const user = data.user;
      const session = data.session;

      // Usa o cliente autenticado com a sessão do usuário recém-logado
      const scopedClient = getScopedSupabase(session.access_token) || supabase;

      // Obtém o nome no perfil se existir
      const { data: profile } = await scopedClient
        .from('profiles')
        .select('user_name')
        .eq('id', user.id)
        .single();

      let userName = profile?.user_name || user.user_metadata?.user_name || user.user_metadata?.full_name || cleanEmail.split('@')[0];

      // Auto-reparo se o perfil ainda não existir na tabela profiles do Supabase
      if (!profile) {
        try {
          await scopedClient.from('profiles').upsert({
            id: user.id,
            user_name: userName,
            email: user.email,
          });

          // Se a conta for nova e ainda não tiver eventos, pré-carrega os dados iniciais
          const { count } = await scopedClient
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id);

          if (!count || count === 0) {
            await seedUserInitialData(user.id, scopedClient);
          }
        } catch (e) {
          console.warn('Aviso ao sincronizar perfil pós-login:', e);
        }
      }

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
        email: cleanEmail,
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

    if (isSupabaseConfigured() && userId) {
      const scopedClient = getScopedSupabase(req) || supabase;
      if (scopedClient) {
        const { data: profile } = await scopedClient
          .from('profiles')
          .select('user_name, email')
          .eq('id', userId)
          .single();

        if (profile?.user_name) {
          userName = profile.user_name;
        }
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
authRouter.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    if (isSupabaseConfigured()) {
      const client = getScopedSupabase(req) || supabase;
      if (client) {
        await client.auth.signOut();
      }
    }
    res.json({ success: true, message: 'Logout realizado com sucesso.' });
  } catch (err) {
    console.error('Erro no logout:', err);
    res.json({ success: true });
  }
});

