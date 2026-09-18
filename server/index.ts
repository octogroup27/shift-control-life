import app from './app.js';
import { isSupabaseConfigured } from './supabase.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 Shift - Control Life Backend rodando na porta ${PORT}`);
  console.log(`📍 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📊 Estado Completo: http://localhost:${PORT}/api/state`);
  console.log(`🔌 Provedor de Banco: ${isSupabaseConfigured() ? 'Supabase (Nuvem)' : 'Armazenamento Local'}`);
  console.log('====================================================');
});
