# 滚动容器与拖拽分隔条契约

> 对应铁律 25（滚动容器唯一）与铁律 26（拖拽分隔条白名单）。
> 本文件只写**可判定的契约与判据**；事故叙事与历史过程不入本文件。

## 一、契约

### 1. 每视图唯一纵向滚动容器

| 形态 | 唯一纵向滚动容器 | 说明 |
| --- | --- | --- |
| 独立 Web | `.app-main` | 其余区域一律 `overflow: hidden` |
| 插件态（抽屉/模态） | `.app-main` | 同上 |
| 手机（≤ 竖屏断点） | `.app-main` | 必须能滚到最底部 |

禁止出现「父容器 `overflow: hidden` 覆盖子容器 `overflow: auto`」的组合——那会把唯一滚动容器废掉。

### 2. 禁止横向滚动

`overflow-x` 一律 `hidden`。任何 `overflow-x: auto / scroll` 即为缺陷。

### 3. 未溢出不得出条

`overflow: scroll` 禁用。只用 `auto` 或 `visible`。只有在内容确实溢出时才允许出现滚动条。

### 4. 滚动条统一细条

允许的两种，且全仓只准用这两种之一：

- `scrollbar-width: thin`
- `::-webkit-scrollbar { width: 6px }`

不得出现系统默认粗条与自定义细条混用。

### 5. 手机全高

必须 `height: 100dvh`，并保留 `100vh` 兜底（旧内核）。二者都缺时底部不可达即为缺陷。

### 6. 拖拽分隔条白名单

只允许存在于：

1. 图表与图表之间
2. 存储图表与数据包列表之间

每个分隔条必须在 `style.css` 有唯一已登记类名；手机端**禁用拖拽手柄**（布局保留、交互关闭）；新增类名必须同步模板源与 `CONTROL_CONSUMERS`。

## 二、已确认的现状偏差

| # | 位置 | 现象 | 违反 |
| --- | --- | --- | --- |
| 1 | `style.css:1732` | 手机断点 `.app-main { overflow: hidden }` 覆盖 `style.css:1591` 的 `overflow: auto` | 契约 1 |
| 2 | 三份规范文档 | 仍写「手机唯一滚动容器 = `.app-main`」，与上条实现直接矛盾 | 契约 1 |

> 另有若干处偏差（自定义滚动条宽度不统一、分隔条类名未登记）见 `H2-scroll-rules` 审计产出，修复时逐条勾销本表。

## 三、自查命令

```bash
# 1. overflow-x 不得出现 auto/scroll
git grep -nE 'overflow-<PATH>*(auto|scroll)' -- style.css src/

# 2. 禁用 overflow: scroll
git grep -nE 'overflow:\s*scroll' -- style.css src/

# 3. 滚动条宽度须为 thin 或 6px
git grep -nE 'scrollbar-width|::-webkit-scrollbar' -- style.css

# 4. 手机全高须 dvh + vh 兜底
git grep -nE '100dvh|100vh' -- style.css src/

# 5. 分隔条类名登记
git grep -nE 'resizer|splitter|divider' -- style.css src/ui/workbench-template.js
```

## 四、修复顺序

1. 先修契约 1（滚动容器被覆盖）——这是唯一会造成"内容滚不到"的功能性缺陷
2. 再统一滚动条宽度
3. 最后登记分隔条类名与手机端禁用
4. 改完同步三份仍写旧契约的规范文档
