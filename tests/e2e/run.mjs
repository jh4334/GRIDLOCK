// E2E 러너 — preview 서버를 띄우고 스모크를 실행한 뒤 서버를 정리한다.
// package.json의 test:e2e 셸 한 줄을 깔끔하게 유지하려고 러너로 감쌌다(포트 충돌·정리 처리).
//
// 흐름: 4173 포트가 이미 응답하면 그 서버를 재사용(안 죽임). 아니면 vite preview를 직접 띄워
// 준비될 때까지 기다린 뒤 스모크를 돌리고, 우리가 띄운 서버만 종료한다. 스모크의 종료 코드를
// 그대로 전파해 CI/로컬에서 실패를 감지할 수 있게 한다.

import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://localhost:${PORT}/`;

function ping(url) {
  return new Promise((resolve) => {
    const req = get(url, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await ping(url)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, opts);
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  let server = null;

  const alreadyUp = await ping(BASE_URL);
  if (alreadyUp) {
    process.stdout.write(`[run] 기존 서버 재사용: ${BASE_URL}\n`);
  } else {
    process.stdout.write(`[run] preview 서버 기동: ${BASE_URL}\n`);
    server = spawn(npmCmd, ['run', 'preview', '--', '--port', String(PORT), '--strictPort'], {
      cwd: join(HERE, '..', '..'),
      stdio: 'inherit',
      detached: true, // 프로세스 그룹으로 묶어 자식(esbuild 등)까지 한번에 정리.
    });
    const ok = await waitForServer(BASE_URL);
    if (!ok) {
      stop(server);
      process.stderr.write('[run] preview 서버가 시간 내 준비되지 않음\n');
      process.exit(1);
    }
  }

  // 스모크(회귀) → 난이도 데모 순으로 실행. 하나라도 실패하면 그 코드를 전파하고 나머지는 건너뛴다.
  let code = 1;
  try {
    for (const suite of ['smoke.mjs', 'difficulty-demo.mjs', 'endless-demo.mjs', 'map-demo.mjs', 'maps-all-demo.mjs', 'migration-demo.mjs', 'conquest-maps-demo.mjs']) {
      code = await run(process.execPath, [join(HERE, suite)], {
        stdio: 'inherit',
        env: { ...process.env, BASE_URL },
      });
      if (code !== 0) break;
    }
  } finally {
    stop(server);
  }
  process.exit(code);
}

function stop(server) {
  if (!server || server.killed) return;
  try {
    process.kill(-server.pid, 'SIGTERM'); // 그룹 종료(detached라 -pid).
  } catch {
    try {
      server.kill('SIGTERM');
    } catch {
      /* 이미 종료됨 */
    }
  }
}

main().catch((err) => {
  process.stderr.write(`[run] ${err.message}\n`);
  process.exit(1);
});
