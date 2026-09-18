import { Router, Request, Response } from 'express';
import { supabase, isSupabaseConfigured, localStore } from '../supabase.js';

export const profileRouter = Router();

// GET /api/profile
profileRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_name')
        .eq('id', 'default-user')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Erro ao buscar perfil no Supabase:', error);
      }
      if (data) {
        res.json({ userName: data.user_name });
        return;
      }
    }
    res.json({ userName: localStore.userName });
  } catch (err) {
    console.error('Falha ao processar GET /api/profile:', err);
    res.status(500).json({ error: 'Erro interno ao buscar perfil' });
  }
});

// PUT /api/profile
profileRouter.put('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userName } = req.body;
    if (!userName || typeof userName !== 'string') {
      res.status(400).json({ error: 'userName é obrigatório e deve ser uma string' });
      return;
    }

    localStore.userName = userName.trim();

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: 'default-user',
          user_name: userName.trim(),
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Erro ao atualizar perfil no Supabase:', error);
        res.status(500).json({ error: 'Falha ao salvar no banco de dados' });
        return;
      }
    }

    res.json({ userName: localStore.userName, success: true });
  } catch (err) {
    console.error('Falha ao processar PUT /api/profile:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar perfil' });
  }
});
