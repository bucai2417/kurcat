# 奶蛙分层素材

本目录素材依据用户提供的 1536 × 1024 奶蛙设计图提取，用于 DIY-Cat 的 `canvas-naiwa-v1` 绘制器。参考图及角色设计的权利归原权利人；本说明不另行授予原设计的版权许可。

| 文件 | 用途 |
| --- | --- |
| body.png | 连续头身轮廓，保留原图光影和肚皮；移除静态五官，以便独立绘制表情 |
| belly-mask.png | 肚皮换色分区，不改变身体透明度 |
| hand.png | 手掌与手指；手臂由运行时连续形变生成 |
| foot.png | 坐姿脚掌；普通键鼠输入由双手完成，只有原尾巴按键映射使用脚 |
| reference.webp | 缩小后的原设计图，供 HTML 预览对照 |
| artwork.json | 源图尺寸、裁剪范围、归一化坐标及部件说明 |

运行时由 [naiwaArtwork.ts](../../naiwaArtwork.ts) 解码素材并按模型配色保留明暗换色，最多缓存 12 套配色。默认配色直接使用提取素材。[naiwaRenderer.ts](../../naiwaRenderer.ts) 绘制坐姿身体、手脚、独立眼皮与嘴部；[naiwaDeform.ts](../../naiwaDeform.ts) 控制无固定肘部的软手臂和鼓脸轮廓。[naiwaPose.ts](../../naiwaPose.ts) 定义动作姿态通道，供后续适配器参考。

生气会平滑鼓起脸颊、压低眼皮、噘嘴和泛红，安抚后逐渐回落。手臂会随目标弯曲、伸缩和回弹，手掌接触点与中段形变分别处理，以保持键盘、鼠标和道具对位。

## 可选的素材提取

素材已经提交到仓库。运行应用、GitHub 构建和使用模型包都不需要 Python。只有重新处理同一张设计图时才使用作者工具，依赖 Pillow、NumPy、OpenCV 和 PySide6：

```sh
python scripts/extract-naiwa-art.py path/to/reference.png
```

脚本仅接受原尺寸 1536 × 1024 设计图，裁剪及遮罩位置针对该图设置，不能用来自动处理其他角色。执行会重写本目录生成素材，需在版本控制中审查差异。

## 预览与导入边界

已有开发预览服务中打开 `/harness.html?breed=builtin-naiwa&idle=0`，对照参考图测试双手敲键、点鼠标、原尾巴按键、鼓脸生气和五种道具。停止按钮会结束当前动作及道具交互。

当前模型包只导入配色和配置，不包含任意图片、骨架或动画。奶蛙仅支持 2D；没有 `three-naiwa-v1`、外部 GLB 或 Blender 动作导入功能。具体协议见 [模型包说明](../../../docs/model-packs.md)。
