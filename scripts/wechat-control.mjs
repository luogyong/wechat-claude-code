#!/usr/bin/env node
/**
 * wechat-control — toggle WeChat remote control mode for terminal Claude Code.
 *
 * Usage:
 *   node wechat-control.mjs on      — enable remote control
 *   node wechat-control.mjs off     — disable remote control
 *   node wechat-control.mjs status  — show current status
 *   node wechat-control.mjs         — same as status
 */

import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

const FLAG = join(homedir(), '.wechat-claude-code', 'wechat-control.flag');
const APPROVAL_FLAG = join(homedir(), '.wechat-claude-code', 'approval-mode');
const MIRROR = join(homedir(), '.wechat-claude-code', 'terminal-mirror.md');
const CONTEXT_SYNC = join(homedir(), '.wechat-claude-code', 'context-sync.md');

const cmd = process.argv[2] || 'status';

// Check if PM2 process is running
function checkPM2Status() {
  try {
    const output = execSync('pm2 jlist', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    const processes = JSON.parse(output);
    const wechatProcess = processes.find(p => p.name === 'wechat-claude-code');
    return wechatProcess && wechatProcess.pm2_env.status === 'online';
  } catch {
    return false;
  }
}

// Extract last conversation summary from mirror
function getMirrorSummary() {
  if (!existsSync(MIRROR)) return null;

  try {
    const content = readFileSync(MIRROR, 'utf-8');
    const lines = content.split('\n');

    // Find last few user/assistant exchanges
    const exchanges = [];
    let currentExchange = [];

    for (let i = lines.length - 1; i >= 0 && exchanges.length < 3; i--) {
      const line = lines[i];
      if (line.startsWith('### 💬 用户') || line.startsWith('### 🤖 Claude')) {
        if (currentExchange.length > 0) {
          exchanges.unshift(currentExchange.reverse().join('\n'));
          currentExchange = [];
        }
        currentExchange.push(line);
      } else if (currentExchange.length > 0 && line.trim()) {
        currentExchange.push(line);
      }
    }

    if (currentExchange.length > 0) {
      exchanges.unshift(currentExchange.reverse().join('\n'));
    }

    return exchanges.length > 0 ? exchanges.join('\n\n') : '(无对话记录)';
  } catch {
    return null;
  }
}

if (cmd === 'on') {
  // Check PM2 status first
  const pm2Running = checkPM2Status();
  if (!pm2Running) {
    console.error('❌ 错误：wechat-claude-code PM2 进程未运行');
    console.error('请先启动进程: pm2 start wechat-claude-code');
    process.exit(1);
  }

  // Create flag
  writeFileSync(FLAG, JSON.stringify({
    enabled_at: new Date().toISOString(),
    enabled_from_cwd: process.cwd(),
  }, null, 2));

  // Enable approval mode (terminal permission-broker waits for WeChat responses)
  writeFileSync(APPROVAL_FLAG, new Date().toISOString());

  // Initialize mirror with header
  writeFileSync(MIRROR, `# WeChat 远程控制镜像
> 开启时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
> 工作目录: ${process.cwd()}

---

`);

  console.log('✅ WeChat 远程控制已开启');
  console.log('');
  console.log('📱 现在可以通过微信继续当前会话');
  console.log(`📝 对话镜像: ${MIRROR}`);
  console.log(`🔄 上下文同步: ${CONTEXT_SYNC}`);
  console.log('');
  console.log('💡 提示：确保在终端继续工作前先关闭远程控制 (/wechat-control-off)');

} else if (cmd === 'off') {
  const wasActive = existsSync(FLAG);

  if (!wasActive) {
    console.log('ℹ️  远程控制未开启，无需关闭');
    process.exit(0);
  }

  // Remove flags
  try {
    unlinkSync(FLAG);
    try { unlinkSync(APPROVAL_FLAG); } catch {}
  } catch (err) {
    console.error(`❌ 无法删除 flag 文件: ${err.message}`);
    process.exit(1);
  }

  console.log('✅ WeChat 远程控制已关闭');
  console.log('');

  // Show summary of what happened during remote session
  const summary = getMirrorSummary();
  if (summary) {
    console.log('📋 远程会话摘要（最近3条交互）:');
    console.log('─'.repeat(60));
    console.log(summary);
    console.log('─'.repeat(60));
    console.log('');
    console.log(`📄 完整记录: ${MIRROR}`);
  } else {
    console.log('ℹ️  未找到远程会话记录');
  }


} else if (cmd === 'status') {
  const active = existsSync(FLAG);
  const pm2Running = checkPM2Status();

  console.log('━'.repeat(60));
  console.log('WeChat Remote Control Status');
  console.log('━'.repeat(60));
  console.log('');

  // Control status
  if (active) {
    console.log('🔛 远程控制: ✅ 开启');
    try {
      const flagData = JSON.parse(readFileSync(FLAG, 'utf-8'));
      console.log(`   开启时间: ${flagData.enabled_at}`);
      console.log(`   初始目录: ${flagData.enabled_from_cwd}`);
    } catch {}
  } else {
    console.log('🔴 远程控制: ❌ 关闭');
  }
  console.log('');

  // PM2 status
  console.log(`📦 PM2 进程: ${pm2Running ? '✅ 运行中' : '❌ 未运行'}`);
  if (!pm2Running) {
    console.log('   提示: 运行 pm2 start wechat-claude-code');
  }
  console.log('');

  // Files status
  console.log('📁 文件状态:');
  console.log(`   Flag:    ${existsSync(FLAG) ? '✅' : '❌'} ${FLAG}`);
  console.log(`   Mirror:  ${existsSync(MIRROR) ? '✅' : '❌'} ${MIRROR}`);
  console.log(`   Context: ${existsSync(CONTEXT_SYNC) ? '✅' : '❌'} ${CONTEXT_SYNC}`);
  console.log('');
  console.log('━'.repeat(60));

} else {
  console.error(`❌ 未知命令: ${cmd}`);
  console.error('用法: node wechat-control.mjs {on|off|status}');
  process.exit(1);
}
