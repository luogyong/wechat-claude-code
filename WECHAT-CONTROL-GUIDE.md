# WeChat Remote Control 使用指南

> 版本: 2.0 (改进版)  
> 更新时间: 2026-06-11

## 概述

WeChat Remote Control 允许你通过微信远程操控终端上的 Claude Code 会话。启用后：
- 终端的每一次对话都会被镜像到 `terminal-mirror.md`
- 你通过微信发送的消息会被当作终端输入来执行
- 会话上下文自动同步到微信端

## 快速开始

### 1. 开启远程控制

在终端运行：
```bash
node ~/.claude/skills/wechat-claude-code/scripts/wechat-control.mjs on
```

或使用 Claude Code 命令（推荐）：
```
/wechat-control-on
```

**效果**：
- ✅ 创建控制标志文件
- 📝 初始化对话镜像文件
- 🔄 自动生成上下文同步文件
- 📱 可以从微信继续当前会话

### 2. 在微信端操作

打开微信，向 wechat-claude-code 机器人发送消息：
- 正常对话 - 就像在终端使用 Claude Code 一样
- `/status` - 查看当前工作目录和状态
- `/cwd <路径>` - 切换工作目录
- `/help` - 查看可用命令

所有对话会实时镜像到终端的 `~/.wechat-claude-code/terminal-mirror.md` 文件。

### 3. 关闭远程控制

返回终端后运行：
```bash
node ~/.claude/skills/wechat-claude-code/scripts/wechat-control.mjs off
```

或使用 Claude Code 命令（推荐）：
```
/wechat-control-off
```

**效果**：
- 🛑 删除控制标志
- 📋 自动显示远程会话摘要
- 💡 告知在微信期间完成的工作

### 4. 查看状态

随时检查系统状态：
```bash
node ~/.claude/skills/wechat-claude-code/scripts/wechat-control.mjs status
```

或使用：
```
/wechat-control-status
```

## 核心机制

### 控制标志 (Flag File)

```
~/.wechat-claude-code/wechat-control.flag
```

- **存在** = 远程控制开启
- **不存在** = 远程控制关闭
- 内容包含开启时间和初始工作目录的 JSON

### 对话镜像 (Mirror File)

```
~/.wechat-claude-code/terminal-mirror.md
```

实时记录微信端的所有对话：
- 用户消息标记为 `### 💬 用户 (WeChat)`
- Claude 回复标记为 `### 🤖 Claude`
- 包含时间戳

### 上下文同步 (Context Sync)

```
~/.wechat-claude-code/context-sync.md
```

开启远程控制时自动生成，包含：
- 当前工作项目和目录
- 本次会话的关键工作内容
- 技术栈和工具
- 重要决策和上下文

微信端的 Claude 会读取此文件来了解终端会话的背景。

## 改进功能（v2.0）

### 1. 智能错误检测

- **PM2 状态检查** - 开启前自动检测 PM2 进程是否运行
- **文件状态验证** - status 命令显示所有关键文件状态
- **友好错误提示** - 问题发生时提供具体解决方案

### 2. 自动化上下文同步

`/wechat-control-on` 命令会：
- 自动提取当前会话的关键信息
- 生成结构化的上下文文档
- 无需手动编写摘要

### 3. 智能会话摘要

`/wechat-control-off` 命令会：
- 自动解析 terminal-mirror.md
- 提取最近 3 次交互的摘要
- 识别文件修改和命令执行
- 区分实际工作和简单问答

### 4. 增强的状态报告

`/wechat-control-status` 显示：
- 远程控制开关状态
- PM2 进程运行状态
- 所有关键文件的存在性
- 开启时间和元数据

### 5. 更好的用户体验

- 使用 emoji 和表格增强可读性
- 分隔线美化输出格式
- 清晰的提示和建议
- 统一的错误处理

## 典型工作流

### 场景 1: 办公室 → 通勤 → 家里

```bash
# 办公室，准备下班
[终端] /wechat-control-on
       ✅ 远程控制已开启，上下文已同步

# 通勤路上
[微信] 继续刚才的工作...
[微信] 查看 AEM 模拟结果
[微信] 修改配置参数

# 到家后
[终端] /wechat-control-off
       📋 远程会话摘要:
       - 修改了 config.yaml
       - 运行了 3 次测试
       - 发现了一个 bug 需要修复
```

### 场景 2: 快速检查

```bash
# 不在电脑前，需要快速检查某个状态
[微信] /status
[微信] 列出 logs/ 目录内容
[微信] 检查最新的错误日志

# 稍后回到电脑
[终端] /wechat-control-status
       🔴 远程控制: 关闭
       📦 PM2 进程: 运行中
```

### 场景 3: 紧急修复

```bash
# 发现生产问题，人不在电脑前
[微信] /wechat-control-on  # 如果之前忘记开启
[微信] 切换到生产代码目录
[微信] 快速修复并测试
[微信] git commit 和 push

# 确认修复后
[微信] /wechat-control-off
```

## 文件结构

```
~/.wechat-claude-code/
├── wechat-control.flag          # 控制标志（JSON）
├── terminal-mirror.md           # 对话镜像
├── context-sync.md              # 上下文同步
├── terminal-outbox.json         # 终端输出转发
├── permission-broker/           # 权限请求中转
├── sessions/                    # 微信会话数据
├── logs/                        # 日志文件
└── config.env                   # 配置文件

~/.claude/skills/wechat-claude-code/scripts/
├── wechat-control.mjs           # 核心控制脚本 ⭐
├── permission-broker.js         # 权限中转
├── terminal-forwarder.js        # 终端转发
└── daemon.sh                    # PM2 守护进程

~/.claude/commands/
├── wechat-control-on.md         # 开启命令 ⭐
├── wechat-control-off.md        # 关闭命令 ⭐
└── wechat-control-status.md     # 状态命令 ⭐
```

## 故障排除

### 问题 1: PM2 进程未运行

**症状**：
```
❌ 错误：wechat-claude-code PM2 进程未运行
```

**解决**：
```bash
pm2 list  # 检查进程状态
pm2 start wechat-claude-code  # 启动进程
pm2 save  # 保存配置
```

### 问题 2: Flag 文件卡住

**症状**：状态显示开启，但实际无法使用

**解决**：
```bash
rm ~/.wechat-claude-code/wechat-control.flag
node ~/.claude/skills/wechat-claude-code/scripts/wechat-control.mjs status
```

### 问题 3: 上下文未同步

**症状**：微信端 Claude 不了解终端会话背景

**解决**：
```bash
# 手动更新 context-sync.md
nano ~/.wechat-claude-code/context-sync.md

# 或重新开启远程控制
/wechat-control-off
/wechat-control-on
```

### 问题 4: 对话未镜像

**症状**：terminal-mirror.md 没有更新

**解决**：
```bash
# 检查 PM2 日志
pm2 logs wechat-claude-code --lines 50

# 重启 PM2 进程
pm2 restart wechat-claude-code
```

## 高级用法

### 自定义上下文模板

编辑 `~/.wechat-claude-code/context-sync.md` 使用自定义格式：

```markdown
## 当前会话完整上下文 (2026-06-11)

### 核心工作项目
- **Marp**: `d:/onedirver-scut/OneDrive - 华南理工大学/Marp`
  - AEM 高阶线元地下水模拟
  - DeepExcavation 基坑稳定性分析

### 本次会话主要工作
- 修复 line_element_mono_only.py 中的边界条件问题
- 测试不同阶数的 Chebyshev 基函数
- 诊断垂直墙体失效的根本原因

### 关键发现
- 低阶 Chebyshev 不足以处理垂直于流向的墙体
- 需要至少 8 阶才能得到准确结果

### 技术栈
- Python 3.11
- NumPy/SciPy
- Matplotlib
```

### 编程集成

在自己的脚本中检测远程控制状态：

```python
import os
from pathlib import Path

def is_wechat_control_active():
    flag = Path.home() / '.wechat-claude-code' / 'wechat-control.flag'
    return flag.exists()

if is_wechat_control_active():
    print("⚠️  检测到远程控制模式，建议先关闭")
```

```bash
#!/bin/bash
# Shell 脚本示例
if [ -f "$HOME/.wechat-claude-code/wechat-control.flag" ]; then
    echo "⚠️  远程控制正在运行"
    exit 1
fi
```

### 查看实时镜像

在另一个终端窗口实时查看对话：

```bash
# 方法 1: tail
tail -f ~/.wechat-claude-code/terminal-mirror.md

# 方法 2: watch
watch -n 2 'tail -50 ~/.wechat-claude-code/terminal-mirror.md'

# 方法 3: VS Code
code ~/.wechat-claude-code/terminal-mirror.md
```

## 安全注意事项

1. **敏感操作** - 避免在微信端执行危险命令（删除、部署等）
2. **网络依赖** - 需要稳定的网络连接，否则可能丢失消息
3. **并发冲突** - 远程控制开启时避免在终端同时操作
4. **日志审计** - 所有操作都记录在 terminal-mirror.md 中
5. **上下文大小** - 长时间会话可能导致镜像文件过大

## 与其他功能集成

### 权限审批系统

微信端可以审批终端的权限请求：
- 终端执行敏感操作时触发权限请求
- 请求转发到 `permission-broker/` 目录
- 微信端收到通知，可以批准或拒绝
- 使用 `/approve on|off` 切换审批模式

### 终端镜像

终端的输出可以转发到微信：
- Claude Code Stop hook 触发 `terminal-forwarder.js`
- 输出写入 `terminal-outbox.json`
- 微信端定期轮询并发送通知

## 更新历史

### v2.0 (2026-06-11)
- ✅ 增强错误检测和处理
- ✅ 自动化上下文同步生成
- ✅ 智能会话摘要提取
- ✅ 新增独立的 status 命令
- ✅ 改进输出格式和用户体验
- ✅ 添加 PM2 进程状态检查
- ✅ 优化命令文件指导说明

### v1.0 (2026-06-07)
- 初始版本
- 基础的 on/off 开关
- 简单的镜像和同步机制

## 相关资源

- **主文档**: `~/.wechat-claude-code/context-sync.md`
- **技术架构**: `~/.wechat-claude-code/terminal-mirror.md`
- **PM2 配置**: `pm2 show wechat-claude-code`
- **Claude Code 设置**: `~/.claude/settings.json`

## 反馈和建议

如发现问题或有改进建议，请记录在会话中或更新此文档。

---

**Last updated**: 2026-06-11  
**Maintained by**: GYLUO
