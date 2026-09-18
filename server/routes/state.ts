import { Router, Request, Response } from 'express';
import { supabase, isSupabaseConfigured, localStore, initialDefaultState } from '../supabase.js';
import { AppState, EventItem, GoalItem, HabitItem, TaskItem } from '../types.js';

export const stateRouter = Router();

// GET /api/health
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
        supabaseMessage = `Erro ao consultar Supabase: ${error.message}`;
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

// GET /api/state - Retorna o estado completo da aplicação
stateRouter.get('/state', async (_req: Request, res: Response): Promise<void> => {
  try {
    if (isSupabaseConfigured() && supabase) {
      // 1. Busca perfil
      const { data: profileData } = await supabase
        .from('profiles')
        .select('user_name')
        .eq('id', 'default-user')
        .single();

      // 2. Busca eventos
      const { data: eventsData } = await supabase
        .from('events')
        .select('*')
        .order('day', { ascending: true })
        .order('start_hour', { ascending: true });

      // 3. Busca tarefas
      const { data: tasksData } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      // 4. Busca hábitos
      const { data: habitsData } = await supabase
        .from('habits')
        .select('*')
        .order('created_at', { ascending: true });

      // 5. Busca metas e subtarefas
      const { data: goalsData } = await supabase
        .from('goals')
        .select(`
          id,
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
        .order('created_at', { ascending: true });

      const mappedEvents: EventItem[] = eventsData
        ? eventsData.map((row: any) => ({
            id: row.id,
            title: row.title,
            day: Number(row.day),
            startHour: Number(row.start_hour),
            startMinute: Number(row.start_minute ?? 0),
            duration: Number(row.duration),
            color: row.color,
            category: row.category,
          }))
        : localStore.events;

      const mappedTasks: TaskItem[] = tasksData
        ? tasksData.map((row: any) => ({
            id: row.id,
            text: row.text,
            completed: Boolean(row.completed),
            category: row.category,
          }))
        : localStore.tasks;

      const mappedHabits: HabitItem[] = habitsData
        ? habitsData.map((row: any) => ({
            id: row.id,
            name: row.name,
            category: row.category,
            days: Array.isArray(row.days) ? row.days : [false, false, false, false, false, false, false],
          }))
        : localStore.habits;

      const mappedGoals: GoalItem[] = goalsData
        ? goalsData.map((g: any) => ({
            id: g.id,
            title: g.title,
            category: g.category,
            status: g.status,
            subtasks: (g.goal_subtasks || []).map((st: any) => ({
              id: st.id,
              text: st.text,
              completed: Boolean(st.completed),
            })),
          }))
        : localStore.goals;

      // Se o banco tiver dados, sincroniza com o localStore e retorna
      const userName = profileData?.user_name || localStore.userName || 'Bookflow';

      // Atualiza cache local
      localStore.userName = userName;
      localStore.events = mappedEvents;
      localStore.tasks = mappedTasks;
      localStore.habits = mappedHabits;
      localStore.goals = mappedGoals;

      res.json({
        userName,
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
      source: 'local',
    });
  } catch (err) {
    console.error('Falha ao processar GET /api/state:', err);
    res.json({
      ...localStore,
      source: 'local_fallback',
    });
  }
});

// PUT /api/state - Sincronização em lote do estado
stateRouter.put('/state', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userName, events, tasks, habits, goals } = req.body;
    if (userName) localStore.userName = userName;
    if (Array.isArray(events)) localStore.events = events;
    if (Array.isArray(tasks)) localStore.tasks = tasks;
    if (Array.isArray(habits)) localStore.habits = habits;
    if (Array.isArray(goals)) localStore.goals = goals;

    if (isSupabaseConfigured() && supabase) {
      if (userName) {
        await supabase.from('profiles').upsert({ id: 'default-user', user_name: userName });
      }
      if (Array.isArray(events)) {
        await supabase.from('events').delete().neq('id', '___none___');
        if (events.length > 0) {
          const rows = events.map(e => ({
            id: e.id,
            title: e.title,
            day: e.day,
            start_hour: e.startHour,
            start_minute: e.startMinute ?? 0,
            duration: e.duration,
            color: e.color,
            category: e.category,
          }));
          await supabase.from('events').insert(rows);
        }
      }
      if (Array.isArray(tasks)) {
        await supabase.from('tasks').delete().neq('id', '___none___');
        if (tasks.length > 0) {
          const rows = tasks.map(t => ({
            id: t.id,
            text: t.text,
            completed: t.completed,
            category: t.category,
          }));
          await supabase.from('tasks').insert(rows);
        }
      }
      if (Array.isArray(habits)) {
        await supabase.from('habits').delete().neq('id', '___none___');
        if (habits.length > 0) {
          const rows = habits.map(h => ({
            id: h.id,
            name: h.name,
            category: h.category,
            days: h.days,
          }));
          await supabase.from('habits').insert(rows);
        }
      }
      if (Array.isArray(goals)) {
        await supabase.from('goal_subtasks').delete().neq('id', '___none___');
        await supabase.from('goals').delete().neq('id', '___none___');
        for (const g of goals) {
          await supabase.from('goals').insert({
            id: g.id,
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
            await supabase.from('goal_subtasks').insert(subtaskRows);
          }
        }
      }
    }

    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Erro ao sincronizar PUT /api/state:', err);
    res.status(500).json({ error: 'Falha ao sincronizar dados' });
  }
});


// POST /api/reset - Restaura dados de demonstração
stateRouter.post('/reset', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Restaura localStore
    localStore.userName = initialDefaultState.userName;
    localStore.events = JSON.parse(JSON.stringify(initialDefaultState.events));
    localStore.tasks = JSON.parse(JSON.stringify(initialDefaultState.tasks));
    localStore.habits = JSON.parse(JSON.stringify(initialDefaultState.habits));
    localStore.goals = JSON.parse(JSON.stringify(initialDefaultState.goals));

    if (isSupabaseConfigured() && supabase) {
      // Limpa tabelas no Supabase e reinsere seed
      await supabase.from('goal_subtasks').delete().neq('id', '___none___');
      await supabase.from('goals').delete().neq('id', '___none___');
      await supabase.from('habits').delete().neq('id', '___none___');
      await supabase.from('tasks').delete().neq('id', '___none___');
      await supabase.from('events').delete().neq('id', '___none___');
      await supabase.from('profiles').upsert({ id: 'default-user', user_name: 'Bookflow' });

      // Re-insere eventos
      const eventsToInsert = initialDefaultState.events.map(e => ({
        id: e.id,
        title: e.title,
        day: e.day,
        start_hour: e.startHour,
        start_minute: e.startMinute,
        duration: e.duration,
        color: e.color,
        category: e.category,
      }));
      await supabase.from('events').insert(eventsToInsert);

      // Re-insere tarefas
      const tasksToInsert = initialDefaultState.tasks.map(t => ({
        id: t.id,
        text: t.text,
        completed: t.completed,
        category: t.category,
      }));
      await supabase.from('tasks').insert(tasksToInsert);

      // Re-insere hábitos
      const habitsToInsert = initialDefaultState.habits.map(h => ({
        id: h.id,
        name: h.name,
        category: h.category,
        days: h.days,
      }));
      await supabase.from('habits').insert(habitsToInsert);

      // Re-insere metas e subtarefas
      for (const g of initialDefaultState.goals) {
        await supabase.from('goals').insert({
          id: g.id,
          title: g.title,
          category: g.category,
          status: g.status,
        });
        if (g.subtasks && g.subtasks.length > 0) {
          const subtasksToInsert = g.subtasks.map(st => ({
            id: st.id,
            goal_id: g.id,
            text: st.text,
            completed: st.completed,
          }));
          await supabase.from('goal_subtasks').insert(subtasksToInsert);
        }
      }
    }

    res.json({
      success: true,
      message: 'Dados restaurados para o padrão com sucesso',
      state: initialDefaultState,
    });
  } catch (err) {
    console.error('Falha ao processar POST /api/reset:', err);
    res.status(500).json({ error: 'Erro ao restaurar dados de demonstração' });
  }
});
