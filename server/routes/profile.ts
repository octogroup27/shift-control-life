import { Router, Response } from 'express';
import { supabase, isSupabaseConfigured, localStore } from '../supabase.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

export const profileRouter = Router();

profileRouter.use(requireAuth);

// GET /api/profile
profileRouter.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    if (isSupabaseConfigured() && supabase && userId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_name, email')
        .eq('id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Erro ao buscar perfil no Supabase:', error);
      }
      if (data) {
        res.json({ userName: data.user_name, email: data.email });
        return;
      }
    }
    res.json({ userName: req.userName || localStore.userName, email: req.userEmail });
  } catch (err) {
    console.error('Falha ao processar GET /api/profile:', err);
    res.status(500).json({ error: 'Erro interno ao buscar perfil' });
  }
});

// PUT /api/profile
profileRouter.put('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId;
    const { userName } = req.body;
    if (!userName || typeof userName !== 'string') {
      res.status(400).json({ error: 'userName é obrigatório e deve ser uma string' });
      return;
    }

    localStore.userName = userName.trim();

    if (isSupabaseConfigured() && supabase && userId) {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          user_name: userName.trim(),
          updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Erro ao atualizar perfil no Supabase:', error);
        res.status(500).json({ error: 'Falha ao salvar no banco de dados' });
        return;
      }
    }

    res.json({ userName: userName.trim(), success: true });
  } catch (err) {
    console.error('Falha ao processar PUT /api/profile:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar perfil' });
  }
});
