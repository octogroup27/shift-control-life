import { Router, Request, Response } from 'express';
import { supabase, getScopedSupabase, isSupabaseConfigured, localStore, initialDefaultState } from '../supabase.js';
import { EventItem, GoalItem, HabitItem, TaskItem } from '../types.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

export const stateRouter = Router();

// GET /api/health - Endpoint público de verificação
stateRouter.get('/health', async (_req: Request, res: Response): Promise<void> => {
  const configured = isSupabaseConfigured();
  let supabaseConnected = false;
  let supabaseMessage = configured
    ? 'Configurado'
    : 'Não configurado (utilizando armazenamento local em memória)';

  if (configured && supabase) {
    try {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (!error) {
        supabaseConnected = true;
        supabaseMessage = 'Conectado e sincronizado com o Supabase';
      } else {
        supabaseMessage = `Status Supabase: ${error.message}`;
      }
    } catch (e: any) {
      supabaseMessage = `Falha na conexão com Supabase: ${e.message}`;
    }
  }

  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    database: {
      provider: configured ? 'supabase' : 'local_memory',
      configured,
      connected: supabaseConnected,
      message: supabaseMessage,
    },
  });
});

// GET /api/state - Retorna o estado completo exclusivo do usuário autenticado
stateRouter.get('/state', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const client = getScopedSupabase(req) || supabase;

    if (isSupabaseConfigured() && client && userId) {
      // 1. Busca perfil do usuário
      const { data: profileData } = await client
        .from('profiles')
        .select('user_name, email')
        .eq('id', userId)
        .single();

      // 2. Busca eventos do usuário
      const { data: eventsData } = await client
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .order('day', { ascending: true })
        .order('start_hour', { ascending: true });

      // 3. Busca tarefas do usuário
      const { data: tasksData } = await client
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // 4. Busca hábitos do usuário
      const { data: habitsData } = await client
        .from('habits')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      // 5. Busca metas do usuário com subtarefas
      const { data: goalsData } = await client
        .from('goals')
        .select(`
          id,
          user_id,
          title,
          category,
          status,
          created_at,
          updated_at,
          goal_subtasks (
            id,
            text,
            completed,
            created_at
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      const mappedEvents: EventItem[] = (eventsData || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        day: Number(row.day),
        startHour: Number(row.start_hour),
        startMinute: Number(row.start_minute ?? 0),
        duration: Number(row.duration),
        color: row.color,
        category: row.category,
      }));

      const mappedTasks: TaskItem[] = (tasksData || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        text: row.text,
        completed: Boolean(row.completed),
        category: row.category,
      }));

      const mappedHabits: HabitItem[] = (habitsData || []).map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        category: row.category,
        days: Array.isArray(row.days) ? row.days : [false, false, false, false, false, false, false],
      }));

      const mappedGoals: GoalItem[] = (goalsData || []).map((g: any) => ({
        id: g.id,
        userId: g.user_id,
        title: g.title,
        category: g.category,
        status: g.status,
        subtasks: (g.goal_subtasks || []).map((st: any) => ({
          id: st.id,
          text: st.text,
          completed: Boolean(st.completed),
        })),
      }));

      const userName = profileData?.user_name || req.userName || 'Usuário';

      res.json({
        userName,
        userEmail: profileData?.email || req.userEmail,
        events: mappedEvents,
        tasks: mappedTasks,
        habits: mappedHabits,
        goals: mappedGoals,
        source: 'supabase',
      });
      return;
    }

    res.json({
      ...localStore,
      userName: req.userName || localStore.userName,
      userEmail: req.userEmail,
      source: 'local',
    });
  } catch (err) {
    console.error('Falha ao processar GET /api/state:', err);
    res.status(500).json({ error: 'Erro ao buscar dados do usuário.' });
  }
});

// PUT /api/state - Sincronização em lote isolada para o usuário autenticado
stateRouter.put('/state', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const client = getScopedSupabase(req) || supabase;
    const { userName, events, tasks, habits, goals } = req.body;

    if (isSupabaseConfigured() && client && userId) {
      if (userName) {
        await client.from('profiles').upsert({
          id: userId,
          user_name: userName,
          updated_at: new Date().toISOString(),
        });
      }

      if (Array.isArray(events)) {
        await client.from('events').delete().eq('user_id', userId);
        if (events.length > 0) {
          const rows = events.map(e => ({
            id: e.id,
            user_id: userId,
            title: e.title,
            day: e.day,
            start_hour: e.startHour,
            start_minute: e.startMinute ?? 0,
            duration: e.duration,
            color: e.color,
            category: e.category,
          }));
          await client.from('events').insert(rows);
        }
      }

      if (Array.isArray(tasks)) {
        await client.from('tasks').delete().eq('user_id', userId);
        if (tasks.length > 0) {
          const rows = tasks.map(t => ({
            id: t.id,
            user_id: userId,
            text: t.text,
            completed: t.completed,
            category: t.category,
          }));
          await client.from('tasks').insert(rows);
        }
      }

      if (Array.isArray(habits)) {
        await client.from('habits').delete().eq('user_id', userId);
        if (habits.length > 0) {
          const rows = habits.map(h => ({
            id: h.id,
            user_id: userId,
            name: h.name,
            category: h.category,
            days: h.days,
          }));
          await client.from('habits').insert(rows);
        }
      }

      if (Array.isArray(goals)) {
        // Exclui metas anteriores deste usuário (subtarefas são excluídas em cascata)
        await client.from('goals').delete().eq('user_id', userId);
        for (const g of goals) {
          await client.from('goals').insert({
            id: g.id,
            user_id: userId,
            title: g.title,
            category: g.category,
            status: g.status,
          });
          if (g.subtasks && g.subtasks.length > 0) {
            const subtaskRows = g.subtasks.map((st: any) => ({
              id: st.id,
              goal_id: g.id,
              text: st.text,
              completed: st.completed,
            }));
            await client.from('goal_subtasks').insert(subtaskRows);
          }
        }
      }
    } else {
      if (userName) localStore.userName = userName;
      if (Array.isArray(events)) localStore.events = events;
      if (Array.isArray(tasks)) localStore.tasks = tasks;
      if (Array.isArray(habits)) localStore.habits = habits;
      if (Array.isArray(goals)) localStore.goals = goals;
    }

    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Erro ao sincronizar PUT /api/state:', err);
    res.status(500).json({ error: 'Falha ao sincronizar dados do usuário' });
  }
});

// POST /api/reset - Limpa e zera os dados da conta do usuário autenticado
stateRouter.post('/reset', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const client = getScopedSupabase(req) || supabase;

    if (isSupabaseConfigured() && client && userId) {
      await client.from('goals').delete().eq('user_id', userId);
      await client.from('habits').delete().eq('user_id', userId);
      await client.from('tasks').delete().eq('user_id', userId);
      await client.from('events').delete().eq('user_id', userId);
    } else {
      localStore.events = [];
      localStore.tasks = [];
      localStore.habits = [];
      localStore.goals = [];
    }

    res.json({
      success: true,
      message: 'Seus dados foram zerados com sucesso',
    });
  } catch (err) {
    console.error('Falha ao processar POST /api/reset:', err);
    res.status(500).json({ error: 'Erro ao zerar dados' });
  }
});
