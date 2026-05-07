import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local and fill them in.',
  );
}

let parsedUrl: URL;
try {
  parsedUrl = new URL(url);
} catch {
  throw new Error(
    'VITE_SUPABASE_URL is invalid. Set it to your real Supabase project URL (for example: https://abcd1234.supabase.co).',
  );
}

if (
  parsedUrl.host === 'your-project.supabase.co' ||
  parsedUrl.host.includes('<your-project-ref>') ||
  parsedUrl.host.includes('your-project-ref')
) {
  throw new Error(
    'VITE_SUPABASE_URL is still a placeholder. Replace it with your real Supabase project URL (for example: https://abcd1234.supabase.co).',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
