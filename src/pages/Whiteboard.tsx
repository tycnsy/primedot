import { useParams } from 'react-router-dom';
import { Whiteboard } from '../whiteboard/whiteboard-app';

export default function WhiteboardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const id = boardId ?? 'default';
  return (
    <div className="h-[calc(100vh-env(safe-area-inset-top,0px))] min-h-screen w-full">
      <Whiteboard boardId={id} />
    </div>
  );
}
