import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type BoardRow = {
  id: string;
  slug: string;
  name: string;
  updated_at: string;
  created_at: string;
};

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'board';
}

export default function Whiteboards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadBoards() {
      if (!user) return;
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from('whiteboards')
        .select('id, slug, name, updated_at, created_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (!alive) return;
      if (loadError) {
        setError(loadError.message);
      } else {
        setBoards((data ?? []) as BoardRow[]);
        setError(null);
      }
      setLoading(false);
    }

    void loadBoards();
    return () => {
      alive = false;
    };
  }, [user]);

  const hasBoards = useMemo(() => boards.length > 0, [boards]);

  async function createBoard(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || creating) return;

    const rawName = name.trim();
    const boardName = rawName || 'Untitled board';
    const baseSlug = slugify(boardName);

    setCreating(true);
    setError(null);

    for (let i = 0; i < 20; i += 1) {
      const slug = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;
      const { error: insertError } = await supabase.from('whiteboards').insert({
        user_id: user.id,
        slug,
        name: boardName,
      });

      if (!insertError) {
        navigate(`/whiteboards/${slug}`);
        return;
      }

      const isUniqueViolation =
        insertError.code === '23505' &&
        insertError.message.toLowerCase().includes('whiteboards_user_slug_unique');
      if (!isUniqueViolation) {
        setError(insertError.message);
        setCreating(false);
        return;
      }
    }

    setError('Could not generate a unique board slug. Try a different name.');
    setCreating(false);
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">Whiteboards</h1>
        <p className="mt-1 text-sm text-muted">
          Create a new board or open an existing one.
        </p>
      </header>

      <form
        onSubmit={createBoard}
        className="mb-6 flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-end"
      >
        <label className="flex-1 text-sm text-muted">
          Board name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Product roadmap"
            className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="btn-primary h-10 px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
        >
          {creating ? 'Creating...' : 'Create board'}
        </button>
      </form>

      {error ? (
        <p className="mb-4 rounded-md border border-rose-300/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-4 py-3 text-sm font-medium text-fg">
          Existing boards
        </div>
        {loading ? (
          <p className="px-4 py-4 text-sm text-muted">Loading boards...</p>
        ) : hasBoards ? (
          <ul className="divide-y divide-border">
            {boards.map((board) => (
              <li key={board.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{board.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    /whiteboards/{board.slug} · updated{' '}
                    {new Date(board.updated_at).toLocaleString()}
                  </p>
                </div>
                <Link className="btn-ghost !px-3 !py-1.5 text-xs" to={`/whiteboards/${board.slug}`}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-muted">No boards yet. Create your first board above.</p>
        )}
      </div>
    </section>
  );
}
