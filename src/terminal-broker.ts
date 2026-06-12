/**
 * terminal-broker.ts — Bridges terminal Claude Code permission requests to WeChat.
 *
 * Watches ~/.wechat-claude-code/permission-broker/ for req-*.json files
 * written by the terminal-side permission-broker.js PreToolUse hook.
 *
 * When a new request appears:
 * 1. Reads the request
 * 2. Sends a permission prompt to the WeChat user
 * 3. Waits for user response (y/n)
 * 4. Writes resp-{id}.json with the decision
 *
 * The terminal hook polls for this response and allows/blocks accordingly.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from './logger.js';

const BROKER_DIR = join(homedir(), '.wechat-claude-code', 'permission-broker');

type Sender = {
  sendText: (userId: string, contextToken: string, text: string) => Promise<void>;
};

type BrokerCallbacks = {
  /** Called when a terminal permission request needs WeChat user input */
  onTerminalPermission: (req: TerminalPermissionRequest) => Promise<boolean>;
};

interface TerminalPermissionRequest {
  id: string;
  toolName: string;
  input: string;
  timestamp: number;
  cwd: string;
}

/**
 * Start watching the permission-broker directory for terminal requests.
 * Simple polling-based approach (fs.watch is unreliable on Windows network drives).
 */
export function startTerminalBroker(
  sender: Sender,
  userId: string,
  contextToken: () => string,
): { stop: () => void } {
  mkdirSync(BROKER_DIR, { recursive: true });

  const seen = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;

  async function poll() {
    try {
      const files = readdirSync(BROKER_DIR).filter((f: string) => f.startsWith('req-') && f.endsWith('.json'));

      for (const file of files) {
        if (seen.has(file)) continue;
        seen.add(file);

        const reqPath = join(BROKER_DIR, file);
        const respFile = file.replace('req-', 'resp-');
        const respPath = join(BROKER_DIR, respFile);

        // Skip if response already written
        if (existsSync(respPath)) {
          try { unlinkSync(reqPath); } catch {}
          continue;
        }

        let req: TerminalPermissionRequest;
        try {
          req = JSON.parse(readFileSync(reqPath, 'utf-8'));
        } catch {
          // Corrupted or still writing — skip
          continue;
        }

        // Skip stale requests (>60s old)
        if (Date.now() - req.timestamp > 60_000) {
          const timeoutResp = { id: req.id, allowed: true, reason: 'timeout' };
          writeFileSync(respPath, JSON.stringify(timeoutResp));
          try { unlinkSync(reqPath); } catch {}
          continue;
        }

        // Skip internal wechat-control commands (on/off/status scripts)
        if (req.toolName === 'Bash') {
          const input = typeof req.input === 'string' ? req.input : JSON.stringify(req.input);
          if (input.includes('wechat-control.mjs') || input.includes('wechat-claude-code/scripts')) {
            writeFileSync(respPath, JSON.stringify({ id: req.id, allowed: true, reason: 'internal_command' }));
            try { unlinkSync(reqPath); } catch {}
            continue;
          }
        }

        logger.info('Terminal permission request', { tool: req.toolName, id: req.id });

        // Forward to WeChat
        const permMsg = [
          '🔐 终端权限请求',
          '',
          `工具: ${req.toolName}`,
          `参数: ${req.input.slice(0, 300)}`,
          `目录: ${req.cwd}`,
          '',
          '回复 y 批准，n 拒绝（30秒超时自动批准）',
        ].join('\n');

        try {
          await sender.sendText(userId, contextToken(), permMsg);
        } catch (err) {
          logger.warn('Failed to send terminal permission to WeChat', { error: String(err) });
          // Auto-approve if we can't reach WeChat
          writeFileSync(respPath, JSON.stringify({ id: req.id, allowed: true, reason: 'send_failed' }));
          try { unlinkSync(reqPath); } catch {}
          continue;
        }

        // Wait 30 seconds for user response, then timeout → approve
        const timeout = setTimeout(() => {
          if (!existsSync(respPath)) {
            writeFileSync(respPath, JSON.stringify({ id: req.id, allowed: true, reason: 'timeout' }));
            try { unlinkSync(reqPath); } catch {}
            sender.sendText(userId, contextToken(), '⏰ 权限请求超时，已自动批准。').catch(() => {});
          }
        }, 30_000);

        // Store timeout for cleanup
        (timeout as any).__respPath = respPath;
        (timeout as any).__reqPath = reqPath;
      }

      // Cleanup seen set (remove entries for files that no longer exist)
      for (const file of [...seen]) {
        if (!existsSync(join(BROKER_DIR, file))) {
          seen.delete(file);
        }
      }
    } catch (err) {
      logger.warn('Terminal broker poll error', { error: String(err) });
    }
  }

  timer = setInterval(poll, 1500); // Poll every 1.5s
  poll(); // Initial scan

  return {
    stop: () => {
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
}

/**
 * Handle y/n responses from WeChat for terminal permission requests.
 * Returns true if the response was a terminal permission response.
 */
export function handleTerminalPermissionResponse(userText: string): boolean {
  const lower = userText.toLowerCase().trim();

  // Only handle y/n when there are pending requests
  try {
    const files = readdirSync(BROKER_DIR).filter((f: string) => f.startsWith('req-') && f.endsWith('.json'));

    if (files.length === 0) return false;

    if (lower === 'y' || lower === 'yes') {
      for (const file of files) {
        const respFile = file.replace('req-', 'resp-');
        const respPath = join(BROKER_DIR, respFile);
        const reqPath = join(BROKER_DIR, file);
        try {
          const req = JSON.parse(readFileSync(reqPath, 'utf-8'));
          writeFileSync(respPath, JSON.stringify({ id: req.id, allowed: true }));
          unlinkSync(reqPath);
        } catch {}
      }
      return true;
    }

    if (lower === 'n' || lower === 'no') {
      for (const file of files) {
        const respFile = file.replace('req-', 'resp-');
        const respPath = join(BROKER_DIR, respFile);
        const reqPath = join(BROKER_DIR, file);
        try {
          const req = JSON.parse(readFileSync(reqPath, 'utf-8'));
          writeFileSync(respPath, JSON.stringify({ id: req.id, allowed: false, reason: 'user_denied' }));
          unlinkSync(reqPath);
        } catch {}
      }
      return true;
    }
  } catch {}

  return false;
}
