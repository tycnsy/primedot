import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { IntegrationToken } from '../lib/types';

const tokensKey = (userId: string | undefined) =>
  ['integration_tokens', userId] as const;

// Tokens are formatted `cnsy_prime_<32 random>`. Only the SHA-256 hash is
// stored in the database; the raw value is shown to the user exactly once.
const TOKEN_PREFIX = 'cnsy_prime_';
const TOKEN_RANDOM_LENGTH = 32;

function generateRawToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let random = '';
  for (let i = 0; i < TOKEN_RANDOM_LENGTH; i += 1) {
    random += alphabet[bytes[i % bytes.length] % alphabet.length];
  }
  return `${TOKEN_PREFIX}${random}`;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface CreatedIntegrationToken {
  token: IntegrationToken;
  rawToken: string;
}

export function useIntegrationTokens() {
  const { user } = useAuth();
  return useQuery({
    queryKey: tokensKey(user?.id),
    enabled: !!user,
    queryFn: async (): Promise<IntegrationToken[]> => {
      const { data, error } = await supabase
        .from('integration_tokens')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as IntegrationToken[];
    },
  });
}

export function useCreateIntegrationToken() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (name: string): Promise<CreatedIntegrationToken> => {
      if (!user) throw new Error('Not signed in');
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Token name is required.');

      const rawToken = generateRawToken();
      const tokenHash = await sha256Hex(rawToken);
      const tokenPrefix = rawToken.slice(0, TOKEN_PREFIX.length + 4);

      const { data, error } = await supabase
        .from('integration_tokens')
        .insert({
          user_id: user.id,
          name: trimmed,
          token_hash: tokenHash,
          token_prefix: tokenPrefix,
        })
        .select()
        .single();
      if (error) throw error;
      return { token: data as IntegrationToken, rawToken };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tokensKey(user?.id) });
    },
  });
}

export function useRevokeIntegrationToken() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('integration_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as IntegrationToken;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tokensKey(user?.id) });
    },
  });
}

export function useDeleteIntegrationToken() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('integration_tokens')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tokensKey(user?.id) });
    },
  });
}
