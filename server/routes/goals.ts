import { Router, Response } from 'express';
import { supabase, isSupabaseConfigured, localStore } from '../supabase.js';
import { GoalItem, GoalSubtask } from '../types.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

export const goalsRouter = Router();

goalsRouter.use(requireAuth);

// GET /api/goals
goalsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (isSupabaseConfigured() && supabase && userId) {
      const { data, error } = await supabase
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

      if (error) {
        console.error('Erro ao buscar metas no Supabase:', error);
      } else if (data) {
        const goals: GoalItem[] = data.map((g: any) => ({
          id: g.id,
          userId: g.user_id,
          title: g.title,
          category: g.category,
          status: g.status,
          createdAt: g.created_at,
          updatedAt: g.updated_at,
          subtasks: (g.goal_subtasks || []).map((st: any) => ({
            id: st.id,
            text: st.text,
            completed: Boolean(st.completed),
            createdAt: st.created_at,
          })),
        }));
        res.json(goals);
        return;
      }
    }
    res.json(localStore.goals);
  } catch (err) {
    console.error('Falha ao processar GET /api/goals:', err);
    res.status(500).json({ error: 'Erro interno ao buscar metas' });
  }
});

// POST /api/goals
goalsRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { id, title, category, status, subtasks } = req.body;
    if (!title || typeof title !== 'string') {
      res.status(400).json({ error: 'title é obrigatório' });
      return;
    }

    const goalId = id || `g-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const parsedSubtasks: GoalSubtask[] = Array.isArray(subtasks)
      ? subtasks.map((st: any, i: number) => ({
          id: st.id || `st-${Date.now()}-${i}`,
          text: st.text || '',
          completed: Boolean(st.completed),
        }))
      : [];

    const newGoal: GoalItem = {
      id: goalId,
      userId,
      title: title.trim(),
      category: category || 'Geral',
      status: (status as any) || 'todo',
      subtasks: parsedSubtasks,
    };

    localStore.goals.push(newGoal);

    if (isSupabaseConfigured() && supabase && userId) {
      const { error: goalError } = await supabase.from('goals').insert({
        id: newGoal.id,
        user_id: userId,
        title: newGoal.title,
        category: newGoal.category,
        status: newGoal.status,
      });

      if (goalError) {
        console.error('Erro ao criar meta no Supabase:', goalError);
        res.status(500).json({ error: 'Erro ao criar meta no banco' });
        return;
      }

      if (parsedSubtasks.length > 0) {
        const subtaskRows = parsedSubtasks.map(st => ({
          id: st.id,
          goal_id: goalId,
          text: st.text,
          completed: st.completed,
        }));
        const { error: stError } = await supabase.from('goal_subtasks').insert(subtaskRows);
        if (stError) {
          console.error('Erro ao criar subtarefas no Supabase:', stError);
        }
      }
    }

    res.status(201).json(newGoal);
  } catch (err) {
    console.error('Falha ao processar POST /api/goals:', err);
    res.status(500).json({ error: 'Erro interno ao criar meta' });
  }
});

// PATCH /api/goals/:id
goalsRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { status, title, category } = req.body;

    const goal = localStore.goals.find(g => g.id === id);
    if (goal) {
      if (status !== undefined) goal.status = status;
      if (title !== undefined) goal.title = title;
      if (category !== undefined) goal.category = category;
    }

    if (isSupabaseConfigured() && supabase && userId) {
      const dbUpdates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (status !== undefined) dbUpdates.status = status;
      if (title !== undefined) dbUpdates.title = title;
      if (category !== undefined) dbUpdates.category = category;

      const { error } = await supabase
        .from('goals')
        .update(dbUpdates)
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao atualizar meta no Supabase:', error);
        res.status(500).json({ error: 'Erro ao atualizar meta no banco' });
        return;
      }
    }

    res.json(goal || { id, status, title, category });
  } catch (err) {
    console.error('Falha ao processar PATCH /api/goals/:id:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar meta' });
  }
});

// DELETE /api/goals/:id
goalsRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    localStore.goals = localStore.goals.filter(g => g.id !== id);

    if (isSupabaseConfigured() && supabase && userId) {
      const { error } = await supabase
        .from('goals')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao deletar meta no Supabase:', error);
        res.status(500).json({ error: 'Erro ao deletar meta no banco' });
        return;
      }
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error('Falha ao processar DELETE /api/goals/:id:', err);
    res.status(500).json({ error: 'Erro interno ao excluir meta' });
  }
});

// POST /api/goals/:id/subtasks
goalsRouter.post('/:id/subtasks', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id: goalId } = req.params;
    const { text, completed } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text é obrigatório' });
      return;
    }

    const newSubtask: GoalSubtask = {
      id: `st-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      text: text.trim(),
      completed: Boolean(completed),
      goalId,
    };

    const goal = localStore.goals.find(g => g.id === goalId);
    if (goal) {
      if (!goal.subtasks) goal.subtasks = [];
      goal.subtasks.push(newSubtask);
    }

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase.from('goal_subtasks').insert({
        id: newSubtask.id,
        goal_id: goalId,
        text: newSubtask.text,
        completed: newSubtask.completed,
      });

      if (error) {
        console.error('Erro ao criar subtarefa no Supabase:', error);
        res.status(500).json({ error: 'Erro ao salvar subtarefa no banco' });
        return;
      }
    }

    res.status(201).json(newSubtask);
  } catch (err) {
    console.error('Falha ao processar POST /api/goals/:id/subtasks:', err);
    res.status(500).json({ error: 'Erro interno ao adicionar subtarefa' });
  }
});

// PATCH /api/goals/:id/subtasks/:subtaskId
goalsRouter.patch('/:id/subtasks/:subtaskId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id: goalId, subtaskId } = req.params;
    const { completed, text } = req.body;

    const goal = localStore.goals.find(g => g.id === goalId);
    const subtask = goal?.subtasks?.find(st => st.id === subtaskId);
    if (subtask) {
      if (completed !== undefined) subtask.completed = Boolean(completed);
      if (text !== undefined) subtask.text = text;
    }

    if (isSupabaseConfigured() && supabase) {
      const dbUpdates: Record<string, any> = {};
      if (completed !== undefined) dbUpdates.completed = Boolean(completed);
      if (text !== undefined) dbUpdates.text = text;

      const { error } = await supabase
        .from('goal_subtasks')
        .update(dbUpdates)
        .eq('id', subtaskId)
        .eq('goal_id', goalId);

      if (error) {
        console.error('Erro ao atualizar subtarefa no Supabase:', error);
        res.status(500).json({ error: 'Erro ao atualizar subtarefa no banco' });
        return;
      }
    }

    res.json(subtask || { id: subtaskId, goalId, completed, text });
  } catch (err) {
    console.error('Falha ao processar PATCH /api/goals/:id/subtasks/:subtaskId:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar subtarefa' });
  }
});

// DELETE /api/goals/:id/subtasks/:subtaskId
goalsRouter.delete('/:id/subtasks/:subtaskId', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id: goalId, subtaskId } = req.params;

    const goal = localStore.goals.find(g => g.id === goalId);
    if (goal && goal.subtasks) {
      goal.subtasks = goal.subtasks.filter(st => st.id !== subtaskId);
    }

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase
        .from('goal_subtasks')
        .delete()
        .eq('id', subtaskId)
        .eq('goal_id', goalId);

      if (error) {
        console.error('Erro ao remover subtarefa no Supabase:', error);
        res.status(500).json({ error: 'Erro ao deletar subtarefa no banco' });
        return;
      }
    }

    res.json({ success: true, id: subtaskId, goalId });
  } catch (err) {
    console.error('Falha ao processar DELETE /api/goals/:id/subtasks/:subtaskId:', err);
    res.status(500).json({ error: 'Erro interno ao remover subtarefa' });
  }
});
