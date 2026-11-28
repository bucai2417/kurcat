# 发布猫咪模型

此目录是桌宠“模型库”的默认公开来源。版本 1 是内置 2D / 3D 模型外观包；版本 2 可引用自包含 GLB，包含网格、骨架、贴图与实际动画片段。VRM / Live2D 暂不支持。

1. 在桌宠“模型库”导出 `.kurocat.json` 文件。
2. 用文本编辑器或 GitHub 编辑文件，检查模型 ID、名称和配色，可补充 `profile.author`、`license`、`description`，以及 `revision: 1`。
3. 将文件上传到本目录顶层，并提交到 `main`。只上传或修改模型包，`catalog.json` 会由 **Publish model catalog** 工作流生成。
4. 等待 Actions 成功后，在桌宠的 GitHub 模型库点击“加载 / 刷新”。

更新模型：保持 `skin.id` 不变，提高 `profile.revision` 并替换原文件。不要另传一个相同 ID 的副本；不同文件有相同 ID 会阻止目录发布。

下架模型：在 GitHub 删除对应 `.kurocat.json`，等待工作流更新目录。已下载的副本和本机导出文件会保留；本机卸载请在桌宠模型列表中删除。

示例：[薄荷云朵外观包](mint-cloud.kurocat.json)、[3D 奶蛙 GLB 清单](naiwa-3d.kurocat.json)。所有 JSON 使用 UTF-8；商城清单、生成目录都不能超过 256 KiB，最多 50 个模型。GLB 单独存储，二进制上限 16 MiB；使用 `asset.url` 指向固定提交的 GitHub Raw 文件并填写 SHA-256，目录不允许内嵌 Base64。UI 导出的离线版本 2 包可内嵌 GLB，上限 23 MiB。无效包不会替换线上目录。

如果自动提交被仓库权限或分支保护阻止，可以从工作流下载 `model-catalog` artifact，再正常提交其中的 `catalog.json`。也可用已有的 Node 22.15+ 运行：

```sh
node scripts/build-model-catalog.mjs
node scripts/build-model-catalog.mjs --check
```

这些命令不安装依赖、不编译桌宠。格式、动作契约与外部骨架规划参见 [模型接入文档](../docs/model-packs.md)。

## 键盘和鼠标

此目录同时接收 `.diycat.json` 键盘 / 鼠标外观包，目录任务会生成 `resources.json`。商城按类型和 2D / 3D 筛选，独立保存四个键鼠选择。请从 mint-keyboard / mint-mouse 示例开始，并阅读 [完整创作教程](../docs/RESOURCE_AUTHORING.md)。两个模式设计不同外观时使用不同 ID；同 ID 更新必须递增 revision。`space`、`esc` 等按键 ID 区分大小写。

`node scripts/check-resource-library.mjs` 验证资源与存储行为；`node scripts/build-model-catalog.mjs --check` 同时检查宠物、键鼠目录。键鼠资源格式暂不加载自定义网格；宠物 GLB 请使用版本 2 `.kurocat.json`。

3D 奶蛙清单修订 2 使用 `three-naiwa-v1` 实时控制：复用猫咪的键鼠、道具、头眼跟随和动作调度，坐姿尺寸固定。完整裸 GLB 也可自动识别；旧版作为通用 GLB 导入的奶蛙需重新导入，以更新适配器。它仍引用同一个作者 GLB，新行为由应用提供，旧应用不会因下载新清单而自动获得新行为。通用 `three-glb-v1` 继续只播放映射的实际片段。
