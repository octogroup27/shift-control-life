import { Router, Response } from 'express';
import { supabase, isSupabaseConfigured, localStore } from '../supabase.js';
import { HabitItem } from '../types.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

export const habitsRouter = Router();

habitsRouter.use(requireAuth);

function mapDbToHabit(row: any): HabitItem {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    category: row.category,
    days: Array.isArray(row.days) ? row.days : [false, false, false, false, false, false, false],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/habits
habitsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (isSupabaseConfigured() && supabase && userId) {
      const { data, error } = await supabase
        .from('habits')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Erro ao buscar hábitos no Supabase:', error);
      } else if (data) {
        res.json(data.map(mapDbToHabit));
        return;
      }
    }
    res.json(localStore.habits);
  } catch (err) {
    console.error('Falha ao processar GET /api/habits:', err);
    res.status(500).json({ error: 'Erro interno ao buscar hábitos' });
  }
});

// POST /api/habits
habitsRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { id, name, category, days } = req.body;
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name é obrigatório' });
      return;
    }

    const newHabit: HabitItem = {
      id: id || `h-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId,
      name: name.trim(),
      category: category || 'Geral',
      days: Array.isArray(days) && days.length === 7 ? days : [false, false, false, false, false, false, false],
    };

    localStore.habits.push(newHabit);

    if (isSupabaseConfigured() && supabase && userId) {
      const { error } = await supabase.from('habits').insert({
        id: newHabit.id,
        user_id: userId,
        name: newHabit.name,
        category: newHabit.category,
        days: newHabit.days,
      });

      if (error) {
        console.error('Erro ao criar hábito no Supabase:', error);
        res.status(500).json({ error: 'Erro ao salvar hábito no banco' });
        return;
      }
    }

    res.status(201).json(newHabit);
  } catch (err) {
    console.error('Falha ao processar POST /api/habits:', err);
    res.status(500).json({ error: 'Erro interno ao criar hábito' });
  }
});

// PATCH /api/habits/:id
habitsRouter.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { days, name, category } = req.body;

    const habit = localStore.habits.find(h => h.id === id);
    if (habit) {
      if (Array.isArray(days)) habit.days = days;
      if (name !== undefined) habit.name = name;
      if (category !== undefined) habit.category = category;
    }

    if (isSupabaseConfigured() && supabase && userId) {
      const dbUpdates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      if (Array.isArray(days)) dbUpdates.days = days;
      if (name !== undefined) dbUpdates.name = name;
      if (category !== undefined) dbUpdates.category = category;

      const { error } = await supabase
        .from('habits')
        .update(dbUpdates)
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao atualizar hábito no Supabase:', error);
        res.status(500).json({ error: 'Erro ao atualizar hábito no banco' });
        return;
      }
    }

    res.json(habit || { id, days, name, category });
  } catch (err) {
    console.error('Falha ao processar PATCH /api/habits/:id:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar hábito' });
  }
});

// DELETE /api/habits/:id
habitsRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    localStore.habits = localStore.habits.filter(h => h.id !== id);

    if (isSupabaseConfigured() && supabase && userId) {
      const { error } = await supabase
        .from('habits')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao remover hábito no Supabase:', error);
        res.status(500).json({ error: 'Erro ao deletar hábito no banco' });
        return;
      }
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error('Falha ao processar DELETE /api/habits/:id:', err);
    res.status(500).json({ error: 'Erro interno ao excluir hábito' });
  }
});
