/**
 * Permission Broker — bridges terminal Claude Code permission requests to WeChat.
 *
 * Called by Claude Code's PreToolUse hook. Receives { tool_name, tool_input }
 * on stdin, writes a permission request to a shared directory monitored by the
 * wechat-claude-code bridge, then polls for a response (from WeChat).
 *
 * Exit codes: 0 = approved/fallthrough, 1 = explicitly denied
 *
 * Flow:
 *   1. Writes req-{uuid}.json to ~/.wechat-claude-code/permission-broker/
 *   2. Bridge picks it up, forwards to WeChat
 *   3. Polls for resp-{uuid}.json
 *   4. Timeout (8s) → exit 0 (fall through to Claude Code normal prompt)
 *   5. Approved → exit 0
 *   6. Denied → exit 1 (block tool)
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const BROKER_DIR = join(homedir(), '.wechat-claude-code', 'permission-broker');
const APPROVAL_FLAG = join(homedir(), '.wechat-claude-code', 'approval-mode');
const TIMEOUT_MS = (() => {
  // 1. Env var override (highest priority)
  if (process.env.PERMISSION_BROKER_TIMEOUT) {
    return parseInt(process.env.PERMISSION_BROKER_TIMEOUT, 10);
  }
  // 2. Approval mode flag file (touched via WeChat /approve command)
  if (existsSync(APPROVAL_FLAG)) {
    return 30_000; // 30 seconds when approval mode is active
  }
  // 3. Default: notify only, don't wait
  return 0;
})();
const POLL_INTERVAL_MS = 200;

async function main() {
  let toolName = '';
  let toolInput = '';

  // Read hook input from stdin (Claude Code PreToolUse hook passes JSON)
  try {
    const chunks = [];
    // Read stdin with a short timeout — if no data within 500ms, no hook input
    const stdinPromise = new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; resolve(''); }
      }, 500);
      process.stdin.on('data', (chunk) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(chunk.toString()); }
      });
      process.stdin.on('end', () => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(chunks.join('')); }
      });
    });

    const input = (await stdinPromise).trim();
    if (input) {
      try {
        const parsed = JSON.parse(input);
        toolName = parsed.tool_name || '';
        toolInput = typeof parsed.tool_input === 'string'
          ? parsed.tool_input
          : JSON.stringify(parsed.tool_input || '');
      } catch {
        // Not JSON — ignore
      }
    }
  } catch {
    // No stdin available — use argv fallback
  }

  // Fallback: command-line args
  if (!toolName) {
    toolName = process.argv[2] || '';
    toolInput = process.argv[3] || '';
  }

  if (!toolName) {
    // No tool name — allow
    process.exit(0);
  }

  mkdirSync(BROKER_DIR, { recursive: true });

  const id = randomUUID();
  const reqFile = join(BROKER_DIR, `req-${id}.json`);
  const respFile = join(BROKER_DIR, `resp-${id}.json`);

  // Write request
  const request = {
    id,
    toolName,
    input: toolInput.slice(0, 1000),
    timestamp: Date.now(),
    cwd: process.cwd(),
  };
  writeFileSync(reqFile, JSON.stringify(request));

  // Poll for response with timeout
  const startTime = Date.now();
  let approved = false;
  let responded = false;

  while (Date.now() - startTime < TIMEOUT_MS) {
    if (existsSync(respFile)) {
      try {
        const resp = JSON.parse(readFileSync(respFile, 'utf-8'));
        approved = resp.allowed === true;
        responded = true;
      } catch {
        // Invalid JSON — keep waiting
      }
      break;
    }
    // Spin-wait with micro-pauses
    const waitUntil = Date.now() + POLL_INTERVAL_MS;
    while (Date.now() < waitUntil) { /* spin */ }
  }

  // Cleanup
  try { unlinkSync(reqFile); } catch {}
  try { unlinkSync(respFile); } catch {}

  if (!responded) {
    // Timeout — fall through to Claude Code's normal permission prompt
    process.exit(0);
  }

  process.exit(approved ? 0 : 1);
}

main();
