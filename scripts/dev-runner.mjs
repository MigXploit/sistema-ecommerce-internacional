import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptsDir, '..');
const backendDir = path.join(rootDir, 'backend');
const frontendDir = path.join(rootDir, 'frontend');
const jarPath = path.join(backendDir, 'target', 'ecommerce-internacional.jar');
const modo = (process.argv[2] || 'demo').toLowerCase(); // 'demo' (autónomo H2-PostgreSQL) o 'postgres' (PostgreSQL 18)
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

console.log('============================================================================');
console.log(' SISTEMA DE COMERCIO ELECTRÓNICO INTERNACIONAL (INF-241 - GRUPO 12)');
console.log(` Modo de Base de Datos: ${modo === 'postgres' ? 'PostgreSQL 18 (db_ecommerce_internacional)' : 'Prototipo Autónomo en Memoria (14 Tablas 3FN + Semilla D13)'}`);
console.log('============================================================================');

if (!fs.existsSync(jarPath)) {
  console.log('==> Empaquetando backend Spring Boot (ecommerce-internacional.jar)...');
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

console.log('==> Iniciando Backend Spring Boot en http://localhost:8080 ...');
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

let cerrando = false;
const finalizar = () => {
  if (cerrando) return;
  cerrando = true;
  try { backend.kill(); } catch {}
  try { frontend.kill(); } catch {}
  process.exit(0);
};

process.on('SIGINT', finalizar);
process.on('SIGTERM', finalizar);
backend.on('exit', (code) => {
  if (!cerrando && code !== 0) {
    console.error(`[!] El backend terminó con código ${code}. Verifique si el puerto 8080 ya está en uso.`);
  }
});
