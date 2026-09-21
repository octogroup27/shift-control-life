import { Router, Request, Response } from 'express';
import { SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
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
        // Criptografa a senha com bcrypt (salt 10) para armazenamento seguro no banco
        const hashedPassword = await bcrypt.hash(password, 10);

        // Obtém cliente com credencial autenticada do usuário ou admin para contornar bloqueio de RLS
        const scopedClient = getScopedSupabase(userSession?.access_token) || supabase;

        if (scopedClient) {
          const profilePayload: any = {
            id: createdUser.id,
            user_name: userName,
            email: createdUser.email,
            password_hash: hashedPassword,
          };

          const { error: profileErr } = await scopedClient.from('profiles').upsert(profilePayload);
          if (profileErr && (profileErr.message.includes('password_hash') || (profileErr as any).code === '42703')) {
            // Se a coluna ainda não existir no banco, salva sem ela para evitar erros
            delete profilePayload.password_hash;
            await scopedClient.from('profiles').upsert(profilePayload);
          }
        }
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
          message = 'E-mail ainda não confirmado. Verifique seu e-mail ou use a opção "Esqueceu sua senha?" para desbloquear o acesso.';
        } else if (error.message.includes('Invalid login credentials')) {
          message = 'E-mail ou senha incorretos. Caso tenha esquecido sua senha, utilize a opção "Esqueceu sua senha?" abaixo para redefini-la.';
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

      // Garante que o perfil do usuário tenha sua senha criptografada com bcrypt armazenada no banco
      try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { error: syncErr } = await scopedClient.from('profiles').upsert({
          id: user.id,
          user_name: userName,
          email: user.email,
          password_hash: hashedPassword,
        });

        if (syncErr && (syncErr.message.includes('password_hash') || (syncErr as any).code === '42703')) {
          await scopedClient.from('profiles').upsert({
            id: user.id,
            user_name: userName,
            email: user.email,
          });
        }
      } catch (e) {
        console.warn('Aviso ao sincronizar perfil pós-login:', e);
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

// POST /api/auth/forgot-password - Solicitar e-mail de redefinição de senha
authRouter.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'O e-mail é obrigatório.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured() && supabase) {
      // Obtém a URL de origem sem fragmentos ou query strings (ex: https://shift---control-life.vercel.app)
      // Conforme RFC 6749, redirect_to NÃO pode conter fragmento (#) senão o Supabase rejeita e cai para o SiteURL padrão (localhost)
      const rawOrigin = (req.headers.origin as string) || (req.headers.referer as string) || 'https://shift---control-life.vercel.app';
      const cleanOrigin = rawOrigin.split('#')[0].split('?')[0].replace(/\/+$/, '');
      const redirectTo = `${cleanOrigin}/`;

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });

      if (error) {
        if (error.message.includes('rate limit') || error.status === 429) {
          res.status(429).json({
            error: 'Limite de envio de e-mails do Supabase atingido. Por favor, aguarde alguns minutos antes de tentar novamente.',
          });
          return;
        }
        res.status(400).json({ error: error.message });
        return;
      }

      res.json({
        success: true,
        message: 'Se o e-mail estiver cadastrado, enviamos um link para redefinir sua senha. Verifique sua caixa de entrada e spam.',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Modo local ativo: solicitação de recuperação registrada.',
    });
  } catch (err: any) {
    console.error('Erro em forgot-password:', err);
    res.status(500).json({ error: 'Erro interno ao processar solicitação de recuperação.' });
  }
});

// POST /api/auth/verify-recovery-code - Valida código OTP de recuperação
authRouter.post('/verify-recovery-code', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      res.status(400).json({ error: 'E-mail e código/token são obrigatórios.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: 'recovery',
      });

      if (error) {
        res.status(400).json({ error: 'Código ou link inválido/expirado. Verifique os dados digitados ou solicite um novo link.' });
        return;
      }

      const token = data.session?.access_token;
      if (!token) {
        res.status(400).json({ error: 'Não foi possível validar a sessão de recuperação. Solicite um novo link.' });
        return;
      }

      res.json({
        success: true,
        token,
        message: 'Código validado com sucesso! Crie sua nova senha.',
      });
      return;
    }

    res.json({
      success: true,
      token: 'local-recovery-token',
      message: 'Código validado com sucesso.',
    });
  } catch (err: any) {
    console.error('Erro em verify-recovery-code:', err);
    res.status(500).json({ error: 'Erro interno ao verificar código.' });
  }
});

// POST /api/auth/reset-password - Redefinir senha com o token de recuperação
authRouter.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { password, token } = req.body;
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const jwtToken = token || (typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '') : null);

    if (!password) {
      res.status(400).json({ error: 'A nova senha é obrigatória.' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'A nova senha deve conter no mínimo 6 caracteres.' });
      return;
    }

    if (!jwtToken) {
      res.status(400).json({ error: 'Token de autorização ou recuperação ausente. Abra o link enviado para seu e-mail.' });
      return;
    }

    if (isSupabaseConfigured() && supabase) {
      const SUPABASE_URL = process.env.SUPABASE_URL || '';
      const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

      const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      });

      const responseData: any = await response.json();

      if (!response.ok) {
        let errorMsg = responseData?.msg || responseData?.error_description || responseData?.message || 'Falha ao redefinir senha.';
        if (errorMsg.includes('JWT') || errorMsg.includes('expired') || errorMsg.includes('invalid')) {
          errorMsg = 'O link de recuperação expirou ou é inválido. Solicite um novo link.';
        }
        res.status(400).json({ error: errorMsg });
        return;
      }

      if (supabaseAdmin && responseData?.id) {
        try {
          await supabaseAdmin.auth.admin.updateUserById(responseData.id, {
            email_confirm: true,
          });
        } catch (adminErr) {
          console.warn('Aviso ao auto-confirmar email pós-reset:', adminErr);
        }
      }

      // Atualiza o hash criptografado da nova senha no perfil
      if (responseData?.id) {
        try {
          const hashedPassword = await bcrypt.hash(password, 10);
          const scopedClient = getScopedSupabase(jwtToken) || supabase;
          if (scopedClient) {
            await scopedClient.from('profiles').update({ password_hash: hashedPassword }).eq('id', responseData.id);
          }
        } catch (passErr) {
          console.warn('Aviso ao atualizar password_hash no profile:', passErr);
        }
      }

      res.json({
        success: true,
        message: 'Senha atualizada com sucesso! Você já pode realizar o login com sua nova senha.',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Senha redefinida com sucesso no modo local.',
    });
  } catch (err: any) {
    console.error('Erro em reset-password:', err);
    res.status(500).json({ error: 'Erro interno ao redefinir senha.' });
  }
});


