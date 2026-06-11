#!/usr/bin/env node
/*
 * OpenRig full-stack launcher (Linux / macOS / Windows).
 *
 * One command:
 *   1. Installs Docker if missing (Homebrew on macOS, get.docker.com on Linux, winget on Windows)
 *   2. Starts the Docker daemon and waits for it to be ready
 *   3. Installs npm dependencies if node_modules is missing
 *   4. Starts the local Supabase stack (npx supabase start — pulls images on first run)
 *   5. Starts the API (with its normal Supabase bootstrap) and the Vite front together
 */
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

const log = (msg) => console.log(`\x1b[36m[openrig]\x1b[0m ${msg}`);
const warn = (msg) => console.warn(`\x1b[33m[openrig]\x1b[0m ${msg}`);
const fail = (msg) => {
  console.error(`\x1b[31m[openrig]\x1b[0m ${msg}`);
  process.exit(1);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs a command, streaming output to the terminal. Resolves with the exit code.
const run = (command, args, { cwd = PROJECT_ROOT, env = process.env } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: IS_WIN });
  child.on('error', reject);
  child.on('exit', (code) => resolve(code ?? 1));
});

// Runs a command, streaming output to the terminal while also capturing it.
const runCapture = (command, args, { cwd = PROJECT_ROOT } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, stdio: ['inherit', 'pipe', 'pipe'], shell: IS_WIN });
  let output = '';
  const tee = (stream, target) => stream.on('data', (chunk) => {
    output += chunk.toString();
    target.write(chunk);
  });
  tee(child.stdout, process.stdout);
  tee(child.stderr, process.stderr);
  child.on('error', reject);
  child.on('exit', (code) => resolve({ code: code ?? 1, output }));
});

// Runs a command silently and returns { code, output }.
const runQuiet = (command, args, { cwd = PROJECT_ROOT } = {}) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf-8', shell: IS_WIN });
  return {
    code: result.status ?? 1,
    output: `${result.stdout || ''}\n${result.stderr || ''}`,
  };
};

const commandExists = (command) => {
  const probe = IS_WIN ? runQuiet('where', [command]) : runQuiet('which', [command]);
  return probe.code === 0;
};

const dockerDaemonReady = () => runQuiet('docker', ['info']).code === 0;

const installDocker = async () => {
  log('Docker introuvable, installation automatique…');

  if (IS_MAC) {
    if (!commandExists('brew')) {
      fail('Homebrew est requis pour installer Docker automatiquement sur macOS.\n'
        + '  Installez Homebrew : /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\n'
        + '  Ou installez Docker Desktop manuellement : https://www.docker.com/products/docker-desktop/');
    }
    const code = await run('brew', ['install', '--cask', 'docker']);
    if (code !== 0) fail('Échec de l\'installation de Docker via Homebrew.');
    return;
  }

  if (IS_LINUX) {
    log('Installation via le script officiel get.docker.com (sudo requis)…');
    const dl = await run('sh', ['-c', 'curl -fsSL https://get.docker.com -o /tmp/openrig-get-docker.sh']);
    if (dl !== 0) fail('Impossible de télécharger le script d\'installation Docker.');
    const code = await run('sudo', ['sh', '/tmp/openrig-get-docker.sh']);
    if (code !== 0) fail('Échec de l\'installation de Docker.');
    await run('sudo', ['usermod', '-aG', 'docker', process.env.USER || 'root']);
    warn('Votre utilisateur a été ajouté au groupe "docker". Si les commandes docker échouent, déconnectez/reconnectez votre session puis relancez cette commande.');
    return;
  }

  if (IS_WIN) {
    if (!commandExists('winget')) {
      fail('winget est requis pour installer Docker automatiquement sur Windows.\n'
        + '  Installez Docker Desktop manuellement : https://www.docker.com/products/docker-desktop/');
    }
    const code = await run('winget', ['install', '-e', '--id', 'Docker.DockerDesktop', '--accept-source-agreements', '--accept-package-agreements']);
    if (code !== 0) fail('Échec de l\'installation de Docker Desktop via winget.');
    warn('Docker Desktop vient d\'être installé. Un redémarrage de la session Windows peut être nécessaire (WSL2).');
    return;
  }

  fail(`Plateforme non prise en charge : ${process.platform}`);
};

const startDockerDaemon = async () => {
  if (IS_MAC) {
    const opened = runQuiet('open', ['-a', 'Docker']);
    if (opened.code !== 0 && commandExists('colima')) {
      log('Docker Desktop introuvable, démarrage via colima…');
      await run('colima', ['start']);
    }
    return;
  }

  if (IS_LINUX) {
    if (commandExists('systemctl')) {
      const active = runQuiet('systemctl', ['is-active', 'docker']);
      if (active.code !== 0) {
        log('Démarrage du service docker (sudo requis)…');
        await run('sudo', ['systemctl', 'start', 'docker']);
      }
    } else {
      await run('sudo', ['service', 'docker', 'start']);
    }
    return;
  }

  if (IS_WIN) {
    const candidates = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Docker', 'Docker Desktop.exe'),
    ];
    const exe = candidates.find((p) => p && fs.existsSync(p));
    if (exe) {
      spawn('cmd', ['/c', 'start', '""', exe], { stdio: 'ignore', detached: true, shell: false }).unref();
    } else {
      runQuiet('cmd', ['/c', 'start', '""', 'Docker Desktop']);
    }
  }
};

const waitForDocker = async ({ timeoutMs = 5 * 60 * 1000 } = {}) => {
  const startedAt = Date.now();
  let notified = false;
  while (Date.now() - startedAt < timeoutMs) {
    if (dockerDaemonReady()) return true;
    if (!notified) {
      log('En attente du démarrage du démon Docker… (jusqu\'à 5 min au premier lancement)');
      notified = true;
    }
    await sleep(3000);
  }
  return false;
};

const ensureDocker = async () => {
  if (!commandExists('docker')) {
    await installDocker();
    if (!commandExists('docker')) {
      fail('Docker installé mais la commande "docker" reste introuvable. Ouvrez un nouveau terminal puis relancez cette commande.');
    }
  }

  if (dockerDaemonReady()) {
    log('Docker est opérationnel.');
    return;
  }

  log('Démarrage du démon Docker…');
  await startDockerDaemon();
  const ready = await waitForDocker();
  if (!ready) {
    if (IS_LINUX && runQuiet('sudo', ['docker', 'info']).code === 0) {
      fail('Le démon Docker tourne mais votre utilisateur n\'a pas encore accès au groupe "docker".\n'
        + '  Déconnectez/reconnectez votre session (ou exécutez "newgrp docker") puis relancez cette commande.');
    }
    fail('Le démon Docker n\'a pas démarré à temps. Lancez Docker manuellement puis relancez cette commande.');
  }
  log('Docker est opérationnel.');
};

const ensureNodeModules = async () => {
  if (fs.existsSync(path.join(PROJECT_ROOT, 'node_modules', '.bin'))) return;
  log('Installation des dépendances npm (--legacy-peer-deps)…');
  const code = await run('npm', ['install', '--legacy-peer-deps']);
  if (code !== 0) fail('Échec de npm install.');
};

const waitForSupabaseReady = async ({ timeoutMs = 3 * 60 * 1000 } = {}) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (runQuiet('npx', ['supabase', 'status']).code === 0) return true;
    await sleep(5000);
  }
  return false;
};

const startSupabase = async () => {
  log('Démarrage de la stack Supabase locale (téléchargement des images Docker au premier lancement)…');
  const { code, output } = await runCapture('npx', ['supabase', 'start']);
  if (code !== 0) {
    // "supabase start" exits non-zero when the stack is already running — including
    // right after Docker boots, while the old containers are still restarting.
    if (!output.toLowerCase().includes('already running')) {
      fail('Échec du démarrage de Supabase. Consultez les logs ci-dessus.');
    }
    log('La stack Supabase est déjà lancée, attente de sa disponibilité…');
    const ready = await waitForSupabaseReady();
    if (!ready) {
      fail('La stack Supabase ne répond pas. Essayez "npx supabase stop" puis relancez cette commande.');
    }
  }
  log('Supabase est démarré.');
};

const startApp = async () => {
  log('Démarrage de l\'API puis du front…');
  const child = spawn('npx', [
    'concurrently', '-k',
    '-n', 'api,front',
    '-c', 'blue,green',
    'npm:server',
    'npm:dev',
  ], { cwd: PROJECT_ROOT, stdio: 'inherit', shell: IS_WIN });

  const forward = (signal) => {
    try { child.kill(signal); } catch { /* already gone */ }
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));

  child.on('exit', (code) => process.exit(code ?? 0));
};

const main = async () => {
  log('OpenRig — démarrage complet (Docker + Supabase + API + Front)');
  await ensureDocker();
  await ensureNodeModules();
  await startSupabase();
  await startApp();
};

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});
