import { useEffect, useMemo, useState } from 'react';

export type GoalsDensity = 'cozy' | 'comfortable' | 'compact';
export type GoalsIndexLayout = 'grid' | 'list';

interface GoalsPreferences {
  density: GoalsDensity;
  setDensity: (density: GoalsDensity) => void;
  indexLayout: GoalsIndexLayout;
  setIndexLayout: (layout: GoalsIndexLayout) => void;
  showPaceLine: boolean;
  setShowPaceLine: (show: boolean) => void;
}

const DENSITY_KEY = 'prime:goals:density';
const INDEX_LAYOUT_KEY = 'prime:goals:index-layout';
const SHOW_PACE_KEY = 'prime:goals:show-pace-line';

function readStorage<T extends string>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return (value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function readBooleanStorage(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    if (value == null) return fallback;
    return value === 'true';
  } catch {
    return fallback;
  }
}

export function useGoalsPreferences(): GoalsPreferences {
  const [density, setDensity] = useState<GoalsDensity>(() =>
    readStorage<GoalsDensity>(DENSITY_KEY, 'comfortable'),
  );
  const [indexLayout, setIndexLayout] = useState<GoalsIndexLayout>(() =>
    readStorage<GoalsIndexLayout>(INDEX_LAYOUT_KEY, 'grid'),
  );
  const [showPaceLine, setShowPaceLine] = useState<boolean>(() =>
    readBooleanStorage(SHOW_PACE_KEY, true),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(DENSITY_KEY, density);
    } catch {
      // ignore storage write failures
    }
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  useEffect(() => {
    try {
      window.localStorage.setItem(INDEX_LAYOUT_KEY, indexLayout);
    } catch {
      // ignore storage write failures
    }
  }, [indexLayout]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_PACE_KEY, String(showPaceLine));
    } catch {
      // ignore storage write failures
    }
  }, [showPaceLine]);

  return useMemo(
    () => ({
      density,
      setDensity,
      indexLayout,
      setIndexLayout,
      showPaceLine,
      setShowPaceLine,
    }),
    [density, indexLayout, showPaceLine],
  );
}
