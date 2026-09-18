import { Router, Response } from 'express';
import { supabase, isSupabaseConfigured, localStore } from '../supabase.js';
import { EventItem } from '../types.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

export const eventsRouter = Router();

eventsRouter.use(requireAuth);

function mapDbToEvent(row: any): EventItem {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    day: Number(row.day),
    startHour: Number(row.start_hour),
    startMinute: Number(row.start_minute ?? 0),
    duration: Number(row.duration),
    color: row.color,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/events
eventsRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (isSupabaseConfigured() && supabase && userId) {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('user_id', userId)
        .order('day', { ascending: true })
        .order('start_hour', { ascending: true });

      if (error) {
        console.error('Erro ao listar eventos no Supabase:', error);
      } else if (data) {
        res.json(data.map(mapDbToEvent));
        return;
      }
    }
    res.json(localStore.events);
  } catch (err) {
    console.error('Falha ao processar GET /api/events:', err);
    res.status(500).json({ error: 'Erro interno ao buscar eventos' });
  }
});

// POST /api/events
eventsRouter.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const body = req.body as Partial<EventItem>;
    if (!body.title || body.day === undefined || body.startHour === undefined) {
      res.status(400).json({ error: 'title, day e startHour são campos obrigatórios' });
      return;
    }

    const newEvent: EventItem = {
      id: body.id || `ev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId,
      title: body.title,
      day: Number(body.day),
      startHour: Number(body.startHour),
      startMinute: Number(body.startMinute ?? 0),
      duration: Number(body.duration ?? 1),
      color: body.color || 'blue',
      category: body.category || 'Geral',
    };

    localStore.events.push(newEvent);

    if (isSupabaseConfigured() && supabase && userId) {
      const { error } = await supabase.from('events').insert({
        id: newEvent.id,
        user_id: userId,
        title: newEvent.title,
        day: newEvent.day,
        start_hour: newEvent.startHour,
        start_minute: newEvent.startMinute,
        duration: newEvent.duration,
        color: newEvent.color,
        category: newEvent.category,
      });

      if (error) {
        console.error('Erro ao inserir evento no Supabase:', error);
        res.status(500).json({ error: 'Erro ao salvar evento no banco' });
        return;
      }
    }

    res.status(201).json(newEvent);
  } catch (err) {
    console.error('Falha ao processar POST /api/events:', err);
    res.status(500).json({ error: 'Erro interno ao criar evento' });
  }
});

// PUT /api/events/:id
eventsRouter.put('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const updates = req.body as Partial<EventItem>;

    const idx = localStore.events.findIndex(e => e.id === id);
    if (idx !== -1) {
      localStore.events[idx] = {
        ...localStore.events[idx],
        ...updates,
        id,
      };
    }

    if (isSupabaseConfigured() && supabase && userId) {
      const dbUpdates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.title !== undefined) dbUpdates.title = updates.title;
      if (updates.day !== undefined) dbUpdates.day = Number(updates.day);
      if (updates.startHour !== undefined) dbUpdates.start_hour = Number(updates.startHour);
      if (updates.startMinute !== undefined) dbUpdates.start_minute = Number(updates.startMinute);
      if (updates.duration !== undefined) dbUpdates.duration = Number(updates.duration);
      if (updates.color !== undefined) dbUpdates.color = updates.color;
      if (updates.category !== undefined) dbUpdates.category = updates.category;

      const { error } = await supabase
        .from('events')
        .update(dbUpdates)
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao atualizar evento no Supabase:', error);
        res.status(500).json({ error: 'Erro ao atualizar evento no banco' });
        return;
      }
    }

    const updated = localStore.events.find(e => e.id === id) || { ...updates, id };
    res.json(updated);
  } catch (err) {
    console.error('Falha ao processar PUT /api/events/:id:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar evento' });
  }
});

// DELETE /api/events/:id
eventsRouter.delete('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    localStore.events = localStore.events.filter(e => e.id !== id);

    if (isSupabaseConfigured() && supabase && userId) {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao deletar evento no Supabase:', error);
        res.status(500).json({ error: 'Erro ao remover evento no banco' });
        return;
      }
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error('Falha ao processar DELETE /api/events/:id:', err);
    res.status(500).json({ error: 'Erro interno ao deletar evento' });
  }
});
