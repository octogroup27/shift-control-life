# Shift - Control Life (Frontend + Backend + Supabase)

Sistema de gestão pessoal e produtividade inteligente com agenda dinâmica estilo Google Calendar, tarefas diárias categorizadas, rastreador de hábitos semanal e metas Kanban.

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 18 ou superior)

### 1. Instalar dependências
```bash
npm install --legacy-peer-deps
```

### 2. Configurar o Banco de Dados no Supabase
1. Crie uma conta ou acesse seu painel no [Supabase](https://supabase.com/).
2. Crie um novo projeto (ex: `shift-control-life`).
3. No menu lateral do Supabase, clique em **SQL Editor** -> **New Query**.
4. Abra o arquivo [`supabase_schema.sql`](./supabase_schema.sql) deste projeto, copie todo o seu conteúdo, cole no SQL Editor do Supabase e clique em **Run** (Ctrl+Enter).
   - Isso criará todas as tabelas (`profiles`, `events`, `tasks`, `habits`, `goals`, `goal_subtasks`), políticas de segurança (RLS) e dados de demonstração iniciais.
5. No menu lateral do Supabase, vá em **Project Settings** -> **API** e copie:
   - **Project URL**
   - **anon public key**
6. No arquivo [`.env`](./.env) na raiz do projeto, preencha:
   ```env
   PORT=3001
   SUPABASE_URL="https://seu-projeto.supabase.co"
   SUPABASE_ANON_KEY="sua-anon-key-aqui"
   ```

> 💡 **Nota:** Se você não configurar o Supabase imediatamente, o sistema funcionará normalmente em **Modo Local** (persistindo no backend e no navegador). Assim que preencher o `.env`, o backend passará a gravar diretamente no Supabase.

### 3. Iniciar o Sistema

Para iniciar o **Frontend e o Backend juntos**:
```bash
npm run dev:all
```

Ou em terminais separados:
- **Backend Express**: `npm run server` (porta 3001)
- **Frontend Vite**: `npm run dev` (porta 3000)

Abra no seu navegador: **[http://localhost:3000](http://localhost:3000)**

---

## 📡 Endpoints da API Backend

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/health` | Status do servidor e conectividade com o Supabase |
| `GET` | `/api/state` | Carrega o estado completo consolidado da aplicação |
| `PUT` | `/api/state` | Sincroniza em lote o estado da aplicação |
| `POST` | `/api/reset` | Restaura os dados para o padrão de demonstração |
| `GET / PUT` | `/api/profile` | Obter ou atualizar nome do perfil |
| `GET / POST` | `/api/events` | Listar ou criar eventos na agenda |
| `PUT / DELETE`| `/api/events/:id` | Atualizar horário/duração/título ou excluir evento |
| `GET / POST` | `/api/tasks` | Listar ou criar tarefas diárias |
| `PATCH / DELETE` | `/api/tasks/:id` | Alternar status concluído ou excluir tarefa |
| `GET / POST` | `/api/habits` | Listar ou criar hábitos semanais |
| `PATCH / DELETE` | `/api/habits/:id` | Alternar dias concluídos da semana ou excluir hábito |
| `GET / POST` | `/api/goals` | Listar metas com subtarefas ou criar nova meta |
| `PATCH / DELETE` | `/api/goals/:id` | Mover entre colunas Kanban (`todo`, `in_progress`, `done`) ou excluir |
| `POST / PATCH / DELETE` | `/api/goals/:id/subtasks` | Gerenciar subtarefas e checklists das metas |
