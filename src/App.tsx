import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import Login from './pages/Login';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import ProjectsPace from './pages/ProjectsPace';
import Timer from './pages/Timer';
import Templates from './pages/Templates';
import HabitsToday from './pages/HabitsToday';
import HabitsIndex from './pages/HabitsIndex';
import HabitDetail from './pages/HabitDetail';
import HabitsArchive from './pages/HabitsArchive';
import GoalsIndex from './pages/GoalsIndex';
import GoalsToday from './pages/GoalsToday';
import GoalDetailLong from './pages/GoalDetailLong';
import GoalDetailDaily from './pages/GoalDetailDaily';
import Whiteboards from './pages/Whiteboards';
import Whiteboard from './pages/Whiteboard';
import { RequireAuth } from './components/RequireAuth';
import Layout from './components/Layout';

function routeFromNativeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'com.prime.app:') return null;

    const isAuthCallback =
      parsed.host === 'auth' && parsed.pathname.startsWith('/callback');
    if (isAuthCallback) return null;

    const basePath =
      parsed.host.length > 0 ? `/${parsed.host}${parsed.pathname}` : parsed.pathname;
    if (!basePath.startsWith('/')) return null;
    return `${basePath}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function NativeDeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const navigateFromUrl = (url?: string | null) => {
      if (!url) return;
      const nextRoute = routeFromNativeUrl(url);
      if (!nextRoute) return;
      navigate(nextRoute);
    };

    let listener: PluginListenerHandle | undefined;

    CapacitorApp.addListener('appUrlOpen', ({ url }) => navigateFromUrl(url))
      .then((handle) => {
        listener = handle;
      })
      .catch((error) => {
        console.error('Failed to register widget deep link listener', error);
      });

    CapacitorApp.getLaunchUrl()
      .then((result) => navigateFromUrl(result?.url))
      .catch(() => undefined);

    return () => {
      listener?.remove().catch(() => undefined);
    };
  }, [navigate]);

  return null;
}

export default function App() {
  return (
    <>
      <NativeDeepLinkHandler />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route path="/timer" element={<Timer />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/pace" element={<ProjectsPace />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/habits/today" element={<HabitsToday />} />
          <Route path="/habits" element={<HabitsIndex />} />
          <Route path="/habits/archive" element={<HabitsArchive />} />
          <Route path="/habits/:habitId" element={<HabitDetail />} />
          <Route path="/goals" element={<GoalsIndex />} />
          <Route path="/goals/today" element={<GoalsToday />} />
          <Route path="/goals/long/:goalId" element={<GoalDetailLong />} />
          <Route path="/goals/daily/:goalId" element={<GoalDetailDaily />} />
          <Route path="/whiteboards" element={<Whiteboards />} />
          <Route path="/whiteboards/:boardId" element={<Whiteboard />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/timer" element={<Timer />} />
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </>
  );
}
