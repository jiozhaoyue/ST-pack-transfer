# Luker staging 并发竞态（ENOENT）与本插件的处置（2026-11-11）

## 1. 现象

宿主启动时并发更新所有扩展，随机出现：

```
ENOENT ... .luker-staging-extension-<hex>
```

失败项每次不同，重试可能成功；容器启动后约 9 分钟内记录 9 次失败。

## 2. 取证

### 2.1 客户端并发触发

`public/scripts/extensions.js`：

- `bootstrapExtensions()` 中 `if (versionChanged && enableAutoUpdate) await autoUpdateExtensions(false);`
- `autoUpdateExtensions()` 对每个扩展 `promises.push(updateExtension(...))`，最后
  `await Promise.allSettled(promises)` —— **并发 POST `/api/extensions/update`**。

### 2.2 服务端清扫竞态

`src/sync/staging.js` 的 `sweepStaleStaging(parentDir)`：

```js
const entries = await fs.promises.readdir(parentDir, { withFileTypes: true });
for (const entry of entries) {
  if (!isStagingEntryName(entry.name)) continue;
  ...
  const stat = await fs.promises.lstat(abs);   // ← 并发时条目已被另一个 sweep 删除
  if (stat.mtimeMs >= PROCESS_STARTED_AT_MS) continue;
  await fs.promises.rm(abs, { recursive: true, force: true });
}
```

`makeStagingPath()` 在**每次** update/install 前都会 sweep。两个请求同时开始时：
两者 `readdir` 到同一批上一进程残留 → 先到的删除 → 后到的 `lstat` 抛 `ENOENT`。

### 2.3 为什么重试可能成功

第一次 sweep 已经把残留删完，后续并发没有可删对象；或该扩展这次恰好不在“被删条目”上。

## 3. 为什么前端插件不能直接修

`bootstrapExtensions()` 的顺序是：

```
discoverExtensions → getManifests → autoUpdateExtensions() → ensureFullSettingsLoaded → activateExtensions()
```

自动更新发生在 `activateExtensions()` **之前**，任何扩展脚本（包括本插件）尚未加载，
所以无法在启动期拦截、串行化或 patch 宿主的更新请求。

## 4. 本机处置（已执行，可回滚）

1. 备份并修改宿主配置：`%APPDATA%\Luker\config.yaml`
   - 备份：`config.yaml.bak-20261111-autoupdate`
   - `extensions.autoUpdate: true` → `false`
2. 重启宿主后验证：
   - `GET /api/settings/bootstrap` → `enable_extensions_auto_update = false`
   - `GET https://127.0.0.1:8060/` → 200
   - 启动日志无 `exit code 1` / ENOENT
   - `data/default-user/extensions` 下 `.luker-staging-*` 数量 = 0
3. 插件侧新增 `queueExtMutation()`：手动 / 批量 / 自动更新 / 卸载 / 重装 / 移动 / 安装
   全部串行，避免插件自己并发打宿主端点。

## 5. 上游修复建议（不改本机宿主源码）

- `sweepStaleStaging` 的 `lstat` 包 `try/catch`，`ENOENT` 直接 `continue`；
- 或对同一 `parentDir` 的 sweep 加进程内互斥锁；
- 或在 `makeStagingPath()` 之前只 sweep 一次（启动时），不要在每次更新里重复 sweep。

## 6. 边界

- 关闭 `extensions.autoUpdate` 后，宿主不再在版本变更时自动更新扩展；需要更新时用本面板
  逐扩展设置（`直接更新` + 间隔）或手动更新。
- 若重新打开宿主自动更新，且存在残留 staging，竞态会再次出现；插件无法兜底启动期。
