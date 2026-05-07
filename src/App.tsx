import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Timer from './pages/Timer';
import Templates from './pages/Templates';
import HabitsToday from './pages/HabitsToday';
import HabitsIndex from './pages/HabitsIndex';
import HabitDetail from './pages/HabitDetail';
import HabitsArchive from './pages/HabitsArchive';
import { RequireAuth } from './components/RequireAuth';
import Layout from './components/Layout';

export default function App() {
  return (
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
        <Route path="/templates" element={<Templates />} />
        <Route path="/habits/today" element={<HabitsToday />} />
        <Route path="/habits" element={<HabitsIndex />} />
        <Route path="/habits/archive" element={<HabitsArchive />} />
        <Route path="/habits/:habitId" element={<HabitDetail />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/projects/:id/timer" element={<Timer />} />
      </Route>
      <Route path="*" element={<Navigate to="/projects" replace />} />
    </Routes>
  );
}
