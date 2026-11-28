# 3D 奶蛙：模型、骨架与后续接入

已制作可编辑的 **Blender 建模初版**，包含连续皮肤、80 根骨骼、表情形态键与 8 段动画。作品按用户最新提供的 [正 / 侧 / 背设计图](../art/naiwa/reference.png) 制作：黄色头身、奶油色肚皮、绿色眼睛、橄榄色手脚，没有耳朵和尾巴。本版优先调整自然站姿：缩短头颈、保留圆润头身和腋下空间，肩膀、手臂与掌心使用连续表面。Blender 与 HTML 均默认展示自然站姿；现有坐姿动作保留用于检查骨架变形，打盹保持坐姿。

**桌宠内置奶蛙仍使用 2D 的 `canvas-naiwa-v1`。** 本次 3D 文件可以在 Blender 编辑和独立网页预览；桌宠模型库的 GLB 导入、`three-naiwa-v1` 适配器和运行时道具对位尚未实现。共享契约继续将该适配器标记为 `not-implemented`。

## 文件与预览

| 文件 | 内容 |
| --- | --- |
| [naiwa.blend](../art/naiwa/naiwa.blend) | 独立工程，包含角色、骨架、形态键、NLA 动作与摄影棚；打开即为奶蛙站姿（第 0 帧），从第 1 帧可播放动作 |
| [naiwa.glb](../art/naiwa/naiwa.glb) | 角色、蒙皮、材质、形态键与 8 段动作，不包含摄影棚、灯光或相机 |
| [预览图](../art/naiwa/README.md) | 正面、侧面、背面及坐姿、鼠标、招手、睡觉、生气 |
| [validation.json](../art/naiwa/validation.json) | 用 Three.js 重载 GLB 后得到的权重、挂点、逐帧形变与表情检查结果 |
| [naiwa3d.html](../naiwa3d.html) | 独立 3D 查看页：动作切换、播放 / 暂停、时间轴、骨架、视角与设计图 |

已有开发依赖时运行 `npm run dev`，打开 `http://127.0.0.1:1420/naiwa3d.html`。此页使用项目内已有的 Three.js，不需要新依赖或打包；直接双击 HTML 无法加载 TypeScript。2D 预览为 `/harness.html?breed=builtin-naiwa&idle=0`，两页之间有链接。

3D 页的键盘、鼠标和小桌面仅是动作对位参考，可关闭；不是桌宠真实道具系统。页面默认选择“自然站姿”和正面视角，可随时切回站姿对照设计图。系统设置减少动态效果时，动画默认暂停。预览不播放声音。

## 网格与材质

头、身体、肩、手臂、掌心、手指和腿脚合为连续皮肤，避免独立球体或掌片随动画脱节。肚皮与手脚颜色来自同一表面的 2048 × 1024 内嵌 UV 贴图，避免肚皮边界随网格密度出现锯齿；眼球、瞳孔、眼皮、嘴和口水保留为独立可控制部件。肩和手腕的蒙皮权重经过平滑，每个顶点最多 4 个归一化影响。手臂权重依据腋下连通区域、躯干椭圆截面和骨段距离分配，避免把肚皮侧边拉向手腕；演示动作保持身体内部的前两段肩臂稳定，活动区域从腋下外侧开始。

当前导出约 **156,928 三角面、79,702 顶点、11 个网格、约 9.61 MB**，是供造型和动作审查的作者版本。肩部体积、手指轮廓与参考图仍有可精修空间；尚未完成面向低配置桌面或 Android 的重拓扑、LOD 与性能测量。后续建议从桌面 12k–20k、移动端 6k–10k 三角面尝试优化，最终预算由设备实测决定。

## 骨架控制

Blender 中选择 `Naiwa_Rig`，进入 Pose Mode。名称后缀 `.L` / `.R` 表示角色自身左右侧。源文件使用 Z 向上、-Y 朝前；导出 GLB 后为 Y 向上、+Z 朝前。

| 分组 | 骨骼 | 用途 |
| --- | --- | --- |
| 身体 | `root / pelvis / spine / chest / neck / head` | 全局定位、坐姿、左右倾斜、点头与头部表演 |
| 每侧软手臂 | `clavicle.L/R`，`arm01.L/R` 至 `arm14.L/R`，`hand.L/R` | 两段内侧肩根和十二段活动手臂，连续弯曲与伸缩，掌心朝向可单独调整 |
| 每侧手指 | `finger101 / finger102`、`finger201 / finger202`、`finger301 / finger302`、`thumb01 / thumb02`，各带左右后缀 | 三指与拇指独立弯曲，用于按键、握杯和招手 |
| 每侧腿脚 | `thigh.L/R / shin.L/R / foot.L/R`，`toe1.L/R` 至 `toe3.L/R` | 坐姿支撑、抬脚、跺脚和脚趾 |
| 眼球 | `eye.L/R` | 独立视线控制 |
| IK 控制器 | `CTRL_hand.L/R / CTRL_foot.L/R / POLE_knee.L/R` | 手脚目标与膝盖弯曲方向 |
| 挂点 | `mouth / gripLeft / gripRight / footContactLeft / footContactRight / headTouch` | 嘴部、握物、脚底与头部交互定位 |

骨架共 80 根，包含控制器和挂点。软手臂通过分段骨骼与连续权重表现柔软弯曲，并非流体模拟。当前动作采用 FK；`animate_naiwa.py` 只固定靠近身体内侧的前两段肩根，外侧上臂随动作弯曲，通过弧长采样的曲线安排外部十二段手臂；朝向沿手臂连续传递到手掌，减轻手腕扭转时的塌陷，最终烘焙成普通变换。

如要手动使用 IK：先复制一个动作，或在 NLA 编辑器静音现有动作轨，避免播放中的关键帧覆盖编辑；再将骨架对象的自定义属性 `IK_arm_L / IK_arm_R / IK_leg_L / IK_leg_R` 中相应一项从 0 调到 1，移动对应 `CTRL_` 骨骼。腿部可移动 `POLE_knee` 调整弯曲方向，手掌和手指仍能独立旋转。默认 0 保持已有 FK 动作。导出前应烘焙所需姿态，不能把 Blender 约束视作运行时功能。

## 表情与口水

在对应网格的 Object Data → Shape Keys 中调节 0–1 权重；手工试表情时也需静音该网格的 NLA 轨。

| 网格 | 形态键 | 表现 |
| --- | --- | --- |
| `Naiwa_Surface` | `CheekPuff.L / CheekPuff.R` | 嘴角两边分别鼓起，避免整张脸膨胀 |
| `Naiwa_Surface` | `Breathe` | 腹部轻微呼吸 |
| `UpperLid.L/R / LowerLid.L/R` | `Blink / Angry` | 真实眼皮覆盖眼球、斜压表达生气 |
| `Mouth` | `Frown` | 收紧嘴型 |
| `Naiwa_Drool` | `Drool` | 嘴角伸出口水丝与水珠，随头部一起移动 |

睡眠动作闭眼后逐渐流口水，醒来前收回。2D 运行时同样保持坐姿，用轻微点头与呼吸表达困意；输入、停止、自然醒来平滑恢复，隐私模式和拿饮品时立即隐藏口水。奶蛙无专属合成音效，键鼠声音由原有独立设置控制。

## 已有动画

动画在 Blender 的 NLA 与时间轴标记中按名称组织，30 FPS。每个 GLB 片段独立从 0 秒开始，可以循环播放；切换动作时应交叉淡入。动画同时包含骨骼与形态键轨道。

| 名称 | 时长 | 内容 |
| --- | --- | --- |
| `idle` | 4 秒 | 坐姿呼吸、小幅摇摆与眨眼 |
| `typing` | 3 秒 | 双手交替压键，手指轻弯 |
| `mouse` | 3 秒 | 右手伸向鼠标、小幅移动与点按，再回到键盘 |
| `sway` | 5 秒 | 左倾、回中、右倾、回中 |
| `wave` | 4 秒 | 放缓抬手、招手与收回，保持手掌长度 |
| `nap` | 6 秒 | 坐着点头闭眼、流口水、醒来 |
| `angry` | 3 秒 | 眼皮压低、局部鼓腮与交替跺脚 |
| `delight` | 8 秒 | 站姿垂手 → 双手扶肚 → 抬手触头 → 放回，带身体轻摆、下沉与点头 |

`delight` 参考用户提供视频中的扶肚和摸头段落，包含往返过渡；原视频中的翻滚与大笑口型尚未复刻。[动作视频](../art/naiwa/previews/gesture.mp4) 和 [十二帧分解](../art/naiwa/previews/gesture-sheet.jpg) 来自模型逐帧渲染，HTML 也可播放。

这些片段是动作基础，尚未与桌宠的全局键鼠、起床气计时、抚摸安抚和五种道具连接。拿杯入口、持物手约束、原尾巴按键对应的伸脚动作以及更丰富的行为仍需后续制作与运行时映射。

## 重新制作与校验

使用已有的 Blender 5.2。以下脚本只创建自己的 `DIYCat_Naiwa_Studio` 场景；推荐单独后台运行，输出到 `art/naiwa/`，会更新该目录已有的作者文件，不覆盖其他工程。

在项目根目录运行（`blender` 换成本机已安装程序路径）：

```sh
blender --background --threads 2 --python-exit-code 1 --python scripts/blender/create_naiwa.py --python scripts/blender/refine_naiwa.py --python scripts/blender/animate_naiwa.py --python scripts/blender/export_naiwa.py
blender --background --threads 2 --python-exit-code 1 art/naiwa/naiwa.blend --python scripts/blender/finalize_naiwa.py
```

第一步建立连续网格、权重、表情和动画，再写出仅含奶蛙场景的文件。网格先减面再细分，避免把全身高密度体素直接细分带来的内存峰值。第二步将独立场景文件保存为普通工程，并停在无动画的第 0 帧站姿；骨架仍为 Pose 状态，直接从第 1 帧播放即可；`finalize_naiwa.py` 只允许在后台打开指定的奶蛙文件后运行，不能在原工作会话运行。

仅改动画时：

```sh
blender --background --threads 2 --python-exit-code 1 art/naiwa/naiwa.blend --python scripts/blender/animate_naiwa.py --python scripts/blender/export_naiwa.py --python scripts/blender/finalize_naiwa.py
node scripts/check-naiwa-glb.mjs --report
blender --background --threads 2 --python-exit-code 1 art/naiwa/naiwa.blend --python scripts/blender/validate_naiwa.py
```

Node 检查直接使用现有 Three.js 的 GLTFLoader 与 AnimationMixer，不构建应用。内嵌 PNG 会检查格式、尺寸与压缩数据完整性，UV 与贴图绑定也会检查；Node 中仅为纹理创建占位对象，不执行 GPU 贴图渲染，外观由 Blender 重导入渲染复核。检查骨骼 / 挂点 / 动画名、权重归一化、每段动作首尾的循环衔接、每秒 30 帧的采样形变、睡眠眼皮与口水、待机口水清理以及摄影棚未混入导出。它会抽样顶点，不能替代完整碰撞、皮肤外观或设备帧率验收。

Blender 校验脚本先检查主体是单个封闭流形且欧拉示性数为 2，防止手指间出现意外孔洞；然后渲染源文件三视图与动作，再在新场景重新导入 GLB 渲染睡眠、招手和摸头，检查导出前后的外观。渲染图写入 `art/naiwa/previews/`；不保存校验场景到原工程。本轮未运行应用打包构建，网页交互与原生窗口尚需在用户环境检查。

## 渲染动作视频

使用现有 Blender 和 ffmpeg，顺序执行以控制内存；不会构建应用或安装依赖：


```sh
blender --background --threads 2 --python-exit-code 1 art/naiwa/naiwa.blend --python scripts/blender/render_naiwa_motion.py
python scripts/assemble-naiwa-preview.py --ffmpeg ffmpeg
```

合成脚本使用已有的 Pillow 和 ffmpeg；可将 `--ffmpeg` 改为本机程序的完整路径。内存紧张时，在 Blender 校验或视频渲染命令最后加 `-- --low-memory`，会关闭额外降噪并增加采样，降低峰值内存，但渲染耗时增加、画面可能保留少量噪点。

生成 24 FPS、360 × 440 的 8 秒动作预览。渲染全部完成后会记录源工程校验值；合成脚本拒绝未完成的序列，以及模型已更新但尚未重新渲染的旧帧。分解图从同一组帧提取；原始帧保存在忽略的缓存目录，不进入 Git。网页中的视频默认不自动播放，完整骨架和任意视角仍用交互预览检查。

## 接入桌宠的下一步

1. **角色适配器**：新增 `three-naiwa-v1`，负责加载、销毁、挂点查询、表情混合与中断过渡。当前 [catEngine3d.ts](../src/catEngine3d.ts) 依赖猫咪头、尾巴和爪子，不能直接套用。
2. **接触求解**：从真实键盘、鼠标和道具获得目标点，将双手 / 脚底 / 嘴部对齐；持物手优先于待机。测试左右鼠标、不同键盘配列和缩放，避免固定动画偏离道具。
3. **行为映射**：复用 [naiwaPose.ts](../src/naiwaPose.ts) 的行为语义，处理隐私、重置、输入吵醒、2–5 秒起床气、抚摸安抚和连续输入反应。输入停止应收回强烈动作，切换不跳回默认姿态。
4. **资源包与模型库**：现有 `.kurocat.json` 是最大 256 KiB 的配色包。新的清单需要独立资源路径、大小限制、骨架 / 挂点 / 动画声明、预览和许可证信息，并同步导入、导出、删除及 GitHub 目录；旧包继续兼容。
5. **能力开放**：接入并验证完成后，再通过共享契约开放 UI、MCP 和模型库的 3D 奶蛙能力。优化面数并完成目标系统实测后，再发布桌面或 Android 安装包。
