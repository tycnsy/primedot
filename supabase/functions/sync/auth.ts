// Token authentication for the public `sync` Edge Function.
//
// Tokens have the format `cnsy_prime_<32 random chars>`. Only the SHA-256
// hash is stored in `public.integration_tokens`. This module validates a
// raw token from an `Authorization: Bearer ...` header and returns the
// owning `user_id` (or null when missing / invalid / revoked).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOKEN_PREFIX = 'cnsy_prime_';

export interface TokenAuth {
  tokenId: string;
  userId: string;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  return token;
}

export async function authenticateToken(
  admin: SupabaseClient,
  req: Request,
): Promise<TokenAuth | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);

  const { data, error } = await admin
    .from('integration_tokens')
    .select('id,user_id,revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at) return null;

  // Best-effort: record last_used_at. Don't block the request if it fails.
  void admin
    .from('integration_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {});

  return { tokenId: data.id as string, userId: data.user_id as string };
}
