import { Router, Response } from 'express';
import { supabase, isSupabaseConfigured, localStore } from '../supabase.js';
import { TaskItem } from '../types.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

function mapDbToTask(row: any): TaskItem {
  return {
    id: row.id,
    userId: row.user_id,
    text: row.text,
    completed: Boolean(row.completed),
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/tasks
tasksRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (isSupabaseConfigured() && supabase && userId) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao buscar tarefas no Supabase:', error);
      } else if (data) {
        res.json(data.map(mapDbToTask));
        return;
      }
    }
    res.json(localStore.tasks);
  } catch (err) {
    console.error('Falha ao processar GET /api/tasks:', err);
    res.status(500).json({ error: 'Erro interno ao buscar tarefas' });
  }
});

// POST /api/tasks
tasksRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { id, text, completed, category } = req.body;
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text é obrigatório' });
      return;
    }

    const newTask: TaskItem = {
      id: id || `t-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId,
      text: text.trim(),
      completed: Boolean(completed),
      category: category || 'Geral',
    };

    localStore.tasks.unshift(newTask);

    if (isSupabaseConfigured() && supabase && userId) {
      const { error } = await supabase.from('tasks').insert({
        id: newTask.id,
        user_id: userId,
        text: newTask.text,
        completed: newTask.completed,
        category: newTask.category,
      });

      if (error) {
        console.error('Erro ao criar tarefa no Supabase:', error);
        res.status(500).json({ error: 'Erro ao salvar tarefa no banco' });
        return;
      }
    }

    res.status(201).json(newTask);
  } catch (err) {
    console.error('Falha ao processar POST /api/tasks:', err);
    res.status(500).json({ error: 'Erro interno ao criar tarefa' });
  }
});

// PATCH /api/tasks/:id
tasksRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { completed, text, category } = req.body;

    const task = localStore.tasks.find(t => t.id === id);
    if (task) {
      if (completed !== undefined) task.completed = Boolean(completed);
      if (text !== undefined) task.text = text;
      if (category !== undefined) task.category = category;
    }

    if (isSupabaseConfigured() && supabase && userId) {
      const dbUpdates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (completed !== undefined) dbUpdates.completed = Boolean(completed);
      if (text !== undefined) dbUpdates.text = text;
      if (category !== undefined) dbUpdates.category = category;

      const { error } = await supabase
        .from('tasks')
        .update(dbUpdates)
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao atualizar tarefa no Supabase:', error);
        res.status(500).json({ error: 'Erro ao atualizar tarefa no banco' });
        return;
      }
    }

    res.json(task || { id, completed, text, category });
  } catch (err) {
    console.error('Falha ao processar PATCH /api/tasks/:id:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar tarefa' });
  }
});

// DELETE /api/tasks/:id
tasksRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    localStore.tasks = localStore.tasks.filter(t => t.id !== id);

    if (isSupabaseConfigured() && supabase && userId) {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao deletar tarefa no Supabase:', error);
        res.status(500).json({ error: 'Erro ao deletar tarefa no banco' });
        return;
      }
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error('Falha ao processar DELETE /api/tasks/:id:', err);
    res.status(500).json({ error: 'Erro interno ao excluir tarefa' });
  }
});
