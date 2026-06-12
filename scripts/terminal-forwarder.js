/**
 * Terminal Forwarder — called by Claude Code Stop hook.
 * Writes terminal Claude's response to a shared outbox file.
 * When wechat-control mode is ON, the bridge picks it up and forwards to WeChat.
 *
 * Called by: Claude Code Stop hook in settings.json
 * Input via stdin: {"session_id": "...", "transcript_path": "...", ...}
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const OUTBOX = join(homedir(), '.wechat-claude-code', 'terminal-outbox.json');

async function main() {
  let event = {};
  try {
    const chunks = [];
    const stdinPromise = new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; resolve(''); } }, 500);
      process.stdin.on('data', (chunk) => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(chunk.toString()); }
      });
      process.stdin.on('end', () => { if (!settled) { settled = true; clearTimeout(timer); resolve(chunks.join('')); } });
    });
    const input = (await stdinPromise).trim();
    if (input) {
      try { event = JSON.parse(input); } catch {}
    }
  } catch {}

  // Only forward if we have meaningful content
  const timestamp = Date.now();
  const entry = {
    timestamp,
    event_type: 'stop',
    session_id: event.session_id || '',
    cwd: process.cwd(),
  };

  mkdirSync(join(homedir(), '.wechat-claude-code'), { recursive: true });
  writeFileSync(OUTBOX, JSON.stringify(entry, null, 2));
}

main();
