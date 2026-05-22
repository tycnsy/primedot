import { useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Whiteboard } from '../whiteboard/whiteboard-app';

export default function WhiteboardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const id = boardId ?? 'default';
  const openBackgroundOnLoad = searchParams.get('new') === '1';
  const handleCanonicalSlug = useCallback(
    (resolvedSlug: string) => {
      if (!resolvedSlug || resolvedSlug === id) return;
      navigate(`/whiteboards/${resolvedSlug}`, { replace: true });
    },
    [id, navigate],
  );
  return (
    <div className="h-[calc(100vh-env(safe-area-inset-top,0px))] min-h-screen w-full">
      <Whiteboard
        key={id}
        boardId={id}
        onCanonicalSlugResolved={handleCanonicalSlug}
        openBackgroundOnLoad={openBackgroundOnLoad}
      />
    </div>
  );
}
