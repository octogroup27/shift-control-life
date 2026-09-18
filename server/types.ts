export interface EventItem {
  id: string;
  title: string;
  day: number; // 0..6 (Segunda a Domingo)
  startHour: number;
  startMinute: number;
  duration: number;
  color: string;
  category: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
  category: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface HabitItem {
  id: string;
  name: string;
  category: string;
  days: boolean[]; // Array de 7 posições
  createdAt?: string;
  updatedAt?: string;
}

export interface GoalSubtask {
  id: string;
  text: string;
  completed: boolean;
  goalId?: string;
  createdAt?: string;
}

export interface GoalItem {
  id: string;
  title: string;
  category: string;
  status: 'todo' | 'in_progress' | 'done';
  subtasks: GoalSubtask[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AppState {
  userName: string;
  events: EventItem[];
  tasks: TaskItem[];
  habits: HabitItem[];
  goals: GoalItem[];
}
