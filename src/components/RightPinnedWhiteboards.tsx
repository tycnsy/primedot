import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type PinnedBoard = {
  id: string;
  slug: string;
  name: string;
  pinned_order: number;
  updated_at: string;
};

export default function RightPinnedWhiteboards() {
  const { user } = useAuth();
  const [boards, setBoards] = useState<PinnedBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const loadPinnedBoards = async () => {
      if (!user) {
        if (alive) {
          setBoards([]);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const { data, error: queryError } = await supabase
        .from('whiteboards')
        .select('id, slug, name, pinned_order, updated_at')
        .eq('user_id', user.id)
        .eq('is_pinned', true)
        .order('pinned_order', { ascending: true })
        .order('updated_at', { ascending: false });

      if (!alive) return;

      if (queryError) {
        setBoards([]);
        setError(queryError.message);
      } else {
        setBoards((data ?? []) as PinnedBoard[]);
        setError(null);
      }
      setLoading(false);
    };

    void loadPinnedBoards();
    return () => {
      alive = false;
    };
  }, [user]);

  return (
    <div className="border-t border-border/60 p-2">
      <div className="rounded-md border border-border/70 bg-surface2/30">
        <div className="border-b border-border/70 px-2.5 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Pinned whiteboards
          </span>
        </div>

        <div className="space-y-1 p-1.5">
          {loading ? (
            <p className="px-1.5 py-1 text-xs text-muted">Loading pinned whiteboards...</p>
          ) : error ? (
            <p className="px-1.5 py-1 text-xs text-danger">Could not load pinned whiteboards.</p>
          ) : boards.length === 0 ? (
            <p className="px-1.5 py-1 text-xs text-muted">No pinned whiteboards yet.</p>
          ) : (
            boards.map((board) => (
              <Link
                key={board.id}
                to={`/whiteboards/${board.slug}`}
                className="block rounded-md border border-transparent px-2 py-1.5 text-xs text-fg transition-colors hover:border-border hover:bg-surface2/70"
              >
                <span className="line-clamp-2 break-words">{board.name}</span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
