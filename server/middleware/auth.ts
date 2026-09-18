import { Request, Response, NextFunction } from 'express';
import { supabase, isSupabaseConfigured } from '../supabase.js';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
  userName?: string;
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;

  // Se o Supabase estiver configurado, validação estrita com Supabase Auth
  if (isSupabaseConfigured() && supabase) {
    if (!token) {
      res.status(401).json({ error: 'Acesso não autorizado. Token ausente.' });
      return;
    }

    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
        return;
      }

      req.userId = user.id;
      req.userEmail = user.email;
      req.userName = user.user_metadata?.user_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário';
      next();
    } catch (err) {
      console.error('Erro ao verificar token no Supabase:', err);
      res.status(401).json({ error: 'Falha na validação da sessão.' });
    }
    return;
  }

  // Fallback local: se Supabase não configurado, opera com identificador mock
  req.userId = 'local-user-demo';
  req.userEmail = 'demo@shift.local';
  req.userName = 'Bookflow Demo';
  next();
}
