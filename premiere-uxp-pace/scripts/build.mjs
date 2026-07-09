import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');

/** UXP's JS engine is older than modern Chromium — downlevel aggressively. */
const buildOptions = {
  entryPoints: [join(root, 'src/main.js')],
  outfile: join(dist, 'main.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2017'],
  external: ['uxp'],
  sourcemap: true,
  logLevel: 'info',
};

function loadEnv() {
  const env = {
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
  };

  const candidates = [
    join(root, '.env'),
    join(root, '.env.local'),
    join(root, '..', '.env.local'),
    join(root, '..', '.env'),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key === 'VITE_SUPABASE_URL' || key === 'SUPABASE_URL') {
        env.SUPABASE_URL = value;
      }
      if (key === 'VITE_SUPABASE_ANON_KEY' || key === 'SUPABASE_ANON_KEY') {
        env.SUPABASE_ANON_KEY = value;
      }
    }
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new Error(
      'Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in ../.env.local (or premiere-uxp-pace/.env.local).',
    );
  }

  return env;
}

function copyStatic() {
  mkdirSync(dist, { recursive: true });
  cpSync(join(root, 'index.html'), join(dist, 'index.html'));
  cpSync(join(root, 'styles.css'), join(dist, 'styles.css'));
  cpSync(join(root, 'icons'), join(dist, 'icons'), { recursive: true });

  const env = loadEnv();
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const host = new URL(env.SUPABASE_URL).origin;
  manifest.requiredPermissions = manifest.requiredPermissions || {};
  manifest.requiredPermissions.network = {
    domains: [host],
  };
  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return env;
}

function withDefines(env) {
  return {
    ...buildOptions,
    define: {
      __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL),
      __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY),
    },
  };
}

async function buildOnce() {
  const env = copyStatic();
  await esbuild.build(withDefines(env));
  console.log('Built premiere-uxp-pace → dist/');
}

if (watch) {
  const env = copyStatic();
  const ctx = await esbuild.context({
    ...withDefines(env),
    plugins: [
      {
        name: 'copy-static-on-rebuild',
        setup(build) {
          build.onEnd((result) => {
            if (result.errors.length) return;
            copyStatic();
            console.log('Rebuilt premiere-uxp-pace → dist/');
          });
        },
      },
    ],
  });
  await ctx.watch();
  console.log('Watching premiere-uxp-pace…');
} else {
  await buildOnce();
}
