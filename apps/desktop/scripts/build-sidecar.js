#!/usr/bin/env node
/**
 * Build OpenClaw as standalone binaries for Tauri sidecar
 * 
 * References:
 * - Tauri sidecar: https://v2.tauri.app/develop/sidecar/
 * - pkg: https://github.com/vercel/pkg (archived but functional)
 * - nexe: https://github.com/nexe/nexe (alternative)
 * 
 * Run: pnpm build:sidecar (from apps/desktop directory)
 */

import { exec } from 'node:child_process';
import { mkdir, chmod, access, constants } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Target triples must match Tauri's expectations
// See: https://v2.tauri.app/develop/sidecar/
const TARGETS = [
  { pkg: 'node18-macos-x64', tauri: 'x86_64-apple-darwin', ext: '' },
  { pkg: 'node18-macos-arm64', tauri: 'aarch64-apple-darwin', ext: '' },
  { pkg: 'node18-linux-x64', tauri: 'x86_64-unknown-linux-gnu', ext: '' },
  { pkg: 'node18-win-x64', tauri: 'x86_64-pc-windows-msvc', ext: '.exe' },
];

async function findOpenclaw() {
  // Check if openclaw is installed globally
  try {
    const { stdout } = await execAsync('npm root -g');
    const openclawPath = join(stdout.trim(), 'openclaw');
    await access(openclawPath, constants.R_OK);
    return openclawPath;
  } catch {
    return null;
  }
}

async function installOpenclaw() {
  console.log('Installing OpenClaw globally...');
  try {
    await execAsync('npm install -g openclaw');
    console.log('  ✓ OpenClaw installed\n');
    return await findOpenclaw();
  } catch (err) {
    throw new Error(
      `Failed to install OpenClaw: ${err.message}\n` +
      'Try manually: npm install -g openclaw\n' +
      'See: https://docs.clawd.bot/install'
    );
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   OpenClaw Sidecar Builder             ║');
  console.log('╚════════════════════════════════════════╝\n');

  const binDir = join(ROOT, 'src-tauri', 'binaries');
  await mkdir(binDir, { recursive: true });

  // Find or install OpenClaw
  let openclawPath = await findOpenclaw();
  if (!openclawPath) {
    openclawPath = await installOpenclaw();
  }
  
  if (!openclawPath) {
    throw new Error(
      'OpenClaw not found after install.\n' +
      'Install manually with: npm install -g openclaw'
    );
  }
  
  console.log(`Found OpenClaw at: ${openclawPath}\n`);

  // Determine current platform for priority build
  const { stdout: hostTriple } = await execAsync('rustc --print host-tuple').catch(() => ({ stdout: '' }));
  const currentPlatform = hostTriple.trim();
  console.log(`Current platform: ${currentPlatform || 'unknown'}\n`);

  let successCount = 0;
  let failCount = 0;

  // Build for current platform first (most likely to succeed)
  const sortedTargets = [...TARGETS].sort((a, b) => {
    if (a.tauri === currentPlatform) return -1;
    if (b.tauri === currentPlatform) return 1;
    return 0;
  });

  for (const target of sortedTargets) {
    const outputName = `openclaw-${target.tauri}${target.ext}`;
    const outputPath = join(binDir, outputName);
    const isCurrentPlatform = target.tauri === currentPlatform;

    console.log(`Building ${target.tauri}${isCurrentPlatform ? ' (current)' : ''}...`);

    try {
      // Using pkg - archives but works well
      // If you prefer nexe, change to:
      // await execAsync(`npx nexe "${openclawPath}" -t ${target.pkg.replace('node18', 'macos-x64')} -o "${outputPath}"`);
      await execAsync(
        `npx pkg "${openclawPath}" --target ${target.pkg} --output "${outputPath}"`,
        { timeout: 300000 } // 5 minute timeout
      );

      // Make executable on Unix (required for Tauri to run it)
      if (!target.ext) {
        await chmod(outputPath, 0o755);
      }

      console.log(`  ✓ ${outputName}\n`);
      successCount++;
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message?.split('\n')[0] || 'Unknown error'}\n`);
      failCount++;
      
      // If current platform fails, that's a problem
      if (isCurrentPlatform) {
        console.error('  ⚠ Current platform build failed - this will prevent local testing\n');
      }
    }
  }

  console.log('────────────────────────────────────────');
  console.log(`Built: ${successCount}/${TARGETS.length}`);
  
  if (failCount > 0) {
    console.log(`\nNote: Cross-compilation may fail for non-current platforms.`);
    console.log(`Build on each target platform for production releases.`);
  }

  console.log(`\nBinaries saved to: ${binDir}`);
  
  if (successCount > 0) {
    console.log('\nNext steps:');
    console.log('  1. pnpm tauri dev   # Test locally');
    console.log('  2. pnpm tauri build # Build release');
  }
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
