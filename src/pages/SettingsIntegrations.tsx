import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCreateIntegrationToken,
  useDeleteIntegrationToken,
  useIntegrationTokens,
  useRevokeIntegrationToken,
} from '../hooks/useIntegrationTokens';
import type { IntegrationToken } from '../lib/types';

function formatTimestamp(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function deriveSyncApiBase(): string {
  try {
    const url = (import.meta as { env?: Record<string, string | undefined> })
      .env?.VITE_SUPABASE_URL;
    if (!url) return '';
    return `${url.replace(/\/+$/, '')}/functions/v1/sync`;
  } catch {
    return '';
  }
}

export default function SettingsIntegrations() {
  const tokensQ = useIntegrationTokens();
  const createToken = useCreateIntegrationToken();
  const revokeToken = useRevokeIntegrationToken();
  const deleteToken = useDeleteIntegrationToken();

  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revealedToken, setRevealedToken] = useState<{
    name: string;
    rawToken: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const syncApiBase = deriveSyncApiBase();

  const handleCreate = async () => {
    setCreateError(null);
    setActionError(null);
    try {
      const result = await createToken.mutateAsync(newName);
      setRevealedToken({ name: result.token.name, rawToken: result.rawToken });
      setNewName('');
      setCopied(false);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Failed to create token.',
      );
    }
  };

  const handleRevoke = async (token: IntegrationToken) => {
    if (
      !confirm(
        `Revoke "${token.name}"? Apps using this token will lose access immediately.`,
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await revokeToken.mutateAsync(token.id);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to revoke token.',
      );
    }
  };

  const handleDelete = async (token: IntegrationToken) => {
    if (
      !confirm(
        `Delete "${token.name}"? This permanently removes the token record.`,
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await deleteToken.mutateAsync(token.id);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to delete token.',
      );
    }
  };

  const handleCopy = async () => {
    if (!revealedToken) return;
    try {
      await navigator.clipboard.writeText(revealedToken.rawToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <span className="label">Settings</span>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            Integrations
          </h1>
          <p className="max-w-xl text-sm text-muted">
            Generate personal access tokens for external apps (like censaySplit)
            to read your projects and push back task progress.
          </p>
        </div>
        <Link to="/projects" className="btn-ghost">
          Back to projects
        </Link>
      </div>

      {syncApiBase ? (
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold text-fg">Sync API endpoint</h2>
          <p className="text-xs text-muted">
            Paste this URL into the external app along with the token below.
          </p>
          <code className="block break-all rounded-md bg-surface2 px-3 py-2 text-xs">
            {syncApiBase}
          </code>
        </div>
      ) : null}

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold text-fg">Create a new token</h2>
        <p className="text-xs text-muted">
          Give the token a descriptive name (e.g. "censaySplit on MacBook").
          You'll see the raw token value once — copy it now and store it
          somewhere safe.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="label" htmlFor="token-name">
              Token name
            </label>
            <input
              id="token-name"
              className="input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="censaySplit on MacBook"
              maxLength={80}
            />
          </div>
          <button
            type="button"
            disabled={createToken.isPending || !newName.trim()}
            onClick={handleCreate}
            className="btn-primary"
          >
            {createToken.isPending ? 'Creating…' : 'Create token'}
          </button>
        </div>
        {createError ? <p className="text-xs text-danger">{createError}</p> : null}
      </div>

      {revealedToken ? (
        <div className="card animate-fade-in space-y-3 ring-1 ring-inset ring-accent/40">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-fg">
              Token created: {revealedToken.name}
            </h2>
            <button
              type="button"
              onClick={() => {
                setRevealedToken(null);
                setCopied(false);
              }}
              className="btn-ghost !px-2 !py-1 text-xs"
            >
              Dismiss
            </button>
          </div>
          <p className="text-xs text-warning">
            Copy this token now — it will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md bg-surface2 px-3 py-2 text-xs">
              {revealedToken.rawToken}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="btn-secondary !px-3 !py-1.5 text-xs"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-fg">Active tokens</h2>
          {tokensQ.isFetching ? (
            <span className="text-xs text-muted">Refreshing…</span>
          ) : null}
        </div>
        {actionError ? <p className="text-xs text-danger">{actionError}</p> : null}
        {tokensQ.isLoading ? (
          <p className="text-muted">Loading tokens…</p>
        ) : null}
        {tokensQ.error ? (
          <p className="text-danger">
            {tokensQ.error instanceof Error
              ? tokensQ.error.message
              : 'Failed to load tokens.'}
          </p>
        ) : null}
        {tokensQ.data && tokensQ.data.length === 0 ? (
          <div className="card text-center text-sm text-muted">
            No tokens yet. Create one above to connect an external app.
          </div>
        ) : null}
        <ul className="grid gap-3">
          {tokensQ.data?.map((token) => {
            const isRevoked = !!token.revoked_at;
            return (
              <li key={token.id} className="card space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-medium text-fg">{token.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">
                      <code className="rounded bg-surface2 px-1.5 py-0.5">
                        {token.token_prefix}…
                      </code>
                    </p>
                  </div>
                  {isRevoked ? (
                    <span className="pill bg-danger/10 text-danger ring-danger/30">
                      Revoked
                    </span>
                  ) : null}
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="label">Created</dt>
                    <dd className="mt-0.5 text-muted">
                      {formatTimestamp(token.created_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="label">Last used</dt>
                    <dd className="mt-0.5 text-muted">
                      {formatTimestamp(token.last_used_at)}
                    </dd>
                  </div>
                </dl>
                <div className="flex items-center justify-end gap-2 pt-1">
                  {!isRevoked ? (
                    <button
                      type="button"
                      onClick={() => handleRevoke(token)}
                      disabled={revokeToken.isPending}
                      className="btn-ghost !px-3 !py-1.5 text-xs text-warning"
                    >
                      Revoke
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleDelete(token)}
                    disabled={deleteToken.isPending}
                    className="btn-ghost !px-3 !py-1.5 text-xs text-danger"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
