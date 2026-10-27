# 全量文案清单（自动提取，跳过注释）

> 生成时间：2026-10-27T11:34:06.607Z
> 文件数：12；条目数：715
> 说明：`kind` 为启发式分类；`key` 是建议 key 的占位，最终以人工评审为准。

## 汇总

| 文件 | 条目数 |
| --- | ---: |
| index.js | 89 |
| src/ui/workbench-template.js | 71 |
| src/ui/workbench-view.js | 176 |
| src/ui/export-queue.js | 57 |
| src/ui/lan-transfer-panel.js | 81 |
| src/ui/host-bridge.js | 129 |
| src/ui/chat-store-inject.js | 46 |
| src/ui/chat-store-bridge.js | 29 |
| src/ui/qr.js | 10 |
| src/app/task-runtime.js | 14 |
| src/storage/db.js | 1 |
| src/storage/authority-store.js | 12 |

## 明细

### index.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 139 | text | 远程导入 | `index.text.001` |
| 2 | 140 | text | 分卷 | `index.text.002` |
| 3 | 141 | text | 导出副本 | `index.text.003` |
| 4 | 142 | text | 本地导入 | `index.text.004` |
| 5 | 158 | text | 读取工作区失败: | `index.text.005` |
| 6 | 171 | text | 扫描跳过： | `index.text.006` |
| 7 | 171 | text | 的字节不在工作区 | `index.text.007` |
| 8 | 172 | text | 扫描中 · | `index.text.008` |
| 9 | 173 | text | 扫描开始： | `index.text.009` |
| 10 | 201 | text | 扫描完成 | `index.text.010` |
| 11 | 202 | text | 扫描完成： | `index.text.011` |
| 12 | 202 | text | 个文件 · | `index.text.012` |
| 13 | 202 | text | 个分组 | `index.text.013` |
| 14 | 205 | text | 扫描失败： | `index.text.014` |
| 15 | 206 | text | 扫描失败 | `index.text.015` |
| 16 | 227 | toast | 当前浏览器不支持本地存储 | `index.toast.016` |
| 17 | 244 | toast | 已接收 | `index.toast.017` |
| 18 | 244 | toast | 个包 | `index.toast.018` |
| 19 | 244 | toast | 已导入 | `index.toast.019` |
| 20 | 244 | toast | 个包 | `index.toast.020` |
| 21 | 255 | text | 发送跳过： | `index.text.021` |
| 22 | 255 | text | 的字节不在工作区 | `index.text.022` |
| 23 | 287 | toast | 已复制 | `index.toast.023` |
| 24 | 287 | toast | 个包回导入区 | `index.toast.024` |
| 25 | 291 | toast | 先选择要删除的包 | `index.toast.025` |
| 26 | 292 | log | 确定删除选中的 | `index.log.026` |
| 27 | 292 | log | 个包吗？此操作不可撤销。 | `index.log.027` |
| 28 | 300 | toast | 已删除 | `index.toast.028` |
| 29 | 304 | toast | 只有插件形态可以回传宿主 | `index.toast.029` |
| 30 | 306 | toast | 先选择一个导出包 | `index.toast.030` |
| 31 | 307 | log | 将 | `index.log.031` |
| 32 | 307 | log | 恢复到当前宿主？覆盖前请确认已备份。 | `index.log.032` |
| 33 | 312 | text | 正在回传宿主... | `index.text.033` |
| 34 | 317 | text | 宿主未写入任何条目 | `index.text.034` |
| 35 | 319 | text | 恢复完成 | `index.text.035` |
| 36 | 320 | text | 已恢复 | `index.text.036` |
| 37 | 321 | toast | 恢复完成 | `index.toast.037` |
| 38 | 323 | text | 恢复失败： | `index.text.038` |
| 39 | 324 | text | 恢复失败 | `index.text.039` |
| 40 | 331 | toast | 独立 Web 模式没有宿主数据源 | `index.toast.040` |
| 41 | 335 | text | 正在请求宿主打包... | `index.text.041` |
| 42 | 338 | text | 宿主打包中... | `index.text.042` |
| 43 | 341 | text | 接收中 | `index.text.043` |
| 44 | 356 | text | 宿主拉取完成 | `index.text.044` |
| 45 | 357 | toast | 宿主拉取完成 | `index.toast.045` |
| 46 | 359 | text | 宿主拉取失败： | `index.text.046` |
| 47 | 360 | text | 宿主拉取失败 | `index.text.047` |
| 48 | 368 | toast | 先选择要导出的包 | `index.toast.048` |
| 49 | 380 | text | 转换中 · | `index.text.049` |
| 50 | 397 | text | 转换中 | `index.text.050` |
| 51 | 425 | text | 已转换 | `index.text.051` |
| 52 | 436 | text | 导出包已就绪 | `index.text.052` |
| 53 | 437 | toast | 已生成 | `index.toast.053` |
| 54 | 437 | toast | 个导出包 | `index.toast.054` |
| 55 | 440 | text | 转换失败： | `index.text.055` |
| 56 | 441 | text | 转换失败 | `index.text.056` |
| 57 | 442 | toast | 转换失败，详见日志 | `index.toast.057` |
| 58 | 451 | toast | 没有可导出的聊天 | `index.toast.058` |
| 59 | 460 | toast | 聊天库已导出到导入区 | `index.toast.059` |
| 60 | 462 | text | 聊天库导出失败： | `index.text.060` |
| 61 | 468 | modal | 设置 | `index.modal.061` |
| 62 | 468 | modal | 这些选项会记住。 | `index.modal.062` |
| 63 | 470 | markup | <label class="set-row"><span>压缩</span><select id="set-compression" class="text_pole"> | `index.markup.063` |
| 64 | 471 | text | 0\|不压缩 | `index.text.064` |
| 65 | 471 | text | 1\|快速 | `index.text.065` |
| 66 | 471 | text | 5\|标准 | `index.text.066` |
| 67 | 471 | text | 9\|最大 | `index.text.067` |
| 68 | 473 | markup | <label class="set-row"><span>扩展包</span><select id="set-extension-mode" class="text_pole"> | `index.markup.068` |
| 69 | 474 | markup | >只导出清单</option> | `index.markup.069` |
| 70 | 475 | markup | >完整扩展包</option> | `index.markup.070` |
| 71 | 477 | markup | <label class="set-row"><span>Git 历史</span><select id="set-git-mode" class="text_pole"> | `index.markup.071` |
| 72 | 478 | markup | >保留历史</option> | `index.markup.072` |
| 73 | 479 | markup | >只留更新所需</option> | `index.markup.073` |
| 74 | 480 | markup | >不含历史</option> | `index.markup.074` |
| 75 | 482 | markup | > 保留构建配置</label> | `index.markup.075` |
| 76 | 483 | markup | > 打包 backups 快照</label> | `index.markup.076` |
| 77 | 484 | markup | > 打包派生缓存</label> | `index.markup.077` |
| 78 | 485 | markup | > 打包私有配置</label> | `index.markup.078` |
| 79 | 486 | markup | > 清理原生重复资产</label> | `index.markup.079` |
| 80 | 487 | markup | > 导出后在导出区保留包</label> | `index.markup.080` |
| 81 | 488 | markup | > 后端上下传流量提示</label> | `index.markup.081` |
| 82 | 489 | markup | > 基础教程自动打开</label> | `index.markup.082` |
| 83 | 492 | modal | 关闭 | `index.modal.083` |
| 84 | 494 | text | 保存 | `index.text.084` |
| 85 | 510 | toast | 设置已保存 | `index.toast.085` |
| 86 | 538 | toast | 私有配置上传请求： | `index.toast.086` |
| 87 | 538 | toast | 私有配置： | `index.toast.087` |
| 88 | 584 | text | 准备就绪 | `index.text.088` |
| 89 | 585 | text | 工作台已就绪 · | `index.text.089` |

### src/ui/workbench-template.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 11 | markup | <h1>数据包转运</h1> | `workbench-template.markup.001` |
| 2 | 15 | a11y | <span class="badge accent" id="host-badge"><img class="host-icon" id="host-badge-icon" alt=""><svg class="gh-icon" id="host-badge-gh" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" hidden><path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 22 12A10 10 0 0 0 12 2z"/></svg><span id="host-badge-text">Luker 插件</span></span> | `workbench-template.a11y.002` |
| 3 | 16 | title | <button class="icon-btn" id="btn-guide" title="基础教程">?</button> | `workbench-template.title.003` |
| 4 | 17 | title | <button class="icon-btn" id="btn-log" title="日志"> | `workbench-template.title.004` |
| 5 | 21 | title | <button class="icon-btn" id="btn-settings" title="设置"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg></button> | `workbench-template.title.005` |
| 6 | 22 | title | <button class="icon-btn" id="btn-close" title="关闭">×</button> | `workbench-template.title.006` |
| 7 | 32 | markup | <span>存储图表</span> | `workbench-template.markup.007` |
| 8 | 35 | title | <button class="help-btn" data-help="chart" title="图表帮助">?</button> | `workbench-template.title.008` |
| 9 | 40 | markup | <div class="field">目标平台 | `workbench-template.markup.009` |
| 10 | 50 | title | <div class="segmented" id="delta-toggle" title="覆盖 / 增量"> | `workbench-template.title.010` |
| 11 | 51 | markup | <button class="seg-btn active" data-delta="overwrite">覆盖</button> | `workbench-template.markup.011` |
| 12 | 52 | markup | <button class="seg-btn" data-delta="incremental">增量</button> | `workbench-template.markup.012` |
| 13 | 54 | markup | <label class="field">分卷 | `workbench-template.markup.013` |
| 14 | 55 | placeholder | <input type="number" id="split-input" min="32" max="2048" step="1" placeholder="不分卷"> | `workbench-template.placeholder.014` |
| 15 | 62 | markup | <label class="field" for="filename-template">包名</label> | `workbench-template.markup.015` |
| 16 | 69 | markup | <span class="item"><i class="dot keep"></i>建议保留</span> | `workbench-template.markup.016` |
| 17 | 70 | markup | <span class="item"><i class="dot optional"></i>可选</span> | `workbench-template.markup.017` |
| 18 | 71 | markup | <span class="item"><i class="dot drop"></i>建议清理</span> | `workbench-template.markup.018` |
| 19 | 72 | markup | <span class="item"><i class="dot unknown"></i>未识别</span> | `workbench-template.markup.019` |
| 20 | 73 | markup | <span class="item" style="margin-left:auto">勾选即导出范围</span> | `workbench-template.markup.020` |
| 21 | 80 | title | <div class="splitter-v" id="split-v" role="separator" aria-orientation="vertical" title="拖动调整左右宽度"></div> | `workbench-template.title.021` |
| 22 | 83 | title | <div class="splitter-corner" id="split-corner" title="拖动同时调整宽度与高度"></div> | `workbench-template.title.022` |
| 23 | 88 | markup | <span>数据包</span> | `workbench-template.markup.023` |
| 24 | 91 | title | <button class="help-btn" data-help="zone" title="数据包帮助">?</button> | `workbench-template.title.024` |
| 25 | 95 | markup | <button class="zone-tab active" data-zone="import">导入<span class="count" id="count-import">4</span></button> | `workbench-template.markup.025` |
| 26 | 96 | markup | <button class="zone-tab" data-zone="export">导出<span class="count" id="count-export">1</span></button> | `workbench-template.markup.026` |
| 27 | 101 | title | <div class="splitter-h" id="split-h" role="separator" aria-orientation="horizontal" title="拖动调整高度"></div> | `workbench-template.title.027` |
| 28 | 107 | markup | <span>执行</span> | `workbench-template.markup.028` |
| 29 | 110 | title | <button class="help-btn" data-help="action" title="执行帮助">?</button> | `workbench-template.title.029` |
| 30 | 118 | markup | <span>局域网互传</span> | `workbench-template.markup.030` |
| 31 | 119 | markup | <span class="lan-toggle-hint" id="lan-toggle-hint">发送或接收数据包</span> | `workbench-template.markup.031` |
| 32 | 126 | markup | <span id="lan-scan-hint">把取件码对准摄像头</span> | `workbench-template.markup.032` |
| 33 | 127 | markup | <button type="button" id="lan-scan-cancel">取消</button> | `workbench-template.markup.033` |
| 34 | 135 | title | <span class="lan-sec-title">发送</span> | `workbench-template.title.034` |
| 35 | 136 | markup | <span class="lan-sec-note" id="lan-send-summary">在数据包区勾选要发送的包</span> | `workbench-template.markup.035` |
| 36 | 139 | markup | <div class="lan-label"><span>取件码</span><button type="button" class="lan-link" id="lan-btn-copy-send" hidden>复制</button></div> | `workbench-template.markup.036` |
| 37 | 140 | placeholder | <textarea class="text_pole lan-code" id="lan-send-code" rows="2" readonly placeholder="勾选包后生成"></textarea> | `workbench-template.placeholder.037` |
| 38 | 144 | markup | <button type="button" class="menu_button" id="lan-btn-generate">生成取件码</button> | `workbench-template.markup.038` |
| 39 | 145 | markup | <button type="button" class="menu_button" id="lan-btn-retry" hidden>重试</button> | `workbench-template.markup.039` |
| 40 | 146 | markup | <button type="button" class="menu_button" id="lan-btn-cancel" hidden>取消</button> | `workbench-template.markup.040` |
| 41 | 149 | markup | <div class="lan-label"><span>应答码</span><button type="button" class="lan-link" id="lan-btn-scan-answer" hidden>扫码</button></div> | `workbench-template.markup.041` |
| 42 | 150 | placeholder | <textarea class="text_pole lan-code" id="lan-answer-input" rows="2" placeholder="粘贴或扫对方回传的应答码"></textarea> | `workbench-template.placeholder.042` |
| 43 | 153 | markup | <button type="button" class="menu_button" id="lan-btn-apply-answer">开始传输</button> | `workbench-template.markup.043` |
| 44 | 156 | markup | <span class="lan-phase" id="lan-send-phase">准备就绪</span> | `workbench-template.markup.044` |
| 45 | 164 | title | <div class="lan-sec-head"><span class="lan-sec-title">接收</span></div> | `workbench-template.title.045` |
| 46 | 166 | markup | <div class="lan-label"><span>取件码</span><button type="button" class="lan-link" id="lan-btn-scan-offer">扫码</button></div> | `workbench-template.markup.046` |
| 47 | 167 | placeholder | <textarea class="text_pole lan-code" id="lan-offer-input" rows="2" placeholder="粘贴或扫对方发来的取件码"></textarea> | `workbench-template.placeholder.047` |
| 48 | 170 | markup | <button type="button" class="menu_button" id="lan-btn-accept">生成应答码</button> | `workbench-template.markup.048` |
| 49 | 173 | markup | <div class="lan-label"><span>应答码</span><button type="button" class="lan-link" id="lan-btn-copy-recv" hidden>复制</button></div> | `workbench-template.markup.049` |
| 50 | 174 | placeholder | <textarea class="text_pole lan-code" id="lan-recv-code" rows="2" readonly placeholder="生成后交给发送端"></textarea> | `workbench-template.placeholder.050` |
| 51 | 178 | markup | <span class="lan-phase" id="lan-recv-phase">等待取件码</span> | `workbench-template.markup.051` |
| 52 | 184 | markup | <button type="button" class="menu_button" id="lan-btn-abandon" hidden>放弃半成品</button> | `workbench-template.markup.052` |
| 53 | 191 | markup | <div class="progress-text"><span id="progress-label">准备就绪</span><span id="progress-pct">0%</span></div> | `workbench-template.markup.053` |
| 54 | 198 | markup | <!-- 帮助浮层：挂在 body，避免被面板 overflow 裁切 --> | `workbench-template.markup.054` |
| 55 | 201 | markup | <!-- 教程 --> | `workbench-template.markup.055` |
| 56 | 209 | markup | <button id="tutorial-adv" class="link">进阶教程</button> | `workbench-template.markup.056` |
| 57 | 210 | markup | <button id="tutorial-skip">跳过</button> | `workbench-template.markup.057` |
| 58 | 211 | markup | <button id="tutorial-prev">上一步</button> | `workbench-template.markup.058` |
| 59 | 212 | markup | <button id="tutorial-next" class="primary">下一步</button> | `workbench-template.markup.059` |
| 60 | 217 | markup | <!-- 通用弹窗 --> | `workbench-template.markup.060` |
| 61 | 227 | markup | <!-- 日志：顶栏按钮打开，面板里不再常驻日志块 --> | `workbench-template.markup.061` |
| 62 | 231 | markup | <h3>日志</h3> | `workbench-template.markup.062` |
| 63 | 232 | title | <button class="help-btn" data-help="log" title="日志帮助">?</button> | `workbench-template.title.063` |
| 64 | 233 | markup | <span class="latest" id="log-latest">暂无日志</span> | `workbench-template.markup.064` |
| 65 | 234 | title | <button class="icon-btn" id="log-close" title="关闭">×</button> | `workbench-template.title.065` |
| 66 | 237 | markup | <button class="log-level-btn active" data-level="ALL">全部</button> | `workbench-template.markup.066` |
| 67 | 238 | markup | <button class="log-level-btn" data-level="INFO">信息</button> | `workbench-template.markup.067` |
| 68 | 239 | markup | <button class="log-level-btn" data-level="WARN">警告</button> | `workbench-template.markup.068` |
| 69 | 240 | markup | <button class="log-level-btn" data-level="ERROR">错误</button> | `workbench-template.markup.069` |
| 70 | 245 | markup | <button id="log-copy">复制</button> | `workbench-template.markup.070` |
| 71 | 246 | markup | <button id="log-clear">清空</button> | `workbench-template.markup.071` |

### src/ui/workbench-view.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 92 | text | 准备就绪 | `workbench-view.text.001` |
| 2 | 93 | text | 等待取件码 | `workbench-view.text.002` |
| 3 | 103 | text | 未识别 | `workbench-view.text.003` |
| 4 | 162 | text | 导入 | `workbench-view.text.004` |
| 5 | 162 | text | 导出 | `workbench-view.text.005` |
| 6 | 182 | markup | <label>格式 <select id="host-filter"> | `workbench-view.markup.006` |
| 7 | 183 | text | 全部 | `workbench-view.text.007` |
| 8 | 184 | text | 未识别 | `workbench-view.text.008` |
| 9 | 205 | title | 独立 Web 形态：没有宿主数据源 | `workbench-view.title.009` |
| 10 | 205 | title | 当前运行在 | `workbench-view.title.010` |
| 11 | 205 | title | 插件内 | `workbench-view.title.011` |
| 12 | 206 | text | 插件 | `workbench-view.text.012` |
| 13 | 219 | markup | <span class="host-tag">（宿主）</span> | `workbench-view.markup.013` |
| 14 | 228 | text | 填 MB 数值 | `workbench-view.text.014` |
| 15 | 229 | text | 最小 | `workbench-view.text.015` |
| 16 | 230 | text | 最大 | `workbench-view.text.016` |
| 17 | 233 | text | 按各包总量估算 | `workbench-view.text.017` |
| 18 | 239 | text | 预计 | `workbench-view.text.018` |
| 19 | 239 | text | 卷 | `workbench-view.text.019` |
| 20 | 239 | text | · 有单文件超限 | `workbench-view.text.020` |
| 21 | 327 | text | 浏览器配额 | `workbench-view.text.021` |
| 22 | 327 | text | 浏览器未提供配额读数 | `workbench-view.text.022` |
| 23 | 328 | text | 宿主配额 | `workbench-view.text.023` |
| 24 | 328 | text | 当前宿主无逐项读数 | `workbench-view.text.024` |
| 25 | 340 | text | 建议保留 | `workbench-view.text.025` |
| 26 | 340 | text | 可选 | `workbench-view.text.026` |
| 27 | 340 | text | 建议清理 | `workbench-view.text.027` |
| 28 | 340 | text | 未识别 | `workbench-view.text.028` |
| 29 | 342 | a11y | " aria-label="展开"> | `workbench-view.a11y.029` |
| 30 | 349 | markup | ">上传</button> | `workbench-view.markup.030` |
| 31 | 368 | markup | <span class="vol-flag">超单卷上限</span> | `workbench-view.markup.031` |
| 32 | 371 | a11y | " aria-label="展开或收起"> | `workbench-view.a11y.032` |
| 33 | 377 | markup | <button data-treeall="1">全选</button> | `workbench-view.markup.033` |
| 34 | 378 | markup | <button data-treenone="1">全不选</button> | `workbench-view.markup.034` |
| 35 | 379 | markup | <button data-treeinvert="1">反选</button> | `workbench-view.markup.035` |
| 36 | 380 | markup | <span class="spacer"></span><span class="hint">大类折叠到文件</span> | `workbench-view.markup.036` |
| 37 | 383 | markup | <div class="chart-foot"><span>已选 | `workbench-view.markup.037` |
| 38 | 383 | text | 项 · 预计 | `workbench-view.text.038` |
| 39 | 394 | markup | <span class="lbl"><span class="scope">已选 | `workbench-view.markup.039` |
| 40 | 394 | markup | 个包</span> · 共 | `workbench-view.markup.040` |
| 41 | 394 | markup | 张图表</span> | `workbench-view.markup.041` |
| 42 | 395 | markup | <button data-batchall="1">全选全部</button> | `workbench-view.markup.042` |
| 43 | 396 | markup | <button data-batchnone="1">全不选</button> | `workbench-view.markup.043` |
| 44 | 397 | markup | <button data-batchinvert="1">反选</button> | `workbench-view.markup.044` |
| 45 | 399 | markup | <span style="color:var(--muted-2)">目标平台 / 差量 / 分卷 同时作用于全部选中包</span> | `workbench-view.markup.045` |
| 46 | 416 | text | 宿主数据 | `workbench-view.text.046` |
| 47 | 417 | markup | <div class="chart-unavailable"><b>当前形态没有存储清单端点</b><br>宿主图表置灰；下方仍可查看插件自身数据。不新增该宿主专用后端。</div> | `workbench-view.markup.047` |
| 48 | 426 | markup | <div class="chart-unavailable"><b>未识别包</b><br>逐文件列出，不提供转换；只能存储、导出或删除。</div> | `workbench-view.markup.048` |
| 49 | 431 | markup | 卷</span> | `workbench-view.markup.049` |
| 50 | 433 | a11y | " aria-label="关闭该包图表">×</button> | `workbench-view.a11y.050` |
| 51 | 438 | text | 卷 | `workbench-view.text.051` |
| 52 | 438 | text | 整包 | `workbench-view.text.052` |
| 53 | 440 | text | 整包 | `workbench-view.text.053` |
| 54 | 502 | markup | <span class="pkg-badge unknown">未识别包</span> | `workbench-view.markup.054` |
| 55 | 504 | markup | <span class="pkg-badge warn">分卷 | `workbench-view.markup.055` |
| 56 | 505 | markup | <span class="pkg-badge lock">只读</span> | `workbench-view.markup.056` |
| 57 | 516 | title | " title="下载"> | `workbench-view.title.057` |
| 58 | 517 | title | " title="回传宿主"> | `workbench-view.title.058` |
| 59 | 518 | title | " title="复制回导入区"> | `workbench-view.title.059` |
| 60 | 519 | title | " title="删除"> | `workbench-view.title.060` |
| 61 | 535 | markup | <div class="dropzone" id="dropzone"><span class="big">选择数据包</span>上传 zip 或从宿主拉取</div> | `workbench-view.markup.061` |
| 62 | 536 | markup | <label>排序 <select id="sort-select"> | `workbench-view.markup.062` |
| 63 | 537 | markup | >时间倒序</option> | `workbench-view.markup.063` |
| 64 | 538 | markup | >名称</option> | `workbench-view.markup.064` |
| 65 | 539 | markup | >大小</option> | `workbench-view.markup.065` |
| 66 | 542 | markup | <label>排序 <select id="sort-select"> | `workbench-view.markup.066` |
| 67 | 543 | markup | >时间倒序</option> | `workbench-view.markup.067` |
| 68 | 544 | markup | >名称</option> | `workbench-view.markup.068` |
| 69 | 545 | markup | >大小</option> | `workbench-view.markup.069` |
| 70 | 549 | text | 导入区为空 | `workbench-view.text.070` |
| 71 | 549 | text | 导出区为空 | `workbench-view.text.071` |
| 72 | 554 | markup | <div class="batch-bar"><span class="lbl">已选 | `workbench-view.markup.072` |
| 73 | 554 | markup | 项</span> | `workbench-view.markup.073` |
| 74 | 555 | markup | <button id="batch-generate">生成导出包</button> | `workbench-view.markup.074` |
| 75 | 556 | markup | >合并上传</button> | `workbench-view.markup.075` |
| 76 | 557 | markup | <button id="batch-delete">删除</button></div> | `workbench-view.markup.076` |
| 77 | 592 | markup | 从聊天库导出</button> | `workbench-view.markup.077` |
| 78 | 596 | markup | 从宿主拉取</button> | `workbench-view.markup.078` |
| 79 | 597 | markup | 生成导出包</button> | `workbench-view.markup.079` |
| 80 | 598 | markup | 合并上传</button> | `workbench-view.markup.080` |
| 81 | 605 | markup | 下载</button> | `workbench-view.markup.081` |
| 82 | 606 | markup | 回传宿主</button> | `workbench-view.markup.082` |
| 83 | 607 | markup | 复制回导入区</button> | `workbench-view.markup.083` |
| 84 | 624 | text | 在数据包区勾选要发送的包 | `workbench-view.text.084` |
| 85 | 626 | text | 已选 | `workbench-view.text.085` |
| 86 | 626 | text | 个包 · | `workbench-view.text.086` |
| 87 | 648 | text | 发送 | `workbench-view.text.087` |
| 88 | 649 | text | 接收 | `workbench-view.text.088` |
| 89 | 650 | text | 发送或接收数据包 | `workbench-view.text.089` |
| 90 | 668 | text | 准备就绪 | `workbench-view.text.090` |
| 91 | 679 | text | 等待取件码 | `workbench-view.text.091` |
| 92 | 684 | text | 把应答码对准摄像头 | `workbench-view.text.092` |
| 93 | 684 | text | 把取件码对准摄像头 | `workbench-view.text.093` |
| 94 | 697 | toast | 已复制 | `workbench-view.toast.094` |
| 95 | 698 | toast | 复制失败，请手动选择 | `workbench-view.toast.095` |
| 96 | 701 | toast | 当前环境不支持扫码 | `workbench-view.toast.096` |
| 97 | 721 | text | 相机不可用 | `workbench-view.text.097` |
| 98 | 724 | text | 相机不可用 | `workbench-view.text.098` |
| 99 | 734 | markup | <div class="log-line">暂无日志</div> | `workbench-view.markup.099` |
| 100 | 736 | text | 暂无日志 | `workbench-view.text.100` |
| 101 | 742 | title | 条警告/错误 | `workbench-view.title.101` |
| 102 | 754 | toast | 至少选择两个包 | `workbench-view.toast.102` |
| 103 | 756 | log | 合并上传检测到同名路径: characters/Seraphina.png | `workbench-view.log.103` |
| 104 | 757 | modal | 合并冲突 | `workbench-view.modal.104` |
| 105 | 757 | modal | 以下路径在多个包中同名，已停止合并。请先在本地编辑或改名。 | `workbench-view.modal.105` |
| 106 | 758 | markup | <br><br>冲突: characters/Seraphina.png</div> | `workbench-view.markup.106` |
| 107 | 759 | modal | 知道了 | `workbench-view.modal.107` |
| 108 | 785 | modal | 该操作会耗费大量流量 | `workbench-view.modal.108` |
| 109 | 785 | modal | 向后端酒馆上传或下载会消耗大量流量，请确认当前网络环境。 | `workbench-view.modal.109` |
| 110 | 786 | markup | <label class="check"><input type="checkbox" id="traffic-nodisplay"> 不再显示</label> | `workbench-view.markup.110` |
| 111 | 788 | modal | 取消 | `workbench-view.modal.111` |
| 112 | 789 | text | 继续 | `workbench-view.text.112` |
| 113 | 791 | log | 已关闭流量提示 | `workbench-view.log.113` |
| 114 | 799 | title | 存储图表 | `workbench-view.title.114` |
| 115 | 799 | title | 图表是唯一工作台 | `workbench-view.title.115` |
| 116 | 799 | title | 顶部显示两处配额 | `workbench-view.title.116` |
| 117 | 799 | title | 勾选即导出范围 | `workbench-view.title.117` |
| 118 | 799 | title | 分卷后每卷一张图表 | `workbench-view.title.118` |
| 119 | 799 | title | 多选包时同时显示多组图表 | `workbench-view.title.119` |
| 120 | 800 | title | 数据包 | `workbench-view.title.120` |
| 121 | 800 | title | 导入区存放未修改的包 | `workbench-view.title.121` |
| 122 | 800 | title | 导出区只读 | `workbench-view.title.122` |
| 123 | 800 | title | 生成导出包后进导出区 | `workbench-view.title.123` |
| 124 | 800 | title | 可复制回导入区再编辑 | `workbench-view.title.124` |
| 125 | 801 | title | 执行 | `workbench-view.title.125` |
| 126 | 801 | title | 按所在区显示可用操作 | `workbench-view.title.126` |
| 127 | 801 | title | 后端上下传会提示流量 | `workbench-view.title.127` |
| 128 | 801 | title | 生成导出包不会删除导入区 | `workbench-view.title.128` |
| 129 | 802 | title | 日志 | `workbench-view.title.129` |
| 130 | 802 | title | 记录操作与错误 | `workbench-view.title.130` |
| 131 | 802 | title | 可按级别筛选 | `workbench-view.title.131` |
| 132 | 802 | title | 可复制或清空 | `workbench-view.title.132` |
| 133 | 827 | title | 选择目标平台 | `workbench-view.title.133` |
| 134 | 827 | title | 四个酒馆的英文全称，带各自图标；当前宿主那一项后面标（宿主）。 | `workbench-view.title.134` |
| 135 | 828 | title | 看存储图表 | `workbench-view.title.135` |
| 136 | 828 | title | 没有数据包时显示宿主；点包卡即切换成该包的图表。 | `workbench-view.title.136` |
| 137 | 829 | title | 精简勾选 | `workbench-view.title.137` |
| 138 | 829 | title | 建议保留用宿主下划线色，可选用引用色，建议清理用强调灰。备份、缓存、构建默认不勾。 | `workbench-view.title.138` |
| 139 | 830 | title | 覆盖或增量 | `workbench-view.title.139` |
| 140 | 830 | title | 差量不是独立区域，就在图表顶部切换。 | `workbench-view.title.140` |
| 141 | 831 | title | 不分卷 | `workbench-view.title.141` |
| 142 | 831 | title | 单位 MB，单卷限 32–2048 MB；留空即不分卷。填了之后图表会按卷变成多张。 | `workbench-view.title.142` |
| 143 | 832 | title | 生成导出包 | `workbench-view.title.143` |
| 144 | 832 | title | 把当前勾选落到包，并复制一份只读副本到导出区。 | `workbench-view.title.144` |
| 145 | 833 | title | 导出完成 | `workbench-view.title.145` |
| 146 | 833 | title | 导出区只读，可下载、回传宿主，或复制回导入区再编辑。 | `workbench-view.title.146` |
| 147 | 836 | title | 上传数据包 | `workbench-view.title.147` |
| 148 | 836 | title | 点选或拖入一个 zip 作为数据包。 | `workbench-view.title.148` |
| 149 | 837 | title | 逐项确认勾选 | `workbench-view.title.149` |
| 150 | 837 | title | 展开大类逐个确认：绿是建议保留、橙是可选、灰是建议清理。 | `workbench-view.title.150` |
| 151 | 838 | title | 选目标平台 | `workbench-view.title.151` |
| 152 | 838 | title | 四个英文全称，当前宿主那一项带（宿主）标记。 | `workbench-view.title.152` |
| 153 | 839 | title | 要不要分卷 | `workbench-view.title.153` |
| 154 | 839 | title | 单卷 32–2048 MB；填了会按卷拆成多个可独立导入的包。 | `workbench-view.title.154` |
| 155 | 840 | title | 生成并核对 | `workbench-view.title.155` |
| 156 | 840 | title | 导出区出现只读副本，可下载、回传宿主或复制回导入区。 | `workbench-view.title.156` |
| 157 | 856 | text | 完成 | `workbench-view.text.157` |
| 158 | 856 | text | 下一步 | `workbench-view.text.158` |
| 159 | 857 | text | 基础教程 | `workbench-view.text.159` |
| 160 | 857 | text | 进阶教程 | `workbench-view.text.160` |
| 161 | 953 | log | 目标平台切换为 | `workbench-view.log.161` |
| 162 | 962 | log | 导出方式: | `workbench-view.log.162` |
| 163 | 962 | log | 覆盖 | `workbench-view.log.163` |
| 164 | 962 | log | 增量 | `workbench-view.log.164` |
| 165 | 975 | toast | 单卷容量限定 | `workbench-view.toast.165` |
| 166 | 1041 | log | 批量 | `workbench-view.log.166` |
| 167 | 1041 | log | 全选 | `workbench-view.log.167` |
| 168 | 1041 | log | 全不选 | `workbench-view.log.168` |
| 169 | 1041 | log | 反选 | `workbench-view.log.169` |
| 170 | 1041 | log | 个包 | `workbench-view.log.170` |
| 171 | 1058 | toast | 已下载 | `workbench-view.toast.171` |
| 172 | 1058 | toast | 已开始下载 | `workbench-view.toast.172` |
| 173 | 1073 | toast | 图表已切换到该包 | `workbench-view.toast.173` |
| 174 | 1089 | toast | 日志已复制 | `workbench-view.toast.174` |
| 175 | 1089 | toast | 复制失败 | `workbench-view.toast.175` |
| 176 | 1097 | toast | 教程完成 | `workbench-view.toast.176` |

### src/ui/export-queue.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 80 | text | 上传 | `export-queue.text.001` |
| 2 | 81 | text | 宿主导出 | `export-queue.text.002` |
| 3 | 82 | text | 转换生成 | `export-queue.text.003` |
| 4 | 83 | text | 增量补丁 | `export-queue.text.004` |
| 5 | 84 | text | 分卷 | `export-queue.text.005` |
| 6 | 85 | text | 源备份 | `export-queue.text.006` |
| 7 | 86 | text | 目标保底备份 | `export-queue.text.007` |
| 8 | 87 | text | 迁移报告 | `export-queue.text.008` |
| 9 | 300 | title | 已有恢复任务正在进行，请等待其完成 | `export-queue.title.009` |
| 10 | 308 | title | <span class="eq-title"><i class="fa-solid fa-file-export"></i> 待导出 ( | `export-queue.title.010` |
| 11 | 322 | markup | <i class="fa-solid fa-download"></i> 全部下载 | `export-queue.markup.011` |
| 12 | 323 | markup | <i class="fa-solid fa-box-archive"></i> 全部存入工作区 | `export-queue.markup.012` |
| 13 | 327 | markup | <i class="fa-solid fa-trash"></i> 清空 | `export-queue.markup.013` |
| 14 | 328 | modal | 确定清空待导出区吗？临时产物将一并丢弃。 | `export-queue.modal.014` |
| 15 | 352 | text | 确定取消正在进行的恢复写入吗？\n宿主可能已收到部分数据，取消后请核对数据完整性。 | `export-queue.text.015` |
| 16 | 362 | text | 已完成 | `export-queue.text.016` |
| 17 | 362 | text | （部分数据已生效） | `export-queue.text.017` |
| 18 | 365 | markup | <i class="fa-solid fa-ban"></i> 取消批量恢复 | `export-queue.markup.018` |
| 19 | 366 | text | 中止本批恢复（宿主可能已收到部分数据，取消后请核对） | `export-queue.text.019` |
| 20 | 372 | text | 全部 | `export-queue.text.020` |
| 21 | 372 | text | 项恢复完成 | `export-queue.text.021` |
| 22 | 373 | text | 已中止：完成 | `export-queue.text.022` |
| 23 | 373 | text | （部分数据已生效） | `export-queue.text.023` |
| 24 | 375 | text | 完成 | `export-queue.text.024` |
| 25 | 376 | text | 项失败 | `export-queue.text.025` |
| 26 | 377 | modal | 项结果未确认 | `export-queue.modal.026` |
| 27 | 378 | text | 部分数据已生效 | `export-queue.text.027` |
| 28 | 383 | markup | <i class="fa-solid fa-rotate-right"></i> 重试失败项 | `export-queue.markup.028` |
| 29 | 384 | text | 只重跑失败项；结果未确认的项不重跑（请求可能已落盘，重跑会重复写入） | `export-queue.text.029` |
| 30 | 390 | markup | <i class="fa-solid fa-rotate"></i> 刷新页面生效 | `export-queue.markup.030` |
| 31 | 391 | text | 点击后才刷新页面，让宿主重新加载已恢复的数据 | `export-queue.text.031` |
| 32 | 410 | markup | <i class="fa-solid fa-ban"></i> 取消恢复 | `export-queue.markup.032` |
| 33 | 411 | text | 中止正在进行的恢复写入（宿主可能已收到部分数据，取消后请核对） | `export-queue.text.033` |
| 34 | 414 | text | 恢复写入进行中… | `export-queue.text.034` |
| 35 | 423 | text | 无产物 | `export-queue.text.035` |
| 36 | 445 | text | 已选 | `export-queue.text.036` |
| 37 | 445 | text | 项: | `export-queue.text.037` |
| 38 | 447 | markup | <i class="fa-solid fa-download"></i> 下载 | `export-queue.markup.038` |
| 39 | 450 | markup | <i class="fa-solid fa-folder-open"></i> 选位置导出 | `export-queue.markup.039` |
| 40 | 450 | text | 逐个弹出保存位置 (浏览器不支持时普通下载) | `export-queue.text.040` |
| 41 | 456 | markup | <i class="fa-solid fa-box-archive"></i> 存工作区 | `export-queue.markup.041` |
| 42 | 464 | markup | <i class="fa-solid fa-rotate"></i> 写回宿主 | `export-queue.markup.042` |
| 43 | 479 | markup | <i class="fa-solid fa-trash"></i> 移除 | `export-queue.markup.043` |
| 44 | 505 | markup | <span class="eq-stored">已入库</span> | `export-queue.markup.044` |
| 45 | 506 | markup | <span class="eq-ephemeral">临时</span> | `export-queue.markup.045` |
| 46 | 532 | text | 下载 | `export-queue.text.046` |
| 47 | 533 | text | 选位置导出 | `export-queue.text.047` |
| 48 | 533 | text | 选择保存位置写出该文件 | `export-queue.text.048` |
| 49 | 534 | text | 存工作区 | `export-queue.text.049` |
| 50 | 541 | markup | <i class="fa-solid fa-rotate"></i> 写回宿主 | `export-queue.markup.050` |
| 51 | 548 | text | 移除 | `export-queue.text.051` |
| 52 | 571 | title | 展开 | `export-queue.title.052` |
| 53 | 571 | title | 收起 | `export-queue.title.053` |
| 54 | 578 | title | 展开 | `export-queue.title.054` |
| 55 | 578 | title | 收起 | `export-queue.title.055` |
| 56 | 584 | title | 组内全选 | `export-queue.title.056` |
| 57 | 607 | text | 项 · | `export-queue.text.057` |

### src/ui/lan-transfer-panel.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 68 | text | sha256 不可用（无 crypto.subtle） | `lan-transfer-panel.text.001` |
| 2 | 73 | text | sha256 失败 | `lan-transfer-panel.text.002` |
| 3 | 167 | text | 超时 | `lan-transfer-panel.text.003` |
| 4 | 203 | text | 请改用导出文件再手动传入 | `lan-transfer-panel.text.004` |
| 5 | 204 | text | 请改用导出文件再手动传入 | `lan-transfer-panel.text.005` |
| 6 | 219 | text | 连接已关闭 | `lan-transfer-panel.text.006` |
| 7 | 231 | text | 连接失败 | `lan-transfer-panel.text.007` |
| 8 | 234 | text | 连接中断 | `lan-transfer-panel.text.008` |
| 9 | 254 | text | · 剩余 | `lan-transfer-panel.text.009` |
| 10 | 259 | text | 二维码库不可用 | `lan-transfer-panel.text.010` |
| 11 | 268 | text | 失败 | `lan-transfer-panel.text.011` |
| 12 | 272 | log | 局域网发送失败： | `lan-transfer-panel.log.012` |
| 13 | 279 | text | 已发送 | `lan-transfer-panel.text.013` |
| 14 | 283 | log | 局域网发送完成： | `lan-transfer-panel.log.014` |
| 15 | 299 | text | 已连接，准备传输 | `lan-transfer-panel.text.015` |
| 16 | 301 | text | 通道已关闭 | `lan-transfer-panel.text.016` |
| 17 | 302 | text | 通道错误 | `lan-transfer-panel.text.017` |
| 18 | 309 | text | 对端核对失败 | `lan-transfer-panel.text.018` |
| 19 | 314 | text | 没有可发送的包 | `lan-transfer-panel.text.019` |
| 20 | 323 | text | 第 | `lan-transfer-panel.text.020` |
| 21 | 323 | text | 个 · | `lan-transfer-panel.text.021` |
| 22 | 325 | text | 准备中 | `lan-transfer-panel.text.022` |
| 23 | 340 | text | 取件码已过期 | `lan-transfer-panel.text.023` |
| 24 | 353 | text | 把取件码交给对方 | `lan-transfer-panel.text.024` |
| 25 | 357 | log | 取件码已生成： | `lan-transfer-panel.log.025` |
| 26 | 363 | text | 通道未建立 | `lan-transfer-panel.text.026` |
| 27 | 366 | text | 通道未打开 | `lan-transfer-panel.text.027` |
| 28 | 371 | text | 传输中 | `lan-transfer-panel.text.028` |
| 29 | 387 | text | 续传中 | `lan-transfer-panel.text.029` |
| 30 | 390 | text | 已取消 | `lan-transfer-panel.text.030` |
| 31 | 391 | text | 通道已关闭 | `lan-transfer-panel.text.031` |
| 32 | 398 | text | 通道已关闭 | `lan-transfer-panel.text.032` |
| 33 | 402 | text | 传输中 | `lan-transfer-panel.text.033` |
| 34 | 407 | text | 等待对端核对 | `lan-transfer-panel.text.034` |
| 35 | 415 | text | 等待对端确认超时 | `lan-transfer-panel.text.035` |
| 36 | 418 | modal | 对端未确认 | `lan-transfer-panel.modal.036` |
| 37 | 420 | text | 摘要一致 | `lan-transfer-panel.text.037` |
| 38 | 420 | text | 仅核对大小 | `lan-transfer-panel.text.038` |
| 39 | 425 | toast | 正在传输，请先取消或完成当前任务 | `lan-transfer-panel.toast.039` |
| 40 | 430 | toast | 读取包失败： | `lan-transfer-panel.toast.040` |
| 41 | 433 | toast | 先在数据包区勾选要发送的包 | `lan-transfer-panel.toast.041` |
| 42 | 442 | toast | 已完成，再传请重新生成取件码 | `lan-transfer-panel.toast.042` |
| 43 | 443 | toast | 先生成取件码 | `lan-transfer-panel.toast.043` |
| 44 | 453 | text | 不是应答码 | `lan-transfer-panel.text.044` |
| 45 | 458 | text | 连接中 | `lan-transfer-panel.text.045` |
| 46 | 459 | text | 应用应答码 | `lan-transfer-panel.text.046` |
| 47 | 472 | text | 已取消 | `lan-transfer-panel.text.047` |
| 48 | 474 | log | 局域网发送已取消 | `lan-transfer-panel.log.048` |
| 49 | 493 | text | 失败 | `lan-transfer-panel.text.049` |
| 50 | 494 | text | · 已收 | `lan-transfer-panel.text.050` |
| 51 | 498 | log | 局域网接收失败： | `lan-transfer-panel.log.051` |
| 52 | 506 | text | 落盘不可用 | `lan-transfer-panel.text.052` |
| 53 | 511 | text | 落盘失败 | `lan-transfer-panel.text.053` |
| 54 | 518 | text | digest 计算失败 | `lan-transfer-panel.text.054` |
| 55 | 531 | text | 核对失败 | `lan-transfer-panel.text.055` |
| 56 | 543 | text | 已接收 · 摘要一致 | `lan-transfer-panel.text.056` |
| 57 | 543 | text | 已接收 · 仅核对大小 | `lan-transfer-panel.text.057` |
| 58 | 544 | text | 正在保存 | `lan-transfer-panel.text.058` |
| 59 | 553 | log | 局域网接收完成： | `lan-transfer-panel.log.059` |
| 60 | 555 | text | 已接收但入库失败 | `lan-transfer-panel.text.060` |
| 61 | 556 | log | 接收包入库失败： | `lan-transfer-panel.log.061` |
| 62 | 583 | text | 接收中 | `lan-transfer-panel.text.062` |
| 63 | 592 | text | 续传中 | `lan-transfer-panel.text.063` |
| 64 | 592 | text | 接收中 | `lan-transfer-panel.text.064` |
| 65 | 598 | text | 落盘不可用 | `lan-transfer-panel.text.065` |
| 66 | 612 | text | 对方已取消 | `lan-transfer-panel.text.066` |
| 67 | 617 | text | 已连接，等待数据 | `lan-transfer-panel.text.067` |
| 68 | 618 | text | 通道已关闭 | `lan-transfer-panel.text.068` |
| 69 | 619 | text | 通道错误 | `lan-transfer-panel.text.069` |
| 70 | 630 | text | chunk dropped: sink 不可用 | `lan-transfer-panel.text.070` |
| 71 | 636 | text | 接收中 | `lan-transfer-panel.text.071` |
| 72 | 649 | toast | 正在接收，请先放弃当前任务 | `lan-transfer-panel.toast.072` |
| 73 | 651 | toast | 先粘贴取件码 | `lan-transfer-panel.toast.073` |
| 74 | 658 | text | 解析取件码 | `lan-transfer-panel.text.074` |
| 75 | 667 | text | 不是取件码 | `lan-transfer-panel.text.075` |
| 76 | 683 | text | 应用取件码 | `lan-transfer-panel.text.076` |
| 77 | 697 | text | 把应答码回传，将从断点继续 | `lan-transfer-panel.text.077` |
| 78 | 697 | text | 把应答码回传给对方 | `lan-transfer-panel.text.078` |
| 79 | 702 | log | 应答码已生成： | `lan-transfer-panel.log.079` |
| 80 | 718 | text | 半成品已放弃 | `lan-transfer-panel.text.080` |
| 81 | 719 | log | 局域网接收半成品已放弃 | `lan-transfer-panel.log.081` |

### src/ui/host-bridge.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 139 | text | 本宿主未提供整包恢复接口（已探测： | `host-bridge.text.001` |
| 2 | 140 | text | 请改用宿主原生的导入方式恢复数据包。 | `host-bridge.text.002` |
| 3 | 174 | text | 恢复数据包至宿主 | `host-bridge.text.003` |
| 4 | 182 | text | 恢复端点不可用，尝试下一候选： | `host-bridge.text.004` |
| 5 | 302 | text | 宿主透传勾选 | `host-bridge.text.005` |
| 6 | 302 | text | 全量导出后插件内过滤 | `host-bridge.text.006` |
| 7 | 318 | text | 将拉取 | `host-bridge.text.007` |
| 8 | 318 | text | 类目 · | `host-bridge.text.008` |
| 9 | 378 | title | 数据包转运 | `host-bridge.title.009` |
| 10 | 416 | modal | [ST-pack-transfer] 宿主原生确认弹窗不可用，降级为原生 confirm： | `host-bridge.modal.010` |
| 11 | 454 | text | [ST-pack-transfer] 宿主原生信息弹窗不可用，降级为原生 alert： | `host-bridge.text.011` |
| 12 | 493 | text | [ST-pack-transfer] 宿主存储面板模块不可用，降级隐藏入口： | `host-bridge.text.012` |
| 13 | 539 | text | [ST-pack-transfer] 唤起宿主存储面板失败： | `host-bridge.text.013` |
| 14 | 562 | text | 服务端 /version 校验不可达 ( | `host-bridge.text.014` |
| 15 | 562 | text | )，保留前端判定: | `host-bridge.text.015` |
| 16 | 597 | text | 宿主类型前端判定 ( | `host-bridge.text.016` |
| 17 | 597 | text | ) 与服务端校验 ( | `host-bridge.text.017` |
| 18 | 597 | text | ) 不一致，以服务端为准。版本: | `host-bridge.text.018` |
| 19 | 599 | text | 宿主类型服务端校验一致: | `host-bridge.text.019` |
| 20 | 599 | text | (版本: | `host-bridge.text.020` |
| 21 | 627 | text | 宿主类型为 Luker，但导出数据包缺少 manifest.json —— 宿主识别可能有误，请检查宿主徽标 | `host-bridge.text.021` |
| 22 | 629 | text | 宿主类型为 ST，但导出数据包含 manifest.json —— 宿主识别可能有误，请检查宿主徽标 | `host-bridge.text.022` |
| 23 | 632 | text | 导出包形状软校验跳过: | `host-bridge.text.023` |
| 24 | 663 | text | 获取 CSRF token | `host-bridge.text.024` |
| 25 | 665 | text | 获取 CSRF token 失败: | `host-bridge.text.025` |
| 26 | 682 | text | 获取当前用户 | `host-bridge.text.026` |
| 27 | 684 | text | 获取当前用户失败: | `host-bridge.text.027` |
| 28 | 715 | text | OPFS 临时文件句柄获取失败 ( | `host-bridge.text.028` |
| 29 | 715 | text | )，回退内存模式 | `host-bridge.text.029` |
| 30 | 730 | text | OPFS 临时包已清理: | `host-bridge.text.030` |
| 31 | 791 | text | 探测 Authority 增强通道 | `host-bridge.text.031` |
| 32 | 796 | text | Authority 选择性备份 | `host-bridge.text.032` |
| 33 | 796 | text | 无 stBackup 标记 | `host-bridge.text.033` |
| 34 | 798 | text | Authority 不可达 | `host-bridge.text.034` |
| 35 | 806 | text | 正在连接宿主 [ | `host-bridge.text.035` |
| 36 | 806 | text | ] 获取授权凭证... | `host-bridge.text.036` |
| 37 | 816 | text | 向宿主发起数据包导出请求 (用户: | `host-bridge.text.037` |
| 38 | 860 | text | Authority 增强通道不可用 ( | `host-bridge.text.038` |
| 39 | 860 | text | )，回退宿主原生全量拉取 | `host-bridge.text.039` |
| 40 | 879 | text | 备份请求失败 ( | `host-bridge.text.040` |
| 41 | 880 | text | 宿主数据包导出失败 | `host-bridge.text.041` |
| 42 | 891 | text | 宿主支持 Range 续传，从断点 | `host-bridge.text.042` |
| 43 | 891 | text | 处继续接收 | `host-bridge.text.043` |
| 44 | 894 | text | 宿主端点不支持 Range 续传（响应非 206），半成品作废，整包重拉 | `host-bridge.text.044` |
| 45 | 912 | text | OPFS 可用，数据包流式直写临时文件: fetch-tmp/ | `host-bridge.text.045` |
| 46 | 939 | text | 接收宿主数据包 | `host-bridge.text.046` |
| 47 | 961 | text | 数据包传输中: | `host-bridge.text.047` |
| 48 | 966 | text | 数据包传输中: 已接收 | `host-bridge.text.048` |
| 49 | 974 | text | 成功从宿主拉取数据包 (OPFS 直写)，大小: | `host-bridge.text.049` |
| 50 | 1000 | text | 传输被暂停/中止，OPFS 半成品已保留: fetch-tmp/ | `host-bridge.text.050` |
| 51 | 1011 | text | 成功从宿主拉取数据包，大小: | `host-bridge.text.051` |
| 52 | 1044 | text | 当前宿主不支持读取用户清单 | `host-bridge.text.052` |
| 53 | 1050 | text | 宿主未返回可读数据包 | `host-bridge.text.053` |
| 54 | 1054 | text | 目标预检：读取到宿主清单 | `host-bridge.text.054` |
| 55 | 1054 | text | 条 | `host-bridge.text.055` |
| 56 | 1059 | text | 目标预检未能读取宿主清单（ | `host-bridge.text.056` |
| 57 | 1059 | text | ），本次按「冲突状态未知」处理 | `host-bridge.text.057` |
| 58 | 1084 | text | 已有恢复任务正在进行，请等待其完成后再试 | `host-bridge.text.058` |
| 59 | 1115 | text | 准备向宿主 [ | `host-bridge.text.059` |
| 60 | 1115 | text | ] 恢复写入数据包 (模式: | `host-bridge.text.060` |
| 61 | 1140 | text | 读取恢复错误响应 | `host-bridge.text.061` |
| 62 | 1146 | text | 恢复失败 ( | `host-bridge.text.062` |
| 63 | 1147 | text | 恢复数据包至宿主酒馆失败 | `host-bridge.text.063` |
| 64 | 1155 | text | 读取恢复结果 | `host-bridge.text.064` |
| 65 | 1159 | text | 宿主恢复响应体读取失败，无法确认结果（请求已发出）: | `host-bridge.text.065` |
| 66 | 1160 | modal | 响应体不可解析 | `host-bridge.modal.066` |
| 67 | 1167 | text | 宿主未写入任何条目：restored | `host-bridge.text.067` |
| 68 | 1168 | text | （请核对包的类目是否被宿主接受） | `host-bridge.text.068` |
| 69 | 1170 | text | 宿主恢复条目计数：restored | `host-bridge.text.069` |
| 70 | 1174 | text | 数据包恢复至当前用户 ( | `host-bridge.text.070` |
| 71 | 1174 | text | ) 成功！模式: | `host-bridge.text.071` |
| 72 | 1191 | text | 检测到包内 | `host-bridge.text.072` |
| 73 | 1191 | text | 个扩展清单（可在线安装 | `host-bridge.text.073` |
| 74 | 1191 | text | 个），正在呼出扩展安装面板... | `host-bridge.text.074` |
| 75 | 1197 | text | 本包含 | `host-bridge.text.075` |
| 76 | 1197 | text | 个扩展，其中 0 个可在线安装 | `host-bridge.text.076` |
| 77 | 1200 | text | 如需重装，请从扩展设置抽屉手动开始。 | `host-bridge.text.077` |
| 78 | 1211 | text | 检查扩展清单失败 (非阻塞): | `host-bridge.text.078` |
| 79 | 1232 | text | 获取宿主扩展列表失败 (可能在独立环境运行): | `host-bridge.text.079` |
| 80 | 1263 | text | 安装失败 ( | `host-bridge.text.080` |
| 81 | 1293 | markup | 检测到宿主本地用户目录下存在错误的 third-party 嵌套文件夹 (data/<user>/extensions/third-party/)，会导致其下插件无法被酒馆正常识别。 | `host-bridge.markup.081` |
| 82 | 1397 | markup | <i class="fa-solid fa-puzzle-piece"></i> 扩展安装器 | `host-bridge.markup.082` |
| 83 | 1400 | markup | 数据包已恢复。以下扩展将由酒馆以 <strong>depth: 1</strong> 浅克隆在线拉取，保留一键更新能力。 | `host-bridge.markup.083` |
| 84 | 1403 | markup | <i class="fa-solid fa-circle-info"></i> 在线安装需要<b>网络连通</b>、宿主<b>扩展安装端点可用</b>（部分部署或权限配置会禁用它）， | `host-bridge.markup.084` |
| 85 | 1404 | markup | 且<b>扩展仓库可访问</b>（私有仓需手动处理）。 | `host-bridge.markup.085` |
| 86 | 1411 | markup | <button id="ext-select-missing" class="menu_button" style="padding: 4px 10px; font-size: 0.8rem; cursor: pointer;">仅选未安装</button> | `host-bridge.markup.086` |
| 87 | 1412 | markup | <button id="ext-select-all" class="menu_button" style="padding: 4px 10px; font-size: 0.8rem; cursor: pointer;">全选</button> | `host-bridge.markup.087` |
| 88 | 1413 | markup | <button id="ext-deselect-all" class="menu_button" style="padding: 4px 10px; font-size: 0.8rem; cursor: pointer;">全不选</button> | `host-bridge.markup.088` |
| 89 | 1417 | markup | <span>强制覆盖已有扩展</span> | `host-bridge.markup.089` |
| 90 | 1434 | markup | <span id="ext-progress-status" style="color: var(--SmartThemeQuoteColor, #f59e0b);">准备安装...</span> | `host-bridge.markup.090` |
| 91 | 1443 | markup | <button id="ext-btn-cancel" class="menu_button" style="padding: 8px 16px; cursor: pointer;">暂不安装</button> | `host-bridge.markup.091` |
| 92 | 1445 | markup | <i class="fa-solid fa-play"></i> <span>开始安装勾选项</span> | `host-bridge.markup.092` |
| 93 | 1448 | markup | <i class="fa-solid fa-rotate"></i> <span>刷新酒馆生效</span> | `host-bridge.markup.093` |
| 94 | 1496 | text | 未命名扩展 | `host-bridge.text.094` |
| 95 | 1508 | text | 包内已含 | `host-bridge.text.095` |
| 96 | 1511 | text | 无法在线安装 | `host-bridge.text.096` |
| 97 | 1514 | text | 本地已安装 | `host-bridge.text.097` |
| 98 | 1517 | text | 待安装 | `host-bridge.text.098` |
| 99 | 1531 | text | 无远程 URL | `host-bridge.text.099` |
| 100 | 1537 | text | 分支: | `host-bridge.text.100` |
| 101 | 1589 | text | 清理中... | `host-bridge.text.101` |
| 102 | 1597 | markup | <i class="fa-solid fa-circle-check"></i> <strong>已成功清理残留 third-party 目录！</strong> | `host-bridge.markup.102` |
| 103 | 1600 | text | 重试清理 | `host-bridge.text.103` |
| 104 | 1627 | log | 请至少勾选一个待安装的扩展 | `host-bridge.log.104` |
| 105 | 1652 | text | 正在浅克隆: | `host-bridge.text.105` |
| 106 | 1653 | text | 克隆中... | `host-bridge.text.106` |
| 107 | 1658 | text | 缺少有效的 Git HTTP(S) URL | `host-bridge.text.107` |
| 108 | 1665 | markup | <i class="fa-solid fa-circle-check" style="color: #a6e3a1;"></i> 已安装 | `host-bridge.markup.108` |
| 109 | 1669 | text | 安装失败 | `host-bridge.text.109` |
| 110 | 1671 | text | 扩展 | `host-bridge.text.110` |
| 111 | 1671 | text | 安装失败: | `host-bridge.text.111` |
| 112 | 1676 | text | 安装完成： | `host-bridge.text.112` |
| 113 | 1676 | text | 成功， | `host-bridge.text.113` |
| 114 | 1676 | text | 失败 | `host-bridge.text.114` |
| 115 | 1680 | text | 重试失败项 ( | `host-bridge.text.115` |
| 116 | 1689 | text | 全部 | `host-bridge.text.116` |
| 117 | 1689 | text | 个扩展安装成功！ | `host-bridge.text.117` |
| 118 | 1724 | text | 启动数据包增量合并 (Incremental Archive Merge)... | `host-bridge.text.118` |
| 119 | 1777 | text | 数据包增量合并完成: 共计 | `host-bridge.text.119` |
| 120 | 1777 | text | 个文件 (保留原有 | `host-bridge.text.120` |
| 121 | 1777 | text | 项，新增/更新 | `host-bridge.text.121` |
| 122 | 1777 | text | 项) | `host-bridge.text.122` |
| 123 | 1925 | title | 数据包转运 | `host-bridge.title.123` |
| 124 | 1936 | text | 打开面板 | `host-bridge.text.124` |
| 125 | 1937 | title | 打开数据包转运面板 | `host-bridge.title.125` |
| 126 | 2019 | text | 数据包转运 | `host-bridge.text.126` |
| 127 | 2020 | title | 打开数据包转运面板 | `host-bridge.title.127` |
| 128 | 2060 | text | 数据包转运 | `host-bridge.text.128` |
| 129 | 2061 | title | 打开数据包转运面板 | `host-bridge.title.129` |

### src/ui/chat-store-inject.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 116 | text | 未提供聊天索引能力(list) | `chat-store-inject.text.001` |
| 2 | 116 | text | 未提供聊天导出能力(export) | `chat-store-inject.text.002` |
| 3 | 118 | text | 检测到聊天库（模式 | `chat-store-inject.text.003` |
| 4 | 118 | text | ）但 | `chat-store-inject.text.004` |
| 5 | 118 | text | ⇒ 本次不补聊天（若为纯库模式，请在插件弹窗手动导出） | `chat-store-inject.text.005` |
| 6 | 125 | text | 聊天库索引不可用（ | `chat-store-inject.text.006` |
| 7 | 125 | text | ）⇒ 本次不补聊天 | `chat-store-inject.text.007` |
| 8 | 133 | text | 源包条目枚举失败： | `chat-store-inject.text.008` |
| 9 | 134 | text | 源包条目枚举失败（ | `chat-store-inject.text.009` |
| 10 | 134 | text | ）⇒ 本次不补聊天 | `chat-store-inject.text.010` |
| 11 | 143 | text | 源包已含全部库中聊天 | `chat-store-inject.text.011` |
| 12 | 144 | text | 聊天库检查完毕： | `chat-store-inject.text.012` |
| 13 | 144 | text | ⇒ 无需补齐 | `chat-store-inject.text.013` |
| 14 | 148 | text | 聊天库检测到 | `chat-store-inject.text.014` |
| 15 | 148 | text | 条源包缺失的聊天，开始导出： | `chat-store-inject.text.015` |
| 16 | 155 | text | 聊天补齐已被中止/暂停 | `chat-store-inject.text.016` |
| 17 | 166 | text | 全部条目导出失败 | `chat-store-inject.text.017` |
| 18 | 167 | text | 聊天库 | `chat-store-inject.text.018` |
| 19 | 167 | text | 条全部导出失败（首因： | `chat-store-inject.text.019` |
| 20 | 167 | text | ）⇒ 本次不补聊天 | `chat-store-inject.text.020` |
| 21 | 174 | text | 正在重写源包以并入聊天（源包 | `chat-store-inject.text.021` |
| 22 | 174 | text | MB，落点 | `chat-store-inject.text.022` |
| 23 | 181 | text | 增强失败： | `chat-store-inject.text.023` |
| 24 | 182 | text | 聊天补齐失败（ | `chat-store-inject.text.024` |
| 25 | 182 | text | ）⇒ 本次用原源包继续转换 | `chat-store-inject.text.025` |
| 26 | 189 | text | 已把 | `chat-store-inject.text.026` |
| 27 | 189 | text | 条库中聊天补入源包（落点 | `chat-store-inject.text.027` |
| 28 | 190 | text | ；另有 | `chat-store-inject.text.028` |
| 29 | 190 | text | 条导出失败 | `chat-store-inject.text.029` |
| 30 | 226 | text | 未检测到聊天库 | `chat-store-inject.text.030` |
| 31 | 231 | text | 聊天库未提供索引能力(list) | `chat-store-inject.text.031` |
| 32 | 231 | text | 聊天库未提供导出能力(export) | `chat-store-inject.text.032` |
| 33 | 237 | text | 库索引不可用： | `chat-store-inject.text.033` |
| 34 | 244 | text | 库中没有可导出的聊天（或聊天类目已关闭） | `chat-store-inject.text.034` |
| 35 | 247 | text | 聊天库导出： | `chat-store-inject.text.035` |
| 36 | 273 | text | 全部 | `chat-store-inject.text.036` |
| 37 | 273 | text | 条导出失败（首因： | `chat-store-inject.text.037` |
| 38 | 286 | text | 聊天库导出完成： | `chat-store-inject.text.038` |
| 39 | 286 | text | 条聊天 → | `chat-store-inject.text.039` |
| 40 | 286 | text | 目标包 | `chat-store-inject.text.040` |
| 41 | 287 | text | （另有 | `chat-store-inject.text.041` |
| 42 | 287 | text | 条导出失败） | `chat-store-inject.text.042` |
| 43 | 350 | text | 包内有 | `chat-store-inject.text.043` |
| 44 | 350 | text | 条聊天，但聊天库（模式 | `chat-store-inject.text.044` |
| 45 | 350 | text | ）未提供入库接入 API ⇒ | `chat-store-inject.text.045` |
| 46 | 351 | text | 这些聊天已落到磁盘；若处于纯库模式，请在插件弹窗用「转库」把它们录入数据库 | `chat-store-inject.text.046` |

### src/ui/chat-store-bridge.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 130 | text | 契约版本 | `chat-store-bridge.text.001` |
| 2 | 130 | text | 高于本端支持的 | `chat-store-bridge.text.002` |
| 3 | 130 | text | （形状未知） | `chat-store-bridge.text.003` |
| 4 | 131 | text | 未检测到聊天库接入 API | `chat-store-bridge.text.004` |
| 5 | 177 | text | list 能力不可用 | `chat-store-bridge.text.005` |
| 6 | 185 | text | listChats 超时 | `chat-store-bridge.text.006` |
| 7 | 185 | text | 聊天库 listChats 超时（ | `chat-store-bridge.text.007` |
| 8 | 185 | text | ms），本次按「不可用」处理 | `chat-store-bridge.text.008` |
| 9 | 194 | text | 聊天库 listChats 调用失败： | `chat-store-bridge.text.009` |
| 10 | 212 | text | export 能力不可用 | `chat-store-bridge.text.010` |
| 11 | 217 | text | 索引项缺 fileName | `chat-store-bridge.text.011` |
| 12 | 226 | text | exportChat 超时 | `chat-store-bridge.text.012` |
| 13 | 226 | text | 聊天库导出「 | `chat-store-bridge.text.013` |
| 14 | 226 | text | 」超时（ | `chat-store-bridge.text.014` |
| 15 | 226 | text | ms），跳过该条 | `chat-store-bridge.text.015` |
| 16 | 232 | text | exportChat 返回空 | `chat-store-bridge.text.016` |
| 17 | 232 | text | 聊天库导出「 | `chat-store-bridge.text.017` |
| 18 | 232 | text | 」返回空内容，跳过该条 | `chat-store-bridge.text.018` |
| 19 | 240 | text | 聊天库导出「 | `chat-store-bridge.text.019` |
| 20 | 240 | text | 」失败： | `chat-store-bridge.text.020` |
| 21 | 265 | text | import 能力不可用 | `chat-store-bridge.text.021` |
| 22 | 280 | text | 缺 fileName | `chat-store-bridge.text.022` |
| 23 | 311 | text | importChat 失败 | `chat-store-bridge.text.023` |
| 24 | 311 | text | 条 | `chat-store-bridge.text.024` |
| 25 | 312 | text | 聊天入库：成功 | `chat-store-bridge.text.025` |
| 26 | 312 | text | 条，失败 | `chat-store-bridge.text.026` |
| 27 | 312 | text | 条（首因： | `chat-store-bridge.text.027` |
| 28 | 314 | text | 聊天入库：成功 | `chat-store-bridge.text.028` |
| 29 | 314 | text | 条 | `chat-store-bridge.text.029` |

### src/ui/qr.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 18 | text | 无 document | `qr.text.001` |
| 2 | 23 | text | 二维码库加载失败 | `qr.text.002` |
| 3 | 31 | text | 无 window | `qr.text.003` |
| 4 | 38 | text | 二维码编码库不可用 | `qr.text.004` |
| 5 | 39 | text | 二维码解码库不可用 | `qr.text.005` |
| 6 | 68 | text | 二维码库不可用 | `qr.text.006` |
| 7 | 72 | text | 扫码画布不可用 | `qr.text.007` |
| 8 | 76 | text | 当前环境不支持摄像头 | `qr.text.008` |
| 9 | 84 | text | 相机不可用： | `qr.text.009` |
| 10 | 84 | text | 权限被拒绝 | `qr.text.010` |

### src/app/task-runtime.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 122 | text | [转换] 暂停收尾未产出半成品 ⇒ 续传将重做整包（产物仍会完整） | `task-runtime.text.001` |
| 2 | 127 | text | [转换] 环境不支持 OPFS，无法保留半成品 ⇒ 续传将重做整包（产物仍会完整） | `task-runtime.text.002` |
| 3 | 131 | text | [转换] 存储配额不足，跳过半成品持久化 ⇒ 续传将重做整包（产物仍会完整） | `task-runtime.text.003` |
| 4 | 139 | text | [转换] 半成品文件句柄获取失败 ⇒ 续传将重做整包（产物仍会完整） | `task-runtime.text.004` |
| 5 | 146 | text | [转换] 半成品落盘失败 ⇒ 续传将重做整包（产物仍会完整）: | `task-runtime.text.005` |
| 6 | 155 | text | [转换] 已保留半成品 | `task-runtime.text.006` |
| 7 | 155 | text | 条）—— 续传将原样搬运它，不重压缩、不丢条目 | `task-runtime.text.007` |
| 8 | 228 | text | （沿用断点跳过 | `task-runtime.text.008` |
| 9 | 228 | text | 项） | `task-runtime.text.009` |
| 10 | 338 | text | 断点记 | `task-runtime.text.010` |
| 11 | 338 | text | 个已完成产物，内存队列里只有 | `task-runtime.text.011` |
| 12 | 338 | text | 个 | `task-runtime.text.012` |
| 13 | 339 | text | （产物已不在内存：可能被移除，或页面已重载过） | `task-runtime.text.013` |
| 14 | 383 | text | 已被占用，跳过挂载（不覆盖既有对象） | `task-runtime.text.014` |

### src/storage/db.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 133 | text | 打开 IndexedDB 失败: | `db.text.001` |

### src/storage/authority-store.js

| # | 行 | 类型 | 现文案 | 建议 key |
| ---: | ---: | --- | --- | --- |
| 1 | 34 | text | 数据包转运 | `authority-store.text.001` |
| 2 | 43 | text | [authority-store] Authority 初始化失败，降级为本地存储: | `authority-store.text.002` |
| 3 | 116 | text | [authority-store] 断点清单 | `authority-store.text.003` |
| 4 | 116 | text | B 超 Authority KV 上限 | `authority-store.text.004` |
| 5 | 117 | text | ⇒ 剥掉条目台账后存 | `authority-store.text.005` |
| 6 | 117 | text | B（续传仍由半成品字节判定，不漏条目） | `authority-store.text.006` |
| 7 | 122 | text | [authority-store] 断点清单 | `authority-store.text.007` |
| 8 | 122 | text | B 精简后仍超 Authority KV 上限 | `authority-store.text.008` |
| 9 | 123 | text | ⇒ 本次跳过 Authority 持久化（内存断点仍可用于本会话续传） | `authority-store.text.009` |
| 10 | 388 | text | [authority-store] 产物已归档到 Authority: | `authority-store.text.010` |
| 11 | 388 | text | 块) | `authority-store.text.011` |
| 12 | 393 | text | [authority-store] 产物镜像失败（不影响本地入库）: | `authority-store.text.012` |

## 下一步

1. 人工评审：合并重复、统一术语、删除教学口吻与说明性整句。
2. 为每条确定最终 key（`area.component.element`）与 zh-CN / en-US 文案。
3. 按文件分批迁移到 `t()`，每批跑测试。
