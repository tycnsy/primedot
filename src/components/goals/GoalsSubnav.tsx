import { NavLink } from 'react-router-dom';

export default function GoalsSubnav() {
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface2/70 p-1">
      <NavLink
        to="/goals"
        end
        className={({ isActive }) =>
          `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            isActive ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
          }`
        }
      >
        All goals
      </NavLink>
      <NavLink
        to="/goals/today"
        className={({ isActive }) =>
          `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            isActive ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'
          }`
        }
      >
        Today
      </NavLink>
    </div>
  );
}
