# T4 PoC — 全新 Mac 复现步骤

> 目标：在全新 Mac 上复现 `@shopify/theme-check-node` auto-glob RCE（主题仓库内被 commit 的 `node_modules/theme-check-*` 包被自动 require 执行）。
> 全程只需装 3 样基础环境：Xcode CLT、Homebrew、Node.js。pnpm/tsx 由 npx 临时拉取，无需单独安装。

## 第 1 段：基础环境（一次性）

打开 **终端（Terminal.app）**（启动台搜索 Terminal），按顺序执行：

```bash
# 1. 装 Xcode 命令行工具（提供 git 和编译器）——弹安装框点「安装」，等待完成
xcode-select --install

# 2. 装 Homebrew（macOS 包管理器），中途需要输入开机密码
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 3. 装 Node.js（≥18，自带 npm / npx）
brew install node

# 4. 验证三件套（各自应输出版本号）
git --version && node -v && npx -v
```

坑：若 `brew install node` 后 `node -v` 提示找不到命令，**关掉 Terminal 重新打开**再验证（PATH 刷新）。

## 第 2 段：克隆 + 构建 theme-tools（一次性，约 5-10 分钟）

```bash
cd ~
git clone https://github.com/Shopify/theme-tools.git
cd theme-tools
npx pnpm@10.28.0 install
npx pnpm@10.28.0 install --ignore-scripts
npx pnpm@10.28.0 --filter @shopify/liquid-html-parser run build:ts
npx pnpm@10.28.0 --filter @shopify/theme-check-common run build:ts
npx pnpm@10.28.0 --filter @shopify/theme-graph run build:ts
npx pnpm@10.28.0 --filter @shopify/theme-check-docs-updater run build:ts
npx pnpm@10.28.0 --filter @shopify/theme-check-node run build:ts
```

说明：

- `install` 阶段个别原生包（keytar/playwright）构建报错可忽略，第 2 行 `--ignore-scripts` 兜底
- 5 条 `build:ts` 必须按上面顺序执行，每条成功标志 = 无红色报错返回提示符

## 第 3 段：运行 PoC（弹计算器的一步）

```bash
cd ~
git clone https://github.com/3443176848/poc.git
cd poc
npx -y tsx@4.19.2 run-poc.ts ~/theme-tools
```

## 预期结果（判定标准）

1. **Calculator.app 自动弹出两次**——场景 A（malicious-theme 自带恶意包）一次，场景 B（plain-theme 干净主题被父目录向上命中）一次
2. 终端中两行 PWN 输出恰好落在 `[driver] >>> calling public loadConfig()` 与 `[driver] <<< returned` 之间（证明执行发生在工具加载配置过程中，而非驱动脚本自行 import）
3. 末尾输出 `[verdict] RCE = CONFIRMED`
4. 文件证据：标记文件中 `__filename` 指向恶意包文件（「谁执行的」铁证）

## 第 4 段：取证（截图留证）

```bash
cat "$TMPDIR/theme_rce_marker_1337.txt"
```

截两张图，报告用：

1. 计算器弹出 + 终端 `RCE = CONFIRMED` 同框
2. 上面 `cat` 的完整输出

## 清理

```bash
rm "$TMPDIR/theme_rce_marker_1337.txt"
```

## 说明

- 载荷无害：恶意包只做两件事——向临时目录追加一行标记（文件证据）、弹出系统计算器（代码执行可视化证明）。仅用于 Shopify HackerOne 漏洞报告复现材料
- 不需要 VSCode / Theme Check 扩展 / Shopify CLI：`run-poc.ts` 直接调用扩展与 CLI 共同的底层入口 `loadConfig()`，绕过外壳直击漏洞点；真实攻击链（扩展自动激活 / `shopify theme check`）在报告中以代码引用论证
