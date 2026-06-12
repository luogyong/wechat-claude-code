#!/usr/bin/env node
/**
 * wechat-permission-bridge.mjs — Claude Code preToolUse hook for WeChat takeover
 *
 * When remote control is ON (flag exists), this script:
 * 1. Receives tool use event from Claude Code via stdin JSON
 * 2. Writes permission request to a queue file
 * 3. Polls for WeChat user response (up to 55s of hook's 60s timeout)
 * 4. Returns exit code 0 (allow) or 2 (block)
 *
 * When remote control is OFF, passes through immediately (exit 0).
 *
 * Usage: Configure in ~/.claude/settings.json under hooks.PreToolUse
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DATA_DIR = join(homedir(), '.wechat-claude-code');
const FLAG = join(DATA_DIR, 'wechat-control.flag');
const QUEUE_DIR = join(DATA_DIR, 'permission-queue');
const RESP_DIR = join(DATA_DIR, 'permission-responses');

const POLL_INTERVAL = 1000; // 1 second
const MAX_WAIT = 55000;     // 55 seconds (hook timeout is 60s)

// -- Main --

async function main() {
  // Pass through if remote control is OFF
  if (!existsSync(FLAG)) {
    process.exit(0);
  }

  // Read stdin — Claude Code sends the tool event as JSON
  let input = '';
  process.stdin.setEncoding('utf-8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let event;
  try {
    event = JSON.parse(input);
  } catch {
    // Can't parse, allow through
    process.exit(0);
  }

  const toolName = event.tool_name || 'unknown';
  const toolInput = event.tool_input || {};

  // Generate a unique request ID
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const queueFile = join(QUEUE_DIR, `${requestId}.json`);
  const respFile = join(RESP_DIR, `${requestId}.json`);

  // Ensure directories exist
  mkdirSync(QUEUE_DIR, { recursive: true });
  mkdirSync(RESP_DIR, { recursive: true });

  // Write permission request
  const request = {
    id: requestId,
    timestamp: new Date().toISOString(),
    tool_name: toolName,
    tool_input: toolInput,
  };
  writeFileSync(queueFile, JSON.stringify(request, null, 2));

  // Poll for response
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_WAIT) {
    if (existsSync(respFile)) {
      try {
        const response = JSON.parse(readFileSync(respFile, 'utf-8'));
        // Clean up
        try { unlinkSync(queueFile); } catch {}
        try { unlinkSync(respFile); } catch {}

        if (response.approved) {
          process.exit(0);
        } else {
          console.error(`[WeChat] 权限被拒绝: ${response.reason || '用户拒绝'}`);
          process.exit(2);
        }
      } catch {
        // Response file corrupted, wait and retry
      }
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }

  // Timeout — clean up and allow through (auto-approve)
  try { unlinkSync(queueFile); } catch {}
  try { unlinkSync(respFile); } catch {}

  console.error(`[WeChat] 审批超时(55s)，已自动通过`);
  process.exit(0);
}

main().catch(err => {
  console.error(`[WeChat Permission Bridge] Error: ${err.message}`);
  process.exit(0); // Allow on error
});
