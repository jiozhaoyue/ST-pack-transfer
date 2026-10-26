# 存储图表工作台 — 技术设计

## 1. 目标与非目标

**目标**：把现有「区块平铺 + 方向开关 + 阶段门控」的工作台，重构为「单一存储图表 + 导入区/导出区单向流转」。图表是唯一工作台，所有可勾选、可编辑、可分类的东西都长在图表节点上。

**非目标**：
- 不为 ST 单独做后端适配；ST 宿主图表置灰。
- 不保留独立「仓」区块。
- 不保留扩展菜单（顶栏魔方棒）注入。
- 不追求四宿主图表「长得一样」；按能力分级，不能读的置灰。

## 2. 分层

```
src/core/
  format-registry.js        四宿主格式注册表（图标、英文全称、检测规则、类目映射）
  storage-inventory.js      存储清单聚合器（按宿主选适配器）
  inventory-adapters/       四宿主适配器
    luker.js                /api/users/storage/inspect 逐级钻取
    puretavern.js           Dexie pure-tavern-modular-dev
    tauritavern.js          window.__TAURI__.fs 枚举 $APPDATA/data
    sillytavern.js          返回 unsupported（图表置灰）
    browser.js              浏览器配额 + 插件自身 IndexedDB
  package-container.js      私有配置容器（zip 兼容 + manifest）
  package-model.js          包/私有配置/图表节点纯数据模型
  naming.js                 占位符与默认包名（取代 filename-template 的部分职责）
src/ui/
  workbench-template.js     单一模板源（重写）
  workbench-layout.js       双端布局声明（重写）
  storage-chart.js          图表渲染与勾选
  zone-panel.js             导入区/导出区列表与批操作
  package-card.js           包卡（图标/排序/全名查看）
  host-entry.js             四宿主入口注入（扩展列表下拉/备份按钮/Luker 管理器）
  tutorial.js               基础 7 步 + 进阶教程
  help-topics.js            问号浮层（修裁切与重建）
src/storage/
  db.js                     IndexedDB（新增 origin: unrecognized / export-copy / private-config）
  private-config-store.js   私有配置存取（替代 vault-store）
```

`src/core/` 禁止 DOM；`src/ui/` 只经注入接缝拿数据与动作。

## 3. 四宿主能力矩阵

| 宿主 | 清单来源 | 粒度 | 写回/云存 | 图表 |
|---|---|---|---|---|
| Luker | `POST /api/users/storage/inspect` | 逐文件（`canDrill`/`isLeaf`/`breadcrumbs`） | `/api/files/upload` → `user/files`；`/api/users/restore-backup` | 完整 |
| PureTavern | Dexie `pure-tavern-modular-dev`（`records`/`blobs`） | `module/collection/id` + blob 体积 | 同源 IndexedDB | 完整 |
| TauriTavern | `window.__TAURI__.fs.readDir/stat`，根 `$APPDATA/data` | 逐文件 | `__TAURI__.fs` 写回；`/api/users/backup` | 完整 |
| SillyTavern | 无清单端点 | — | `/api/files/upload`、`/api/users/restore` | 宿主图表置灰 |

**适配器契约**（纯接口，UI 不感知宿主）：

```js
{
  id: 'luker' | 'pt' | 'tt' | 'st' | 'browser',
  capabilities: { inventory: boolean, perFile: boolean, quota: boolean, writeBack: boolean },
  readRoot(): Promise<{ quota, nodes }>,
  readChildren(node): Promise<nodes>,   // perFile 为 false 时返回 []
  readFile?.(node): Promise<Blob>,
}
```

节点统一形状：

```js
{ id, path, label, kind: 'category'|'dir'|'file'|'unknown',
  sizeBytes, childCount, canDrill, selected, suggested: 'keep'|'optional'|'drop',
  format: 'st'|'l'|'tt'|'pt'|'plugin', privateConfig: boolean }
```

## 4. 图表模型

- 一个 `ChartModel`，数据源二选一：`host` 或 `package`。
- 切换包只替换 `source`，不重建图表容器；滚动位置与展开状态按「宿主+包」记忆。
- 树的默认展开：大类折叠，展开到文件。
- 三态：叶节点勾选 → 父级 `checked/indeterminate`。
- 建议色：`keep` / `optional` / `drop` 三档，配图例与悬浮；默认精简勾选。
- 差量：图表顶部 `覆盖 / 增量` 切换，作为当前包的导出属性。
- 扩展一级节点：`完整扩展/仅列表`、Git 保留项、构建配置，全部正向复选框。
- 私有配置一级节点：按来源宿主分组；未识别项显式节点。
- 未识别包：包级 `unrecognized` 标记，图表逐文件列出，动作只允许存储/导出/删除。

## 5. 分区与流转

```
宿主拉取 / 上传 / 未识别 ZIP
        │
        ▼
   导入区（可编辑、可看图表）
        │  「生成导出包」= 复制
        ▼
   导出区（只读；下载 / 回传宿主 / 复制回导入区）
```

- 复制后解耦：导出区副本独立存储（`origin: export-copy`），删除任一侧不联动。
- 多选按区限定：导入区 → 生成导出包 / 合并上传；导出区 → 下载 / 回传宿主。
- 合并上传同名即停，弹冲突清单。
- 导出后默认保留；可选删除（二次确认 + 不再显示 + 设置可重开）。
- 后端上下传默认流量提示；可不再显示 + 设置开关。

## 6. 私有配置容器

- zip 兼容容器（扩展名待定，建议 `.zip` 以兼容 `/api/files/upload` 与宿主文件浏览器；内部 `_private/manifest.json`）。
- `manifest.json`：`{ version, members: [{ path, format, type, size, sha256 }] }`。
- 兼容宿主：插件按 `format` 找到原生导入器，完整还原；不匹配：原样存储，类型仍明确。
- 云存储：`/api/files/upload`（base64，body 上限 500MB，文件名限 `[a-zA-Z0-9_-.]`）→ `data/<user>/user/files/`；`/user/files/<name>` 取回；`/api/files/delete` 删除；`/api/files/verify` 校验。

## 7. 命名引擎

- 占位符：`{host}` `{target}` `{user}` `{part}` `{date}` `{time}` `{datetime}` `{mode}` `{category}` `{source}` `{count}`。
- `{target}` 输出四酒馆英文全称；`{datetime}` = `YYYY-MM-DD_HH-mm-ss`；`{date}` 与 `{time}` 各自独立，互不冒充。
- 默认模板：`{target}_{user}_{part}_{datetime}.zip`。
- 分卷时 `{part}` 自动替换为 `part1...`。

## 8. 宿主入口

| 入口 | 落点 | 说明 |
|---|---|---|
| 扩展列表下拉 | `.extension_block[data-name*="<新插件名>"]` | 与宿主原生扩展一致的内联下拉，内容只有「打开面板」 |
| 原生备份按钮 | `.userBackupButton` 旁 | 账号弹层/管理面板 |
| Luker 备份管理器 | `.userBackupManager .backupActionRow` | 仅 Luker |
| 扩展菜单 | 顶栏魔方棒 | **禁止注入** |

幂等与自愈沿用 `watchHostDom`；注入节点带 `data-st-zip-injected`。

## 9. 与现有代码的关系

保留并改造：
- `transform.js`、`zip-io.js`、`splitter.js`、`delta.js`、`task-manager.js`、`worker-client.js`、`authority-store.js`。
- `db.js` 的 origins 扩为：`upload`、`host-export`、`export-copy`、`split-part`、`delta`、`private-config`、`unrecognized`。
- `usage-dashboard.js` 的宿主读数逻辑并入 `storage-inventory`，图表取代旧看板。

移除：
- `workbench-layout.js` 的 flow（out/in）模型与 `visibleModules` 阶段门控。
- `vault-panel.js`、`vault-store.js`（能力迁到私有配置）。
- `registerMenuButton`（扩展菜单注入）。
- 模板里的独立「清理」与「差量」折叠区、独立「仓」区块。

## 10. 风险与取舍

1. **ST 图表置灰**是明确取舍：没有清单端点，不做假数据。
2. **TT fs 作用域**需实测确认 `$APPDATA/data` 在 `fs:default`/`fs:allow-read` 范围内；若被拒，退回「整包备份反推」并标注为低精度。
3. **Luker inspect 只读**：我们复用其信息架构与分类逻辑，但自建选择与导出层，保证全量可选。
4. **复制解耦**会让同一包占两份字节，浏览器配额翻倍；在包卡上显示「副本」标记，设置里可改为移动（后续）。
5. **同名即停**会让批量合并更慢，但避免静默丢数据。
6. **图表性能**：大包可能有数千文件；默认折叠 + 虚拟滚动（超过 N 行时启用）+ rAF 合帧。
