import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { AppState } from './types.js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_URL.startsWith('http') &&
    !SUPABASE_URL.includes('seu-projeto.supabase.co') &&
    key &&
    !key.includes('sua-anon-key')
  );
};

let globalSupabaseInstance: SupabaseClient | null = null;
let adminSupabaseInstance: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  try {
    const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    globalSupabaseInstance = createClient(SUPABASE_URL, key, {
      auth: { persistSession: false },
    });
    console.log('✅ Cliente Supabase padrão inicializado em:', SUPABASE_URL);

    if (SUPABASE_SERVICE_ROLE_KEY && SUPABASE_SERVICE_ROLE_KEY.length > 20) {
      adminSupabaseInstance = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      console.log('🛡️ Cliente Admin Supabase (service_role) ativado!');
    }
  } catch (err) {
    console.error('⚠️ Erro ao inicializar cliente Supabase:', err);
    globalSupabaseInstance = null;
  }
} else {
  console.log('ℹ️ Supabase não configurado ou credenciais pendentes. Operando em modo de armazenamento local.');
}

export const supabase = globalSupabaseInstance;
export const supabaseAdmin = adminSupabaseInstance;

/**
 * Retorna uma instância do Supabase com o contexto de autorização correto:
 * 1. Se existir `service_role_key`, retorna o cliente admin que tem bypass de RLS.
 * 2. Se receber uma requisição HTTP ou JWT token, retorna um cliente com o header
 *    `Authorization: Bearer <token>`, permitindo que as políticas de RLS (auth.uid() = user_id)
 *    sejam respeitadas sem bloqueio.
 * 3. Fallback para a instância padrão.
 */
export function getScopedSupabase(reqOrToken?: any): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (adminSupabaseInstance) return adminSupabaseInstance;

  let token: string | undefined;
  if (typeof reqOrToken === 'string') {
    token = reqOrToken.replace(/^Bearer\s+/i, '');
  } else if (reqOrToken && typeof reqOrToken === 'object') {
    const authHeader = reqOrToken.headers?.authorization || reqOrToken.headers?.Authorization;
    if (typeof authHeader === 'string') {
      token = authHeader.replace(/^Bearer\s+/i, '');
    }
  }

  if (token && SUPABASE_ANON_KEY) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });
  }

  return globalSupabaseInstance;
}

// Dados iniciais vazios para novas contas (o usuário inicia do zero e cria seus próprios registros)
export const initialDefaultState: AppState = {
  userName: 'Usuário',
  events: [],
  tasks: [],
  habits: [],
  goals: []
};

// Armazenamento em memória local (fallback para quando Supabase não estiver configurado)
export const localStore: AppState = JSON.parse(JSON.stringify(initialDefaultState));

