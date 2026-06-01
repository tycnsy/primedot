import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export type Todo = {
  id: string;
  userId: string;
  title: string;
  startDate: string;
  endDate: string;
  done: boolean;
  completedAt: string | null;
  order: number;
  createdAt: string;
};

export type NewTodo = {
  title: string;
  startDate: string;
  endDate?: string;
};

type TodoRow = {
  id: string;
  user_id: string;
  title: string;
  start_date: string;
  end_date: string;
  done: boolean;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
};

const todosKey = (userId: string | undefined) => ['todos', userId] as const;

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function mapTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    startDate: row.start_date,
    endDate: row.end_date,
    done: row.done,
    completedAt: row.completed_at,
    order: row.sort_order,
    createdAt: row.created_at,
  };
}

export function useTodos() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const todosQuery = useQuery({
    queryKey: todosKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<Todo[]> => {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('start_date', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as TodoRow[]).map(mapTodo);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: NewTodo) => {
      if (!user) throw new Error('Not signed in');
      const current = qc.getQueryData<Todo[]>(todosKey(user.id)) ?? [];
      const payload = {
        user_id: user.id,
        title: input.title,
        start_date: input.startDate,
        end_date: input.endDate ?? input.startDate,
        done: false,
        sort_order: current.length,
      };
      const { data, error } = await supabase
        .from('todos')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;
      return mapTodo(data as TodoRow);
    },
    onSuccess: (created) => {
      qc.setQueryData<Todo[]>(todosKey(user?.id), (prev) => [...(prev ?? []), created]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Todo> }) => {
      const payload: Record<string, unknown> = {};
      if ('title' in patch) payload.title = patch.title;
      if ('startDate' in patch) payload.start_date = patch.startDate;
      if ('endDate' in patch) payload.end_date = patch.endDate;
      if ('order' in patch) payload.sort_order = patch.order;
      if ('done' in patch) {
        payload.done = patch.done;
        payload.completed_at = patch.done ? new Date().toISOString() : null;
      }
      const { data, error } = await supabase
        .from('todos')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return mapTodo(data as TodoRow);
    },
    onSuccess: (updated) => {
      qc.setQueryData<Todo[]>(
        todosKey(user?.id),
        (prev) => prev?.map((todo) => (todo.id === updated.id ? updated : todo)) ?? [],
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('todos').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      qc.setQueryData<Todo[]>(
        todosKey(user?.id),
        (prev) => prev?.filter((todo) => todo.id !== id) ?? [],
      );
    },
  });

  const todos = todosQuery.data ?? [];

  return {
    todos,
    isLoading: todosQuery.isLoading,
    error: todosQuery.error as Error | null,
    createTodo: (input: NewTodo) => createMutation.mutateAsync(input),
    updateTodo: (id: string, patch: Partial<Todo>) =>
      updateMutation.mutateAsync({ id, patch }),
    toggleDone: (id: string, done: boolean) =>
      updateMutation.mutateAsync({ id, patch: { done } }),
    deleteTodo: (id: string) => deleteMutation.mutateAsync(id),
  };
}

export function useOverdueTodoCount(): number {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: todosKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<Todo[]> => {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('start_date', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as TodoRow[]).map(mapTodo);
    },
  });

  return useMemo(() => {
    const today = todayDateString();
    return (data ?? []).filter((todo) => !todo.done && todo.startDate <= today).length;
  }, [data]);
}
