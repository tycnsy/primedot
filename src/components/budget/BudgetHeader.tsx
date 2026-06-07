import { Link } from 'react-router-dom';
import BudgetSubnav from './BudgetSubnav';

interface BudgetHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export default function BudgetHeader({ title, subtitle, actions }: BudgetHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-fg"
          >
            <span aria-hidden>←</span> Home
          </Link>
          <p className="label tracking-[0.08em]">MONEY</p>
          <h1 className="text-3xl font-semibold tracking-tight text-fg">{title}</h1>
          {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <BudgetSubnav />
    </div>
  );
}
