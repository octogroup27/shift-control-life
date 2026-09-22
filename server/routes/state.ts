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
        duration: (row.duration === 24 || row.duration === '24' || row.duration === 'all_day') ? 'all_day' : Number(row.duration),
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
        const currentIds = events.map(e => String(e.id)).filter(Boolean);
        const { data: existingRows } = await client.from('events').select('id').eq('user_id', userId);
        const existingIds: string[] = (existingRows || []).map((r: any) => r.id);
        const idsToDelete = existingIds.filter(id => !currentIds.includes(id));
        if (idsToDelete.length > 0) {
          await client.from('events').delete().eq('user_id', userId).in('id', idsToDelete);
        }

        if (events.length > 0) {
          const rows = events.map(e => ({
            id: String(e.id),
            user_id: userId,
            title: String(e.title || 'Sem título'),
            day: Math.max(0, Math.min(6, parseInt(e.day, 10) || 0)),
            start_hour: Math.max(0, Math.min(23, parseInt(e.startHour, 10) || 7)),
            start_minute: Math.max(0, Math.min(59, parseInt(e.startMinute, 10) || 0)),
            duration: (e.duration === 'all_day' || e.duration === 24 || e.duration === '24') ? 24 : (parseFloat(e.duration) || 1.0),
            color: e.color || 'blue',
            category: e.category || 'Trabalho',
          }));
          const { error: eventErr } = await client.from('events').upsert(rows);
          if (eventErr) {
            console.error('Erro ao salvar eventos no Supabase:', eventErr);
            throw new Error('Falha ao salvar eventos da agenda: ' + eventErr.message);
          }
        }
      }

      if (Array.isArray(tasks)) {
        const currentIds = tasks.map(t => String(t.id)).filter(Boolean);
        const { data: existingTasks } = await client.from('tasks').select('id').eq('user_id', userId);
        const existingTaskIds: string[] = (existingTasks || []).map((r: any) => r.id);
        const taskIdsToDelete = existingTaskIds.filter(id => !currentIds.includes(id));
        if (taskIdsToDelete.length > 0) {
          await client.from('tasks').delete().eq('user_id', userId).in('id', taskIdsToDelete);
        }

        if (tasks.length > 0) {
          const rows = tasks.map(t => ({
            id: String(t.id),
            user_id: userId,
            text: String(t.text || ''),
            completed: Boolean(t.completed),
            category: t.category || 'Geral',
          }));
          const { error: taskErr } = await client.from('tasks').upsert(rows);
          if (taskErr) {
            console.error('Erro ao salvar tarefas no Supabase:', taskErr);
            throw new Error('Falha ao salvar tarefas: ' + taskErr.message);
          }
        }
      }

      if (Array.isArray(habits)) {
        const currentIds = habits.map(h => String(h.id)).filter(Boolean);
        const { data: existingHabits } = await client.from('habits').select('id').eq('user_id', userId);
        const existingHabitIds: string[] = (existingHabits || []).map((r: any) => r.id);
        const habitIdsToDelete = existingHabitIds.filter(id => !currentIds.includes(id));
        if (habitIdsToDelete.length > 0) {
          await client.from('habits').delete().eq('user_id', userId).in('id', habitIdsToDelete);
        }

        if (habits.length > 0) {
          const rows = habits.map(h => ({
            id: String(h.id),
            user_id: userId,
            name: String(h.name || ''),
            category: h.category || 'Geral',
            days: Array.isArray(h.days) ? h.days : [false, false, false, false, false, false, false],
          }));
          const { error: habitErr } = await client.from('habits').upsert(rows);
          if (habitErr) {
            console.error('Erro ao salvar hábitos no Supabase:', habitErr);
            throw new Error('Falha ao salvar hábitos: ' + habitErr.message);
          }
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
