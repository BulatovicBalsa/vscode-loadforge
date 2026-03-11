import * as esbuild from 'esbuild';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const watchMode = process.argv.includes('--watch');

async function runTsc() {
  await new Promise((resolvePromise, rejectPromise) => {
    const command = spawn(
      process.execPath,
      [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(root, 'tsconfig.test.json')],
      {
        cwd: root,
        stdio: 'inherit'
      }
    );

    command.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`tsc exited with code ${code ?? 'unknown'}`));
    });
    command.on('error', rejectPromise);
  });
}

async function buildOnce() {
  await rm(resolve(root, 'out'), { recursive: true, force: true });
  await esbuild.build({
    entryPoints: [resolve(root, 'src/extension.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    outfile: resolve(root, 'out/extension.js'),
    external: ['vscode'],
    sourcemap: true,
    logLevel: 'info'
  });
  await runTsc();
}

if (watchMode) {
  const ctx = await esbuild.context({
    entryPoints: [resolve(root, 'src/extension.ts')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    outfile: resolve(root, 'out/extension.js'),
    external: ['vscode'],
    sourcemap: true,
    logLevel: 'info'
  });

  await rm(resolve(root, 'out'), { recursive: true, force: true });
  await ctx.watch();
  await runTsc();
  process.stdin.resume();
} else {
  await buildOnce();
}
