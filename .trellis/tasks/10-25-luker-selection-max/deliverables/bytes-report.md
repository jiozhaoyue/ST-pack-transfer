# Luker 拉取字节读数报告（AC-4 / 父任务 AC-5 实测数字）

> 任务 `10-25-luker-selection-max`。取证环境：Dev Luker 8003（Luker 2.7.0 @ `e1dbd1904`），
> 数据面 `data/default-user`（backups 2304MB / chats 671MB / extensions-data 643MB /
> extensions 482MB / user 154MB / characters 110MB 未压缩）。
> 完整方法与响应头证据见 `../research/luker-selection-probe.md`。

## 同勾选集「优化前 vs 优化后」对比

「极致省字节」在 Luker selection 契约内的**透传层无代码改动**（现状已忠实透传 10 键布尔，
R-B1 分支乙）。下表为「不同勾选集」的实测拉取字节，量化现状透传的**已生效收益**与
**契约瓶颈**：

| 勾选集（selection） | 实测拉取字节 | 相对全量 |
| --- | --- | --- |
| 全量（10 键 true，含 backups 892.2MB 绑定） | **1,794,066,397** | 基线 100% |
| 反选 `settings`（不含设置与备份） | **894,775,736** | **49.8%（省 50.2%）** |
| 反选 `extensions` | 1,448,149,954 | 80.7%（省 345.9MB） |
| 反选 `chats` | 1,567,132,325 | 87.4%（省 226.9MB） |
| 反选 `assets` | 1,634,856,144 | 91.1%（省 159.2MB） |
| 反选 `globalExtensions` | 1,714,545,035 | 95.6%（省 79.5MB） |
| 反选 `characters` | 1,731,258,521 | 96.5%（省 62.8MB） |
| 反选 `presets` | 1,781,654,777 | 99.3%（省 12.4MB） |
| 反选 `lorebooks` | 1,785,826,305 | 99.5%（省 8.2MB） |
| 反选 `secrets` / `vectors` | ≈基线 | 噪声级（<0.1MB） |

## 逐键字节映射（静态参考，每实例数据面不同）

| selection 键 | false 节省 | 包内目录映射 |
| --- | --- | --- |
| `settings` | **899.3MB** | `settings.json` 6.9 + **`backups/` 892.2（绑死）** |
| `extensions` | 345.9MB | `extensions/` |
| `chats` | 226.9MB | `chats/` |
| `assets` | 159.2MB | `user/` |
| `globalExtensions` | 79.5MB | `public/`（缺省=排除，唯一特例） |
| `characters` | 62.8MB | `characters/` + `OpenAI Settings/` |
| `presets` | 12.4MB | presets 系目录 |
| `lorebooks` | 8.2MB | `worlds/` |
| `secrets` / `vectors` | <0.1MB | `secrets.json` / 向量小文件 |

## 结论

1. **现状透传已生效**：用户反选类目 ⇒ 字节按上表实打实减少（fetchHostBackup 透传链路无损耗）。
2. **契约瓶颈（父 AC-5 答案）**：用户勾「设置」⇒ 被迫同拉 `backups/` 892.2MB（占全量 49.8%），
   selection 无分离开关；已在 R-B2（Authority PR）需求中登记解绑诉求。
3. 无 Content-Length（chunked 流式）⇒ 拉取前无法免费预估字节；静态映射表仅供开发参考，
   不进产品 UI（每实例数据面不同，静态值会误导）。
