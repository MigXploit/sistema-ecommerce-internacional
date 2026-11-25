import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptsDir, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const jarPath = path.join(backendDir, 'target', 'ecommerce-internacional.jar');
const modo = process.argv[2] || 'demo'; // 'demo' o 'postgres'
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

if (!fs.existsSync(jarPath)) {
  console.log('==> Compilando backend Spring Boot por primera vez...');
  const mvnw = path.join(backendDir, isWin ? 'mvnw.cmd' : 'mvnw');
  const cmd = fs.existsSync(mvnw) ? mvnw : 'mvn';
  const res = spawnSync(cmd, ['-DskipTests', 'package'], {
    cwd: backendDir,
    stdio: 'inherit',
    shell: isWin
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

if (!fs.existsSync(path.join(frontendDir, 'node_modules'))) {
  console.log('==> Instalando dependencias del frontend React/TypeScript...');
  const res = spawnSync(npmCmd, ['install'], {
    cwd: frontendDir,
    stdio: 'inherit',
    shell: isWin
  });
  if (res.status !== 0) {
    process.exit(res.status ?? 1);
  }
}

const backendArgs = ['-jar', jarPath];
if (modo === 'demo') {
  backendArgs.push('--spring.profiles.active=demo');
}

console.log(`==> Iniciando Backend Spring Boot (modo: ${modo}) en http://localhost:8080 ...`);
const backend = spawn('java', backendArgs, {
  cwd: backendDir,
  stdio: 'inherit',
  shell: false
});

console.log('==> Iniciando Frontend React/TypeScript en http://localhost:5173 ...');
const frontend = spawn(npmCmd, ['run', 'dev'], {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: isWin
});

const finalizar = () => {
  backend.kill();
  frontend.kill();
  process.exit(0);
};

process.on('SIGINT', finalizar);
process.on('SIGTERM', finalizar);
