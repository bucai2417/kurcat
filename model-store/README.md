# 发布猫咪模型

此目录是桌宠“模型库”的默认公开来源。模型是现有程序化 2D / 3D 猫咪的外观与能力声明，不是任意 GLB / VRM / Live2D 文件。

1. 在桌宠“模型库”导出 `.kurocat.json` 文件。
2. 用文本编辑器或 GitHub 编辑文件，检查模型 ID、名称和配色，可补充 `profile.author`、`license`、`description`，以及 `revision: 1`。
3. 将文件上传到本目录顶层，并提交到 `main`。只上传或修改模型包，`catalog.json` 会由 **Publish model catalog** 工作流生成。
4. 等待 Actions 成功后，在桌宠的 GitHub 模型库点击“加载 / 刷新”。

更新模型：保持 `skin.id` 不变，提高 `profile.revision` 并替换原文件。不要另传一个相同 ID 的副本；不同文件有相同 ID 会阻止目录发布。

下架模型：在 GitHub 删除对应 `.kurocat.json`，等待工作流更新目录。已下载的副本和本机导出文件会保留；本机卸载请在桌宠模型列表中删除。

包含一个示例：[薄荷云朵](mint-cloud.kurocat.json)。所有文件使用 UTF-8；单包、生成目录都不能超过 256 KiB，最多 50 个模型。无效包不会替换线上目录。

如果自动提交被仓库权限或分支保护阻止，可以从工作流下载 `model-catalog` artifact，再正常提交其中的 `catalog.json`。也可用已有的 Node 22.15+ 运行：

```sh
node scripts/build-model-catalog.mjs
node scripts/build-model-catalog.mjs --check
```

这些命令不安装依赖、不编译桌宠。格式、动作契约与外部骨架规划参见 [模型接入文档](../docs/model-packs.md)。

## 键盘和鼠标

此目录同时接收 `.diycat.json` 键盘 / 鼠标外观包，目录任务会生成 `resources.json`。商城按类型和 2D / 3D 筛选，独立保存四个键鼠选择。请从 mint-keyboard / mint-mouse 示例开始，并阅读 [完整创作教程](../docs/RESOURCE_AUTHORING.md)。两个模式设计不同外观时使用不同 ID；同 ID 更新必须递增 revision。`space`、`esc` 等按键 ID 区分大小写。

`node scripts/check-resource-library.mjs` 验证资源与存储行为；`node scripts/build-model-catalog.mjs --check` 同时检查宠物、键鼠目录。此格式暂不加载自定义网格或外部骨架。
