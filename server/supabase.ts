import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { AppState } from './types.js';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_URL.startsWith('http') &&
    !SUPABASE_URL.includes('seu-projeto.supabase.co') &&
    SUPABASE_KEY &&
    !SUPABASE_KEY.includes('sua-anon-key')
  );
};

let supabaseInstance: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  try {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
    console.log('✅ Cliente Supabase inicializado com sucesso em:', SUPABASE_URL);
  } catch (err) {
    console.error('⚠️ Erro ao inicializar cliente Supabase:', err);
    supabaseInstance = null;
  }
} else {
  console.log('ℹ️ Supabase não configurado ou credenciais pendentes. Operando em modo de armazenamento local.');
}

export const supabase = supabaseInstance;

// Dados iniciais padrão (Seed em memória para fallback caso o banco remoto ainda não esteja conectado)
export const initialDefaultState: AppState = {
  userName: 'Bookflow',
  events: [
    { id: 'ev-1', title: 'Reunião de Alinhamento Semanal', day: 0, startHour: 9, startMinute: 0, duration: 1.5, color: 'blue', category: 'Trabalho' },
    { id: 'ev-2', title: 'Treino Funcional & Cardio', day: 1, startHour: 7, startMinute: 30, duration: 1, color: 'green', category: 'Saúde' },
    { id: 'ev-3', title: 'Bloco de Foco: Estudo & Leitura', day: 2, startHour: 14, startMinute: 0, duration: 2, color: 'purple', category: 'Reunião' },
    { id: 'ev-4', title: 'Planejamento Pessoal & Finanças', day: 3, startHour: 18, startMinute: 0, duration: 1, color: 'pink', category: 'Pessoal' },
    { id: 'ev-5', title: 'Revisão de Metas & Portfólio', day: 4, startHour: 16, startMinute: 0, duration: 1.5, color: 'orange', category: 'Foco' },
    { id: 'ev-6', title: 'Almoço em Família', day: 5, startHour: 12, startMinute: 0, duration: 2, color: 'red', category: 'Urgente' }
  ],
  tasks: [
    { id: 't-1', text: 'Revisar cronograma da semana na Agenda', completed: true, category: 'Trabalho' },
    { id: 't-2', text: 'Ler 20 páginas de design e desenvolvimento', completed: false, category: 'Estudos' },
    { id: 't-3', text: 'Caminhada de 30 minutos ao ar livre', completed: false, category: 'Saúde' }
  ],
  habits: [
    { id: 'h-1', name: 'Beber 2L de água', category: 'Saúde', days: [true, true, true, false, false, false, false] },
    { id: 'h-2', name: 'Leitura diária (15 min)', category: 'Estudos', days: [true, true, false, false, false, false, false] },
    { id: 'h-3', name: 'Exercício ou alongamento', category: 'Saúde', days: [false, true, true, false, false, false, false] },
    { id: 'h-4', name: 'Meditação matinal', category: 'Rotina', days: [true, false, false, false, false, false, false] }
  ],
  goals: [
    {
      id: 'g-1',
      title: 'Lançar Novo Portfólio Pessoal',
      category: 'Profissional',
      status: 'in_progress',
      subtasks: [
        { id: 'st-1', text: 'Estruturar seções e wireframe', completed: true },
        { id: 'st-2', text: 'Configurar domínio e deploy rápido', completed: true },
        { id: 'st-3', text: 'Revisar responsividade mobile', completed: false }
      ]
    },
    {
      id: 'g-2',
      title: 'Rotina de Saúde & Corrida 5km',
      category: 'Saúde',
      status: 'todo',
      subtasks: [
        { id: 'st-4', text: 'Comprar tênis de corrida adequado', completed: false },
        { id: 'st-5', text: 'Treinar 3x na semana (intervalado)', completed: false },
        { id: 'st-6', text: 'Completar prova de 5km', completed: false }
      ]
    },
    {
      id: 'g-3',
      title: 'Especialização em UI/UX & Produtividade',
      category: 'Estudos',
      status: 'done',
      subtasks: [
        { id: 'st-7', text: 'Módulos de micro-interações', completed: true },
        { id: 'st-8', text: 'Projeto prático final', completed: true }
      ]
    }
  ]
};

// Armazenamento em memória local (fallback para quando Supabase não estiver configurado)
export const localStore: AppState = JSON.parse(JSON.stringify(initialDefaultState));
