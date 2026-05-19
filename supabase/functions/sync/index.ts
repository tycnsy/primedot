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

function methodNotAllowed(): Response {
  return json({ error: 'method_not_allowed' }, 405);
}

function internal(message: string): Response {
  return json({ error: 'internal', message }, 500);
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
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) return internal(error.message);
  return json({
    user_id: userId,
    email: data.user?.email ?? null,
  });
}

async function handleListProjects(userId: string): Promise<Response> {
  const projectsRes = await admin
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (projectsRes.error) return internal(projectsRes.error.message);

  const projects = projectsRes.data ?? [];
  const projectIds = projects.map((p: { id: string }) => p.id);

  let tasks: unknown[] = [];
  if (projectIds.length > 0) {
    const tasksRes = await admin
      .from('tasks')
      .select('*')
      .in('project_id', projectIds)
      .order('project_id', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (tasksRes.error) return internal(tasksRes.error.message);
    tasks = tasksRes.data ?? [];
  }

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
      'id,project_id,type,current_progress,scaling_modifier,scripting_modifier,script_length,unit_count,unit_length,manual_length',
    )
    .eq('id', taskId)
    .maybeSingle();
  if (taskRes.error) return internal(taskRes.error.message);
  if (!taskRes.data) return notFound();

  const projectRes = await admin
    .from('projects')
    .select('id,user_id,video_length')
    .eq('id', taskRes.data.project_id)
    .maybeSingle();
  if (projectRes.error) return internal(projectRes.error.message);
  if (!projectRes.data || projectRes.data.user_id !== userId) {
    // Don't leak existence of tasks owned by other users.
    return notFound();
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
  const nextStatus = deriveStatusFromDraft(
    draft,
    typeof projectRes.data.video_length === 'number'
      ? projectRes.data.video_length
      : 0,
  );

  const updateRes = await admin
    .from('tasks')
    .update({ current_progress: currentProgress, status: nextStatus })
    .eq('id', taskId)
    .select('id,current_progress,status')
    .single();
  if (updateRes.error) return internal(updateRes.error.message);

  return json({
    id: updateRes.data.id,
    current_progress: updateRes.data.current_progress,
    status: updateRes.data.status,
  });
}

Deno.serve(async (req) => {
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
});
