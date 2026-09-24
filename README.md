# T4 PoC — @shopify/theme-check-node auto-glob RCE

Shopify theme-tools 供应链 RCE 概念验证：主题仓库内被 commit 的 `node_modules/theme-check-*` 包会在**无任何 `.theme-check.yml`** 的情况下被 `loadConfig()` 自动 `require()` 执行。

**载荷无害**：两个恶意包只做一件事 — 向 `%TEMP%\theme_rce_marker_1337.txt` 追加一行标记并打印 PWN，用于证明「任意代码执行」这一事实。仅用于 Shopify HackerOne 漏洞报告的复现材料。

## 另一台电脑上的复现步骤

前置：Node.js ≥ 18、git。

```powershell
# 1) 克隆并构建 theme-tools（官方仓库）
git clone https://github.com/Shopify/theme-tools.git
cd theme-tools
npx pnpm@10.28.0 install
npx pnpm@10.28.0 install --ignore-scripts   # keytar/playwright 报错可忽略
npx pnpm@10.28.0 --filter @shopify/liquid-html-parser run build:ts
npx pnpm@10.28.0 --filter @shopify/theme-check-common run build:ts
npx pnpm@10.28.0 --filter @shopify/theme-graph run build:ts
npx pnpm@10.28.0 --filter @shopify/theme-check-docs-updater run build:ts
npx pnpm@10.28.0 --filter @shopify/theme-check-node run build:ts
cd ..

# 2) 克隆本 PoC 仓库
git clone <本仓库地址> poc
cd poc

# 3) 运行（参数 = theme-tools 仓库根路径）
npx -y tsx@4.19.2 run-poc.ts <theme-tools 仓库根的绝对路径>
```

## 预期结果

1. PWN 行落在 `[driver] >>> calling public loadConfig()` 与 `<<< returned` 之间（证明执行发生在工具加载配置过程中）
2. Scenario A（malicious-theme 自带恶意包）与 Scenario B（plain-theme 干净主题被父目录向上命中）都触发
3. `[verdict] RCE = CONFIRMED`
4. 标记文件 `%TEMP%\theme_rce_marker_1337.txt` 存在，`__filename` 指向恶意包文件

## 目录结构

```
poc\
  node_modules\theme-check-evil-up\    场景 B：父目录恶意包（仓库根有 .git 即被向上命中）
  malicious-theme\                     场景 A：带毒主题仓库（node_modules 被 commit）
    sections\innocent.liquid
    node_modules\theme-check-evil\
  plain-theme\                         场景 B 受害主题（自身无 node_modules、无配置）
  run-poc.ts                           PoC 驱动（可移植，theme-tools 路径用参数传）
```

## 清理

```powershell
Remove-Item "$env:TEMP\theme_rce_marker_1337.txt"
```
