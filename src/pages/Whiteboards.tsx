import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type BoardRow = {
  id: string;
  slug: string;
  name: string;
  folder_id: string | null;
  sort_order: number;
  is_pinned: boolean;
  pinned_order: number;
  updated_at: string;
  created_at: string;
};

type FolderRow = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  updated_at: string;
  created_at: string;
};

type DragState = {
  boardId: string;
  sectionKey: string;
};

type FolderPopupState = {
  open: boolean;
  parentId: string | null;
};

function slugifyName(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'board';
}

function formatStamp(value: string): string {
  return new Date(value).toLocaleString();
}

function reorderList<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function sortByOrder<T extends { sort_order: number; updated_at: string; created_at: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    if (a.updated_at !== b.updated_at) return b.updated_at.localeCompare(a.updated_at);
    return b.created_at.localeCompare(a.created_at);
  });
}

export default function Whiteboards() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [workingBoardId, setWorkingBoardId] = useState<string | null>(null);
  const [workingFolderId, setWorkingFolderId] = useState<string | null>(null);
  const [workingSection, setWorkingSection] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [newBoardFolderId, setNewBoardFolderId] = useState<string>('');
  const [folderPopup, setFolderPopup] = useState<FolderPopupState>({ open: false, parentId: null });
  const [folderPopupName, setFolderPopupName] = useState('');
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [boardsResult, foldersResult] = await Promise.all([
      supabase
        .from('whiteboards')
        .select('id, slug, name, folder_id, sort_order, is_pinned, pinned_order, updated_at, created_at')
        .eq('user_id', user.id),
      supabase
        .from('whiteboard_folders')
        .select('id, parent_id, name, slug, sort_order, updated_at, created_at')
        .eq('user_id', user.id),
    ]);

    if (boardsResult.error) {
      setError(boardsResult.error.message);
      setLoading(false);
      return;
    }
    if (foldersResult.error) {
      setError(foldersResult.error.message);
      setLoading(false);
      return;
    }

    const boardRows = sortByOrder((boardsResult.data ?? []) as BoardRow[]);
    const folderRows = sortByOrder((foldersResult.data ?? []) as FolderRow[]);
    setBoards(boardRows);
    setFolders(folderRows);
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      for (const folder of folderRows) next.add(folder.id);
      return next;
    });
    setError(null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!alive) return;
      await loadData();
    })();
    return () => {
      alive = false;
    };
  }, [loadData]);

  const childrenByFolder = useMemo(() => {
    const map = new Map<string | null, FolderRow[]>();
    for (const folder of folders) {
      const key = folder.parent_id;
      const bucket = map.get(key) ?? [];
      bucket.push(folder);
      map.set(key, sortByOrder(bucket));
    }
    return map;
  }, [folders]);

  const boardsByFolder = useMemo(() => {
    const map = new Map<string | null, BoardRow[]>();
    for (const board of boards) {
      const key = board.folder_id;
      const bucket = map.get(key) ?? [];
      bucket.push(board);
      map.set(key, bucket);
    }
    for (const [key, value] of map.entries()) {
      map.set(
        key,
        [...value].sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return b.updated_at.localeCompare(a.updated_at);
        }),
      );
    }
    return map;
  }, [boards]);

  const pinnedBoards = useMemo(
    () =>
      boards
        .filter((item) => item.is_pinned)
        .sort((a, b) => {
          if (a.pinned_order !== b.pinned_order) return a.pinned_order - b.pinned_order;
          return b.updated_at.localeCompare(a.updated_at);
        }),
    [boards],
  );

  const folderOptions = useMemo(() => {
    const rows: Array<{ id: string; label: string }> = [];
    function walk(parentId: string | null, prefix: string) {
      const children = childrenByFolder.get(parentId) ?? [];
      for (const child of children) {
        rows.push({ id: child.id, label: `${prefix}${child.name}` });
        walk(child.id, `${prefix}${child.name} / `);
      }
    }
    walk(null, '');
    return rows;
  }, [childrenByFolder]);

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const folder of folders) map.set(folder.id, folder.name);
    return map;
  }, [folders]);

  const hasBoards = useMemo(() => boards.length > 0, [boards]);

  const getSectionBoards = useCallback(
    (sectionKey: string, sourceBoards: BoardRow[]) => {
      if (sectionKey === 'pinned') {
        return sourceBoards
          .filter((item) => item.is_pinned)
          .sort((a, b) => a.pinned_order - b.pinned_order || b.updated_at.localeCompare(a.updated_at));
      }
      if (sectionKey === 'unfiled') {
        return sourceBoards
          .filter((item) => item.folder_id == null)
          .sort((a, b) => a.sort_order - b.sort_order || b.updated_at.localeCompare(a.updated_at));
      }
      if (sectionKey.startsWith('folder:')) {
        const folderId = sectionKey.slice('folder:'.length);
        return sourceBoards
          .filter((item) => item.folder_id === folderId)
          .sort((a, b) => a.sort_order - b.sort_order || b.updated_at.localeCompare(a.updated_at));
      }
      return [];
    },
    [],
  );

  const persistSectionOrder = useCallback(
    async (sectionKey: string, orderedBoards: BoardRow[]) => {
      if (!user) return;
      setWorkingSection(sectionKey);
      if (sectionKey === 'pinned') {
        const updates = orderedBoards.map((item, index) =>
          supabase
            .from('whiteboards')
            .update({ pinned_order: index + 1, updated_at: new Date().toISOString() })
            .eq('id', item.id)
            .eq('user_id', user.id),
        );
        const results = await Promise.all(updates);
        const firstError = results.find((result) => result.error)?.error;
        if (firstError) {
          setError(firstError.message);
          await loadData();
        }
      } else {
        const updates = orderedBoards.map((item, index) =>
          supabase
            .from('whiteboards')
            .update({ sort_order: index + 1, updated_at: new Date().toISOString() })
            .eq('id', item.id)
            .eq('user_id', user.id),
        );
        const results = await Promise.all(updates);
        const firstError = results.find((result) => result.error)?.error;
        if (firstError) {
          setError(firstError.message);
          await loadData();
        }
      }
      setWorkingSection(null);
    },
    [loadData, user],
  );

  const applyLocalSectionOrder = useCallback((sectionKey: string, orderedBoards: BoardRow[]) => {
    setBoards((prev) => {
      const updates = new Map<string, Partial<BoardRow>>();
      if (sectionKey === 'pinned') {
        orderedBoards.forEach((item, index) => updates.set(item.id, { pinned_order: index + 1 }));
      } else {
        orderedBoards.forEach((item, index) => updates.set(item.id, { sort_order: index + 1 }));
      }
      return prev.map((item) => {
        const patch = updates.get(item.id);
        return patch ? ({ ...item, ...patch } as BoardRow) : item;
      });
    });
  }, []);

  const performSectionReorder = useCallback(
    async (sectionKey: string, nextSectionBoards: BoardRow[]) => {
      applyLocalSectionOrder(sectionKey, nextSectionBoards);
      await persistSectionOrder(sectionKey, nextSectionBoards);
    },
    [applyLocalSectionOrder, persistSectionOrder],
  );

  const resolveNextBoardOrder = useCallback(
    (folderId: string | null) => {
      const items = boards.filter((item) => item.folder_id === folderId);
      const max = items.reduce((acc, item) => Math.max(acc, item.sort_order), 0);
      return max + 1;
    },
    [boards],
  );

  const resolveNextPinnedOrder = useCallback(() => {
    const max = boards.reduce((acc, item) => Math.max(acc, item.is_pinned ? item.pinned_order : 0), 0);
    return max + 1;
  }, [boards]);

  const resolveUniqueBoardSlug = useCallback(
    async (baseName: string, excludeBoardId?: string): Promise<string | null> => {
      if (!user) return null;
      const baseSlug = slugifyName(baseName);
      for (let i = 0; i < 50; i += 1) {
        const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;
        const [boardResult, aliasResult] = await Promise.all([
          supabase
            .from('whiteboards')
            .select('id')
            .eq('user_id', user.id)
            .eq('slug', candidate)
            .maybeSingle(),
          supabase
            .from('whiteboard_slug_aliases')
            .select('board_id')
            .eq('user_id', user.id)
            .eq('slug', candidate)
            .maybeSingle(),
        ]);
        if (boardResult.error) throw new Error(boardResult.error.message);
        if (aliasResult.error) throw new Error(aliasResult.error.message);
        const boardTaken = Boolean(boardResult.data && boardResult.data.id !== excludeBoardId);
        const aliasTaken = Boolean(aliasResult.data && aliasResult.data.board_id !== excludeBoardId);
        if (!boardTaken && !aliasTaken) return candidate;
      }
      return null;
    },
    [user],
  );

  const resolveUniqueFolderSlug = useCallback(
    async (nameInput: string, parentId: string | null, excludeFolderId?: string): Promise<string | null> => {
      if (!user) return null;
      const baseSlug = slugifyName(nameInput);
      for (let i = 0; i < 50; i += 1) {
        const candidate = i === 0 ? baseSlug : `${baseSlug}-${i + 1}`;
        let query = supabase
          .from('whiteboard_folders')
          .select('id')
          .eq('user_id', user.id)
          .eq('slug', candidate);
        query =
          parentId == null ? query.is('parent_id', null) : query.eq('parent_id', parentId);
        const { data, error: checkError } = await query.maybeSingle();
        if (checkError) throw new Error(checkError.message);
        if (!data || data.id === excludeFolderId) return candidate;
      }
      return null;
    },
    [user],
  );

  function toggleFolderExpanded(folderId: string) {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }

  async function createBoard(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || creating) return;

    const rawName = name.trim();
    const boardName = rawName || 'Untitled board';
    const targetFolderId = newBoardFolderId || null;

    setCreating(true);
    setError(null);

    try {
      const slug = await resolveUniqueBoardSlug(boardName);
      if (!slug) {
        setError('Could not generate a unique board slug. Try a different name.');
        setCreating(false);
        return;
      }
      const sortOrder = resolveNextBoardOrder(targetFolderId);
      const { error: insertError } = await supabase.from('whiteboards').insert({
        user_id: user.id,
        slug,
        name: boardName,
        folder_id: targetFolderId,
        sort_order: sortOrder,
      });
      if (insertError) {
        setError(insertError.message);
        setCreating(false);
        return;
      }
      setName('');
      setNewBoardFolderId('');
      setCreating(false);
      navigate(`/whiteboards/${slug}?new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board.');
      setCreating(false);
    }
  }

  function openCreateFolderPopup(parentId: string | null) {
    setFolderPopup({ open: true, parentId });
    setFolderPopupName('');
  }

  function closeCreateFolderPopup() {
    setFolderPopup({ open: false, parentId: null });
    setFolderPopupName('');
  }

  async function createFolder(parentId: string | null, folderNameInput?: string) {
    if (!user || workingFolderId) return;
    const folderName = (folderNameInput ?? '').trim();
    if (!folderName) return;
    setWorkingFolderId(parentId ?? 'root');
    setError(null);
    try {
      const slug = await resolveUniqueFolderSlug(folderName, parentId);
      if (!slug) {
        setError('Could not generate a unique folder slug.');
        setWorkingFolderId(null);
        return;
      }
      const siblingMax = (childrenByFolder.get(parentId) ?? []).reduce(
        (acc, item) => Math.max(acc, item.sort_order),
        0,
      );
      const { error: insertError } = await supabase.from('whiteboard_folders').insert({
        user_id: user.id,
        parent_id: parentId,
        name: folderName,
        slug,
        sort_order: siblingMax + 1,
      });
      if (insertError) {
        setError(insertError.message);
      } else {
        closeCreateFolderPopup();
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder.');
    }
    setWorkingFolderId(null);
  }

  async function submitCreateFolderPopup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!folderPopup.open) return;
    await createFolder(folderPopup.parentId, folderPopupName);
  }

  async function renameFolder(folder: FolderRow) {
    if (!user || workingFolderId) return;
    const input = window.prompt('Rename folder', folder.name);
    const nextName = input?.trim();
    if (!nextName || nextName === folder.name) return;
    setWorkingFolderId(folder.id);
    setError(null);
    try {
      const nextSlug = await resolveUniqueFolderSlug(nextName, folder.parent_id, folder.id);
      if (!nextSlug) {
        setError('Could not generate a unique folder slug.');
        setWorkingFolderId(null);
        return;
      }
      const { error: updateError } = await supabase
        .from('whiteboard_folders')
        .update({ name: nextName, slug: nextSlug, updated_at: new Date().toISOString() })
        .eq('id', folder.id)
        .eq('user_id', user.id);
      if (updateError) setError(updateError.message);
      else {
        setFolders((prev) =>
          prev.map((item) =>
            item.id === folder.id
              ? { ...item, name: nextName, slug: nextSlug, updated_at: new Date().toISOString() }
              : item,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename folder.');
    }
    setWorkingFolderId(null);
  }

  async function deleteFolder(folder: FolderRow) {
    if (!user || workingFolderId) return;
    const descendantIds = new Set<string>();
    const walk = (folderId: string) => {
      const children = childrenByFolder.get(folderId) ?? [];
      for (const child of children) {
        descendantIds.add(child.id);
        walk(child.id);
      }
    };
    walk(folder.id);
    const affectedBoards = boards.filter(
      (board) => board.folder_id === folder.id || (board.folder_id != null && descendantIds.has(board.folder_id)),
    );
    const note =
      affectedBoards.length > 0 || descendantIds.size > 0
        ? `\nThis folder has ${descendantIds.size} subfolder(s) and ${affectedBoards.length} board(s). Boards will move to Unfiled.`
        : '';
    const confirmed = window.confirm(`Delete folder "${folder.name}"?${note}`);
    if (!confirmed) return;
    setWorkingFolderId(folder.id);
    setError(null);
    const { error: deleteError } = await supabase
      .from('whiteboard_folders')
      .delete()
      .eq('id', folder.id)
      .eq('user_id', user.id);
    if (deleteError) {
      setError(deleteError.message);
      setWorkingFolderId(null);
      return;
    }
    await loadData();
    setWorkingFolderId(null);
  }

  async function renameBoard(board: BoardRow) {
    if (!user || workingBoardId) return;
    const input = window.prompt('Rename board', board.name);
    const nextName = input?.trim();
    if (!nextName || nextName === board.name) return;
    setWorkingBoardId(board.id);
    setError(null);
    try {
      const nextSlug = await resolveUniqueBoardSlug(nextName, board.id);
      if (!nextSlug) {
        setError('Could not generate a unique board slug.');
        setWorkingBoardId(null);
        return;
      }
      if (board.slug !== nextSlug) {
        const { error: aliasError } = await supabase.from('whiteboard_slug_aliases').insert({
          board_id: board.id,
          user_id: user.id,
          slug: board.slug,
        });
        if (aliasError && aliasError.code !== '23505') {
          setError(aliasError.message);
          setWorkingBoardId(null);
          return;
        }
      }
      const timestamp = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('whiteboards')
        .update({ name: nextName, slug: nextSlug, updated_at: timestamp })
        .eq('id', board.id)
        .eq('user_id', user.id);
      if (updateError) {
        setError(updateError.message);
      } else {
        setBoards((prev) =>
          prev.map((item) =>
            item.id === board.id ? { ...item, name: nextName, slug: nextSlug, updated_at: timestamp } : item,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename board.');
    }
    setWorkingBoardId(null);
  }

  async function moveBoardToFolder(boardId: string, nextFolderId: string | null) {
    if (!user || workingBoardId) return;
    const board = boards.find((item) => item.id === boardId);
    if (!board) return;
    if (nextFolderId === board.folder_id) return;
    setWorkingBoardId(boardId);
    const nextSortOrder = resolveNextBoardOrder(nextFolderId);
    const timestamp = new Date().toISOString();
    const { error: moveError } = await supabase
      .from('whiteboards')
      .update({ folder_id: nextFolderId, sort_order: nextSortOrder, updated_at: timestamp })
      .eq('id', boardId)
      .eq('user_id', user.id);
    if (moveError) {
      setError(moveError.message);
    } else {
      setBoards((prev) =>
        prev.map((item) =>
          item.id === boardId
            ? { ...item, folder_id: nextFolderId, sort_order: nextSortOrder, updated_at: timestamp }
            : item,
        ),
      );
    }
    setWorkingBoardId(null);
  }

  async function togglePinBoard(board: BoardRow) {
    if (!user || workingBoardId) return;
    setWorkingBoardId(board.id);
    const timestamp = new Date().toISOString();
    const nextPinned = !board.is_pinned;
    const nextPinnedOrder = nextPinned ? resolveNextPinnedOrder() : 0;
    const { error: pinError } = await supabase
      .from('whiteboards')
      .update({
        is_pinned: nextPinned,
        pinned_order: nextPinnedOrder,
        updated_at: timestamp,
      })
      .eq('id', board.id)
      .eq('user_id', user.id);
    if (pinError) {
      setError(pinError.message);
    } else {
      setBoards((prev) =>
        prev.map((item) =>
          item.id === board.id
            ? { ...item, is_pinned: nextPinned, pinned_order: nextPinnedOrder, updated_at: timestamp }
            : item,
        ),
      );
    }
    setWorkingBoardId(null);
  }

  async function deleteBoard(board: BoardRow) {
    if (!user || deletingBoardId) return;
    const confirmed = window.confirm(`Delete "${board.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingBoardId(board.id);
    setError(null);

    const { error: deleteError } = await supabase
      .from('whiteboards')
      .delete()
      .eq('id', board.id)
      .eq('user_id', user.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      setBoards((prev) => prev.filter((item) => item.id !== board.id));
    }
    setDeletingBoardId(null);
  }

  async function onDropBoard(sectionKey: string, targetBoardId: string) {
    if (!dragState || dragState.sectionKey !== sectionKey || dragState.boardId === targetBoardId) return;
    const sectionBoards = getSectionBoards(sectionKey, boards);
    const fromIndex = sectionBoards.findIndex((item) => item.id === dragState.boardId);
    const toIndex = sectionBoards.findIndex((item) => item.id === targetBoardId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
    const nextSection = reorderList(sectionBoards, fromIndex, toIndex);
    await performSectionReorder(sectionKey, nextSection);
  }

  async function onDropSectionEnd(sectionKey: string) {
    if (!dragState) return;
    if (dragState.sectionKey !== sectionKey) {
      if (sectionKey === 'unfiled') {
        await moveBoardToFolder(dragState.boardId, null);
      }
      return;
    }
    const sectionBoards = getSectionBoards(sectionKey, boards);
    const fromIndex = sectionBoards.findIndex((item) => item.id === dragState.boardId);
    if (fromIndex < 0 || fromIndex === sectionBoards.length - 1) return;
    const nextSection = reorderList(sectionBoards, fromIndex, sectionBoards.length - 1);
    await performSectionReorder(sectionKey, nextSection);
  }

  function renderBoardRow(board: BoardRow, sectionKey: string) {
    const busy = deletingBoardId === board.id || workingBoardId === board.id || workingSection === sectionKey;
    return (
      <li
        key={`${sectionKey}:${board.id}`}
        className="flex items-center justify-between gap-3 px-4 py-3"
        draggable
        onDragStart={() => setDragState({ boardId: board.id, sectionKey })}
        onDragEnd={() => {
          setDragState(null);
          setDropTargetKey(null);
        }}
        onDragOver={(event) => {
          if (dragState?.sectionKey === sectionKey) event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          void onDropBoard(sectionKey, board.id);
          setDragState(null);
        }}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{board.name}</p>
          <p className="mt-0.5 text-xs text-muted">
            /whiteboards/{board.slug} · updated {formatStamp(board.updated_at)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link className="btn-ghost !px-3 !py-1.5 text-xs" to={`/whiteboards/${board.slug}`}>
            Open
          </Link>
          <button
            type="button"
            onClick={() => void renameBoard(board)}
            disabled={busy}
            className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-60"
          >
            Rename
          </button>
          <button
            type="button"
            onClick={() => void togglePinBoard(board)}
            disabled={busy}
            className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-60"
          >
            {board.is_pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            type="button"
            onClick={() => void deleteBoard(board)}
            disabled={deletingBoardId !== null}
            className="rounded-md border border-rose-700 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:border-rose-400 disabled:bg-rose-300 disabled:text-rose-100"
          >
            {deletingBoardId === board.id ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </li>
    );
  }

  function renderSection(sectionKey: string, title: string, items: BoardRow[]) {
    const isUnfiledDropTarget = sectionKey === 'unfiled' && dropTargetKey === 'unfiled';
    return (
      <div
        className={`rounded-xl border border-border bg-surface transition-colors ${
          isUnfiledDropTarget ? 'bg-accent/10 ring-1 ring-accent/40' : ''
        }`}
        onDragOver={(event) => {
          if (!dragState) return;
          if (dragState.sectionKey === sectionKey || sectionKey === 'unfiled') {
            event.preventDefault();
            if (sectionKey === 'unfiled') setDropTargetKey('unfiled');
          }
        }}
        onDragLeave={() => {
          if (sectionKey === 'unfiled' && dropTargetKey === 'unfiled') setDropTargetKey(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          void onDropSectionEnd(sectionKey);
          setDragState(null);
          setDropTargetKey(null);
        }}
      >
        <div className="border-b border-border px-4 py-3 text-sm font-medium text-fg">{title}</div>
        {items.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted">No boards in this section.</p>
        ) : (
          <ul className="divide-y divide-border">{items.map((board) => renderBoardRow(board, sectionKey))}</ul>
        )}
      </div>
    );
  }

  function renderFolderTree(folder: FolderRow, depth: number) {
    const children = childrenByFolder.get(folder.id) ?? [];
    const folderBoards = boardsByFolder.get(folder.id) ?? [];
    const expanded = expandedFolderIds.has(folder.id);
    const sectionKey = `folder:${folder.id}`;
    const folderDropKey = `folder:${folder.id}`;
    const isFolderDropTarget = dropTargetKey === folderDropKey;
    return (
      <div key={folder.id} className="space-y-3">
        <div className="rounded-xl border border-border bg-surface">
          <div
            className={`flex items-center justify-between gap-3 border-b border-border px-4 py-3 transition-colors ${
              isFolderDropTarget ? 'bg-accent/10 ring-1 ring-inset ring-accent/40' : ''
            }`}
            onDragOver={(event) => {
              if (dragState) {
                event.preventDefault();
                setDropTargetKey(folderDropKey);
              }
            }}
            onDragLeave={() => {
              if (dropTargetKey === folderDropKey) setDropTargetKey(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragState?.boardId) {
                void moveBoardToFolder(dragState.boardId, folder.id);
              }
              setDragState(null);
              setDropTargetKey(null);
            }}
          >
            <button
              type="button"
              onClick={() => toggleFolderExpanded(folder.id)}
              className="text-left text-sm font-medium text-fg"
              style={{ paddingLeft: `${depth * 14}px` }}
            >
              {expanded ? '▾' : '▸'} {folder.name}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openCreateFolderPopup(folder.id)}
                disabled={workingFolderId === folder.id}
                className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-60"
              >
                Add subfolder
              </button>
              <button
                type="button"
                onClick={() => void renameFolder(folder)}
                disabled={workingFolderId === folder.id}
                className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-60"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => void deleteFolder(folder)}
                disabled={workingFolderId === folder.id}
                className="btn-ghost !px-3 !py-1.5 text-xs text-rose-300 disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
          {expanded ? (
            <div
              onDragOver={(event) => {
                if (dragState?.sectionKey === sectionKey) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                void onDropSectionEnd(sectionKey);
                setDragState(null);
              }}
            >
              {folderBoards.length > 0 ? (
                <ul className="divide-y divide-border">
                  {folderBoards.map((board) => renderBoardRow(board, sectionKey))}
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm text-muted">No boards in this folder.</p>
              )}
            </div>
          ) : null}
        </div>
        {expanded ? children.map((child) => renderFolderTree(child, depth + 1)) : null}
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fg">Whiteboards</h1>
            <p className="mt-1 text-sm text-muted">
              Create boards, organize folders, pin favorites, and drag to reorder inside each section.
            </p>
          </div>
          <button
            type="button"
            title="Create folder"
            onClick={() => openCreateFolderPopup(null)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-fg hover:bg-bg"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z" />
              <path d="M12 11v6" />
              <path d="M9 14h6" />
            </svg>
          </button>
        </div>
      </header>

      <form
        onSubmit={createBoard}
        className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 md:flex-row md:items-end"
      >
        <label className="w-full text-sm text-muted md:flex-1">
          Board name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Product roadmap"
            className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
        </label>
        <label className="w-full text-sm text-muted md:w-72">
          Folder
          <select
            value={newBoardFolderId}
            onChange={(event) => setNewBoardFolderId(event.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          >
            <option value="">Unfiled</option>
            {folderOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
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

      {loading ? <p className="text-sm text-muted">Loading whiteboards...</p> : null}

      {!loading && !hasBoards && folders.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-4 text-sm text-muted">
          No boards or folders yet. Create your first board above.
        </div>
      ) : null}

      {!loading ? (
        <div className="space-y-4">
          {renderSection('pinned', 'Pinned', pinnedBoards)}
          {renderSection('unfiled', 'Unfiled', boardsByFolder.get(null) ?? [])}
          {(childrenByFolder.get(null) ?? []).map((folder) => renderFolderTree(folder, 0))}
        </div>
      ) : null}

      {folderPopup.open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={submitCreateFolderPopup}
            className="w-full max-w-md rounded-xl border border-border bg-surface p-4"
          >
            <p className="text-sm font-medium text-fg">Create folder</p>
            <p className="mt-1 text-xs text-muted">
              Parent:{' '}
              {folderPopup.parentId ? folderNameById.get(folderPopup.parentId) ?? 'Folder' : 'Root'}
            </p>
            <label className="mt-3 block text-sm text-muted">
              Folder name
              <input
                value={folderPopupName}
                onChange={(event) => setFolderPopupName(event.target.value)}
                placeholder="e.g. Planning"
                className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent"
              />
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button type="button" onClick={closeCreateFolderPopup} className="btn-ghost !px-3 !py-2 text-xs">
                Cancel
              </button>
              <button
                type="submit"
                disabled={workingFolderId === (folderPopup.parentId ?? 'root')}
                className="btn-primary !px-3 !py-2 text-xs disabled:opacity-60"
              >
                {workingFolderId === (folderPopup.parentId ?? 'root') ? 'Creating...' : 'Create folder'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
