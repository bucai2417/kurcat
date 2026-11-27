# 奶蛙 3D 作者模型

本目录是按用户提供的 [正、侧、背设计图](reference.png) 制作的 Blender 建模初版。黄色连续头身、奶油肚皮、绿色眼睛、橄榄色手脚；没有耳朵和尾巴。本版先完善自然站姿及连续、圆润的肩臂轮廓；已有坐姿键鼠动作保留作变形检查。

- [naiwa.blend](naiwa.blend)：可编辑源工程，含角色、64 根骨骼、形态键、7 段动画和摄影棚。
- [naiwa.glb](naiwa.glb)：角色、蒙皮、材质、表情与动画，供独立预览及后续接入。
- [validation.json](validation.json)：使用项目现有 Three.js 重新加载导出文件的检查结果。
- [制作与骨架说明](../../docs/naiwa-3d-design.md)：骨骼命名、IK 操作、表情控制、复现脚本及后续接入步骤。

已有开发服务中打开 `/naiwa3d.html`，可以旋转查看、切换动作、暂停、拖动时间轴、显示骨架和展开参考图。使用项目现有开发依赖即可，直接双击 HTML 无法加载 TypeScript。2D 动作预览为 `/harness.html?breed=builtin-naiwa&idle=0`。

## 造型预览

以下是源工程真实渲染图。Blender 工程停在第 0 帧自然站姿，HTML 也默认展示站姿；Blender 从第 1 帧开始播放已有动作。

![自然站姿](previews/standing.png)

| 正面 | 侧面 | 背面 |
| --- | --- | --- |
| ![站姿正面](previews/front.png) | ![站姿侧面](previews/side.png) | ![站姿背面](previews/back.png) |

| 坐姿呼吸 | 使用鼠标 | 招手 |
| --- | --- | --- |
| ![坐姿](previews/seated.png) | ![鼠标动作](previews/mouse.png) | ![招手](previews/wave.png) |

| 坐着打盹与流口水 | 生气鼓腮与跺脚 |
| --- | --- |
| ![睡觉](previews/nap.png) | ![生气](previews/angry.png) |

## 导出复查

以下两张图来自新场景重新导入 GLB 后的渲染，用于核对导出后的蒙皮、表情和动画。不是用源工程截图替代导出结果。

| GLB 睡觉 | GLB 招手 |
| --- | --- |
| ![GLB 睡觉](previews/export-nap.png) | ![GLB 招手](previews/export-wave.png) |

动作包含 `idle`、`typing`、`mouse`、`sway`、`wave`、`nap`、`angry`。完整动作在 Blender 或 HTML 中查看；静态图只能展示一个时间点。

## 当前边界

这是可编辑的造型与骨架基础，肩部、手指、接触和参考图还原度仍可继续精修。当前网格是作者密度，尚未完成移动端减面和帧率测试。桌宠内的奶蛙仍是 2D；外部 GLB 导入、3D 奶蛙运行时适配和五种真实道具动作尚未接入，不能把此 GLB 当作现有 `.kurocat.json` 配色包导入。

参考图和角色设计权利归原权利人。将参考图随作者文件保存是为了模型对照，不表示授予原设计或参考图的额外版权许可。
