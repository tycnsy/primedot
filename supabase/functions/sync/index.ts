// prime. — `sync` Edge Function
//
// Public HTTP API used by external apps (censaySplit, etc.) to read
// projects + tasks and push back progress updates. Authenticates with a
// `cnsy_prime_*` bearer token issued from prime. Settings -> Integrations.
//
// Endpoints (path is relative to the function root):
//   GET    /whoami                       -> { user_id, email }
//   GET    /projects                     -> { projects: [...], tasks: [...] }
//   PATCH  /tasks/:id/progress           -> body { current_progress: number }
//
// All endpoints require Authorization: Bearer cnsy_prime_...
// Ownership is enforced manually against the parent project's user_id
// since the service role bypasses RLS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateToken } from './auth.ts';
import { deriveStatusFromDraft, type TaskStatusDraft } from './progress.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  });
}

function notFound(): Response {
  return json({ error: 'not_found' }, 404);
}

function unauthorized(): Response {
  return json({ error: 'unauthorized' }, 401);
}

function badRequest(message: string): Response {
  return json({ error: 'bad_request', message }, 400);
}

function conflict(message: string): Response {
  return json({ error: 'conflict', message }, 409);
}

function methodNotAllowed(): Response {
  return json({ error: 'method_not_allowed' }, 405);
}

function internal(message: string): Response {
  return json({ error: 'internal', message }, 500);
}

function isResultLike<T>(
  value: unknown,
): value is { data: T | null; error: { message?: string } | null } {
  return typeof value === 'object' && value !== null && 'data' in value && 'error' in value;
}

// Strip the function-route prefix so we can match on /whoami, /projects, etc.
// Supabase invokes the function at `/functions/v1/sync/<rest>`.
function routePath(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean);
  const syncIdx = segments.indexOf('sync');
  const rest = syncIdx >= 0 ? segments.slice(syncIdx + 1) : segments;
  return '/' + rest.join('/');
}

async function handleWhoami(userId: string): Promise<Response> {
  const whoamiRes = await admin.auth.admin.getUserById(userId);
  if (!isResultLike<{ user?: { email?: string | null } }>(whoamiRes)) {
    return internal('whoami lookup returned an invalid response');
  }
  const { data, error } = whoamiRes;
  if (error) return internal(error.message);
  return json({
    user_id: userId,
    email: data?.user?.email ?? null,
  });
}

async function handleListProjects(userId: string): Promise<Response> {
  type RawProject = {
    id: string;
    name: string;
    video_length: number;
    due_date: string | null;
    buffer_modifier: number;
    tag: string | null;
    series: string | null;
    notes: string | null;
    sort_order: number;
    created_at: string;
    archived_at: string | null;
    pace_hidden: boolean | number | null;
  };

  const projectsResUnknown = await admin
    .from('projects')
    .select(
      'id,name,video_length,due_date,buffer_modifier,tag,series,notes,sort_order,created_at,archived_at,pace_hidden',
    )
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (!isResultLike<Array<{ id: string }>>(projectsResUnknown)) {
    return internal('projects query returned an invalid response');
  }
  const projectsRes = projectsResUnknown;
  if (projectsRes.error) return internal(projectsRes.error.message);

  // Keep a defensive in-memory filter so archived rows are excluded even if
  // PostgREST filter behavior changes or a stale deployment omits `.is(...)`.
  const projects = ((projectsRes.data ?? []) as RawProject[])
    .filter((project) => project.archived_at == null)
    .map(({ archived_at: _archivedAt, pace_hidden, ...project }) => ({
      ...project,
      pace_hidden: Boolean(pace_hidden),
    }));
  const projectIds = projects.map((p: { id: string }) => p.id);

  type RawTask = {
    id: string;
    project_id: string;
    name: string;
    status: string;
    type: string;
    current_progress: number;
    scaling_modifier: number | null;
    scripting_modifier: number | null;
    script_length: number | null;
    unit_count: number | null;
    unit_length: number | null;
    manual_length: number | null;
    sort_order: number;
    parent_id: string | null;
    complex_mode: 'compressed' | 'expanded' | null;
    grouping_progress: number | null;
    groupable: boolean;
    created_at: string;
  };

  let allTasks: RawTask[] = [];
  if (projectIds.length > 0) {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < projectIds.length; i += CHUNK_SIZE) {
      const chunk = projectIds.slice(i, i + CHUNK_SIZE);
      const tasksResUnknown = await admin
        .from('tasks')
        .select(
          'id,project_id,name,status,type,current_progress,scaling_modifier,scripting_modifier,script_length,unit_count,unit_length,manual_length,sort_order,parent_id,complex_mode,grouping_progress,groupable,created_at',
        )
        .in('project_id', chunk)
        .order('project_id', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (!isResultLike<RawTask[]>(tasksResUnknown)) {
        return internal('tasks query returned an invalid response');
      }
      if (tasksResUnknown.error) return internal(tasksResUnknown.error.message);
      allTasks = allTasks.concat(tasksResUnknown.data ?? []);
    }
  }

  // Mirror the active complex_mode in the sync API:
  //   * Expanded parents are UI-only headers — hide them from sync.
  //   * Subtasks whose parent is compressed are represented by the parent.
  const tasksById = new Map(allTasks.map((t) => [t.id, t]));
  const tasks = allTasks.filter((t) => {
    if (t.complex_mode === 'expanded') return false;
    if (t.parent_id) {
      const parent = tasksById.get(t.parent_id);
      if (parent && parent.complex_mode === 'compressed') return false;
    }
    return true;
  });

  return json({ projects, tasks });
}

async function handleUpdateTaskProgress(
  userId: string,
  taskId: string,
  req: Request,
): Promise<Response> {
  let body: { current_progress?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return badRequest('invalid_json');
  }

  if (
    typeof body.current_progress !== 'number' ||
    !Number.isFinite(body.current_progress)
  ) {
    return badRequest('current_progress must be a finite number');
  }
  const currentProgress = Math.max(0, Math.round(body.current_progress));

  // Fetch the task + parent project for ownership and status derivation.
  const taskRes = await admin
    .from('tasks')
    .select(
      'id,project_id,type,current_progress,scaling_modifier,scripting_modifier,script_length,unit_count,unit_length,manual_length,parent_id,complex_mode',
    )
    .eq('id', taskId)
    .maybeSingle();
  if (taskRes.error) return internal(taskRes.error.message);
  if (!taskRes.data) return notFound();

  const projectRes = await admin
    .from('projects')
    .select('id,user_id,video_length,archived_at')
    .eq('id', taskRes.data.project_id)
    .maybeSingle();
  if (projectRes.error) return internal(projectRes.error.message);
  if (!projectRes.data || projectRes.data.user_id !== userId) {
    // Don't leak existence of tasks owned by other users.
    return notFound();
  }
  if (projectRes.data.archived_at) {
    return conflict('project is archived');
  }

  const projectVideoLength =
    typeof projectRes.data.video_length === 'number'
      ? projectRes.data.video_length
      : 0;

  // Reject writes to tasks hidden from the mirror view.
  if (taskRes.data.complex_mode === 'expanded') {
    return conflict(
      'task is a complex parent in expanded mode; patch its subtasks instead',
    );
  }
  if (taskRes.data.parent_id) {
    const parentRes = await admin
      .from('tasks')
      .select('complex_mode')
      .eq('id', taskRes.data.parent_id)
      .maybeSingle();
    if (parentRes.error) return internal(parentRes.error.message);
    if (parentRes.data?.complex_mode === 'compressed') {
      return conflict(
        'task is a subtask of a compressed complex parent; patch the parent instead',
      );
    }
  }

  const draft: TaskStatusDraft = {
    type: taskRes.data.type,
    current_progress: currentProgress,
    scaling_modifier: taskRes.data.scaling_modifier ?? null,
    scripting_modifier: taskRes.data.scripting_modifier ?? null,
    script_length: taskRes.data.script_length ?? null,
    unit_count: taskRes.data.unit_count ?? null,
    unit_length: taskRes.data.unit_length ?? null,
    manual_length: taskRes.data.manual_length ?? null,
  };
  const nextStatus = deriveStatusFromDraft(draft, projectVideoLength);

  const updateRes = await admin
    .from('tasks')
    .update({ current_progress: currentProgress, status: nextStatus })
    .eq('id', taskId)
    .select('id,current_progress,status')
    .single();
  if (updateRes.error) return internal(updateRes.error.message);

  // For a compressed complex parent, propagate the same progress value
  // (and recomputed status per subtask) to every subtask so re-expanding
  // starts the subtasks at the same value the parent now shows.
  if (taskRes.data.complex_mode === 'compressed') {
    const subsRes = await admin
      .from('tasks')
      .select(
        'id,type,scaling_modifier,scripting_modifier,script_length,unit_count,unit_length,manual_length',
      )
      .eq('parent_id', taskId);
    if (subsRes.error) return internal(subsRes.error.message);

    for (const sub of (subsRes.data ?? []) as Array<{
      id: string;
      type: TaskStatusDraft['type'];
      scaling_modifier: number | null;
      scripting_modifier: number | null;
      script_length: number | null;
      unit_count: number | null;
      unit_length: number | null;
      manual_length: number | null;
    }>) {
      const subDraft: TaskStatusDraft = {
        type: sub.type,
        current_progress: currentProgress,
        scaling_modifier: sub.scaling_modifier ?? null,
        scripting_modifier: sub.scripting_modifier ?? null,
        script_length: sub.script_length ?? null,
        unit_count: sub.unit_count ?? null,
        unit_length: sub.unit_length ?? null,
        manual_length: sub.manual_length ?? null,
      };
      const subStatus = deriveStatusFromDraft(subDraft, projectVideoLength);
      const subUpdate = await admin
        .from('tasks')
        .update({ current_progress: currentProgress, status: subStatus })
        .eq('id', sub.id);
      if (subUpdate.error) return internal(subUpdate.error.message);
    }
  }

  return json({
    id: updateRes.data.id,
    current_progress: updateRes.data.current_progress,
    status: updateRes.data.status,
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const auth = await authenticateToken(admin, req);
    if (!auth) return unauthorized();

    const url = new URL(req.url);
    const path = routePath(url);

    if (path === '/whoami') {
      if (req.method !== 'GET') return methodNotAllowed();
      return handleWhoami(auth.userId);
    }

    if (path === '/projects') {
      if (req.method !== 'GET') return methodNotAllowed();
      return handleListProjects(auth.userId);
    }

    const progressMatch = path.match(/^\/tasks\/([^/]+)\/progress$/);
    if (progressMatch) {
      if (req.method !== 'PATCH') return methodNotAllowed();
      return handleUpdateTaskProgress(auth.userId, progressMatch[1], req);
    }

    return notFound();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? 'Unknown function error');
    console.error('sync function uncaught error:', message);
    return internal(message);
  }
});
