# 3D 奶蛙：模型、骨架与后续接入

已制作可编辑的 **Blender 作者模型**，包含连续皮肤、80 根骨骼、表情形态键与 8 段动画。作品按用户提供的 [正 / 侧 / 背设计图](../art/naiwa/reference.png) 制作：黄色头身、奶油色肚皮、绿色眼睛、橄榄色手脚，没有耳朵和尾巴。Blender 第 0 帧保留站姿供造型编辑；桌宠与 HTML 预览默认坐姿，用猫咪共用控制器驱动实时交互。打盹仍保持坐姿，趴睡尚未制作。

**桌宠已内置同一只奶蛙的 2D / 3D 模式。** 在模型库选择“奶蛙”，将渲染模式切到 3D 即可，无需导入或联网。模型二进制随应用分发，HTML 预览也走相同的内置加载路径。旧 2D 配色保留；导出得到带 `-custom` 后缀、包含 2D / 3D 与 GLB 的离线副本。[独立奶蛙 3D 包](../model-store/naiwa-3d.kurocat.json) 仍可用于制作自定义模型。版本 2 的 `three-naiwa-v1` 连接连续蒙皮与猫咪共用的键鼠、道具、情绪、睡眠、小动作控制。裸 `.glb` 只有通过完整骨架、表情、挂点及基础动画校验，才自动使用奶蛙适配器，改文件名不会改变识别结果。旧版已安装为通用适配器的裸 GLB 需重新导入或换用专用包；已安装的专用包更新应用即可使用新控制器。

## 文件与预览

| 文件 | 内容 |
| --- | --- |
| [naiwa.blend](../art/naiwa/naiwa.blend) | 独立工程，包含角色、骨架、形态键、NLA 动作与摄影棚；打开即为奶蛙站姿（第 0 帧），从第 1 帧可播放动作 |
| [naiwa.glb](../art/naiwa/naiwa.glb) | 角色、蒙皮、材质、形态键与 8 段动作，不包含摄影棚、灯光或相机 |
| [预览图](../art/naiwa/README.md) | 正面、侧面、背面及坐姿、鼠标、招手、睡觉、生气 |
| [validation.json](../art/naiwa/validation.json) | 用 Three.js 重载 GLB 后得到的权重、挂点、逐帧形变与表情检查结果 |
| [naiwa3d.html](../naiwa3d.html) | 桌面互动预览：与桌宠共用 `KuroCatEngine3D`，支持输入、视线跟随、道具、动作、暂停与视角切换 |

已有开发依赖时运行 `npm run dev`，打开 `http://127.0.0.1:1420/naiwa3d.html`。此页使用项目内已有的 Three.js，不需要新依赖或打包；直接双击 HTML 无法加载 TypeScript。2D 预览为 `/harness.html?breed=builtin-naiwa&idle=0`，两页之间有链接。

3D 页使用真实桌宠键盘、鼠标和道具系统。鼠标移过画布可测试视线和抚摸，点画布后按键或在输入框打字可测试接触动作；Shift + 拖动旋转视角。可切换 65 / 108 配列、道具和手动动作。系统设置减少动态效果时默认暂停，可主动继续；预览保持静音。页面下方的站姿图与视频是作者片段的历史记录，不能代替当前实时交互验收。

## 网格与材质

头、身体、肩、手臂、掌心、手指和腿脚合为连续皮肤，避免独立球体或掌片随动画脱节。肚皮与手脚颜色来自同一表面的 2048 × 1024 内嵌 UV 贴图，避免肚皮边界随网格密度出现锯齿；眼球、瞳孔、眼皮、嘴和口水保留为独立可控制部件。肩和手腕的蒙皮权重经过平滑，每个顶点最多 4 个归一化影响。手臂权重依据腋下连通区域、躯干椭圆截面和骨段距离分配，避免把肚皮侧边拉向手腕；作者片段保持身体内部的前两段肩臂稳定；运行时由锁骨带动这两段肩根，十二段软臂从腋下外侧衔接，肩根不再固定在世界坐标。

当前导出约 **156,928 三角面、79,702 顶点、11 个网格、9,742,532 字节（约 9.29 MiB）**，是供造型和动作审查的作者版本。肩部体积、手指轮廓与参考图仍有可精修空间；尚未完成面向低配置桌面或 Android 的重拓扑、LOD 与性能测量。后续建议从桌面 12k–20k、移动端 6k–10k 三角面尝试优化，最终预算由设备实测决定。

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

骨架共 80 根，包含控制器和挂点。软手臂通过分段骨骼与连续权重表现柔软弯曲，并非流体模拟。作者动画采用 FK，并烘焙为普通变换。应用内的 `src/naiwaRig.ts` 每帧在基础姿态上解算接触：锁骨按前伸距离和举手高度平滑移动、旋转，胸部与脊椎同步配合；内侧两段肩根保留局部形状，外侧十二段手臂按弧长采样曲线，最后一段沿掌心方向排列；平行传递表面朝向，将扭转分散到前臂，防止手腕单独折弯。招手时手先向前、向外绕过腹部再抬起，指尖错相微动；握杯时手指收拢。`src/naiwaTorso.ts` 从实际变形的躯干蒙皮采样分层椭圆包络，对软臂中段交替做避碰与平滑，保留肩根、掌根和接触点边界；采样与求解缓冲区复用。它是近似避碰，不能替代所有自定义体型、任意动作的验收。

伸懒腰持续 3.8 秒：收身 → 左右错峰举手 → 开胸后仰 → 手臂回落 → 小幅回弹。掌心随抬臂渐变朝向，头部与肩胸同步；输入可中断，回桌时长随手到目标的距离变化，避免高处瞬移到键盘。修改发生在运行时，未重导出原始 `.blend` / `.glb`，因此独立打开作者动画不会包含这些程序行为。

如要手动使用 IK：先复制一个动作，或在 NLA 编辑器静音现有动作轨，避免播放中的关键帧覆盖编辑；再将骨架对象的自定义属性 `IK_arm_L / IK_arm_R / IK_leg_L / IK_leg_R` 中相应一项从 0 调到 1，移动对应 `CTRL_` 骨骼。腿部可移动 `POLE_knee` 调整弯曲方向，手掌和手指仍能独立旋转。默认 0 保持已有 FK 动作。导出前应烘焙所需姿态，不能把 Blender 约束视作运行时功能。

## 表情与口水

在对应网格的 Object Data → Shape Keys 中调节 0–1 权重；手工试表情时也需静音该网格的 NLA 轨。

| 网格 | 形态键 | 表现 |
| --- | --- | --- |
| `Naiwa_Surface` | `CheekPuff.L / CheekPuff.R` | 仅为旧模型兼容保留；3D 运行时始终置零，包含生气与打滚 |
| `Naiwa_Surface` | `Breathe` | 腹部轻微呼吸 |
| `UpperLid.L/R / LowerLid.L/R` | `Blink / Angry` | 真实眼皮覆盖眼球、斜压表达生气 |
| `Mouth` | `Frown` | 收紧嘴型 |
| `Naiwa_Drool` | `Drool` | 嘴角伸出口水丝与水珠，随头部一起移动 |

睡眠动作闭眼后逐渐流口水，醒来前收回。2D 运行时同样保持坐姿，用轻微点头与呼吸表达困意；输入、停止、自然醒来平滑恢复，隐私模式和拿饮品时立即隐藏口水。奶蛙无专属合成音效，键鼠声音由原有独立设置控制。

## GLB 中的作者动画

以下片段在 Blender 的 NLA 与时间轴标记中组织，30 FPS，包含骨骼与形态键轨道。它们用于作者编辑与通用 GLB 播放。专用奶蛙运行时只用 `idle` / `nap` 作基础姿态，其余交互由共享控制器实时生成，不会因兴奋打字而自动播放站起的 `delight`，也不会被作者片段中的鼓腮轨道覆盖当前情绪。

| 名称 | 时长 | 内容 |
| --- | --- | --- |
| `idle` | 4 秒 | 坐姿呼吸、小幅摇摆与眨眼 |
| `typing` | 3 秒 | 双手交替压键，手指轻弯 |
| `mouse` | 3 秒 | 右手伸向鼠标、小幅移动与点按，再回到键盘 |
| `sway` | 5 秒 | 左倾、回中、右倾、回中 |
| `wave` | 4 秒 | 放缓抬手、招手与收回，保持手掌长度 |
| `nap` | 6 秒 | 坐着点头闭眼、流口水、醒来 |
| `angry` | 3 秒 | 历史 GLB 为眼皮压低、局部鼓腮与交替跺脚；专用运行时不播放其鼓腮轨道 |
| `delight` | 8 秒 | 站姿垂手 → 双手扶肚 → 抬手触头 → 放回，带身体轻摆、下沉与点头 |

`delight` 参考用户提供视频中的扶肚和摸头段落，包含往返过渡；原视频中的翻滚与大笑口型尚未复刻。[动作视频](../art/naiwa/previews/gesture.mp4) 和 [十二帧分解](../art/naiwa/previews/gesture-sheet.jpg) 来自模型逐帧渲染，HTML 也可播放。

运行时以 `idle` / `nap` 为坐姿基础，叠加 3D 猫咪的输入、视线、情绪、道具和动作调度。普通打字与鼠标点击通过实时接触驱动软臂；连续输入的专注、兴奋、律动和生气沿用共同状态机，不再播放站起来的 `delight`。瞳孔先跟随光标并按情绪改变大小，头部通过较慢的弹簧转向。鼓腮在所有状态下强制归零，生气只改变眼皮与嘴型；抚摸可结束起床气。睡眠保持坐姿并在片段 40–60% 区间呼吸，直到真实输入唤醒。

专用适配器按初始坐姿高度归一化一次，保持正常尺寸的 65 / 108 键盘和跟随光标的鼠标。软臂末端接到共享引擎的按键、鼠标、杯柄与手势目标；杯子使用模型真实嘴部挂点，完成拿起、饮用、放回与中断。原尾巴按键由伸缩舌头完成，超出可达范围则交给手。普通打字与鼠标始终使用双手；脚用于支撑、跺地和打滚蹬腿。共享伸懒腰、歪头、眨眼、洗脸、撒娇、侧耳、抖动和检查手掌已接入；起床气改为跺脚。奶蛙招手用 3.4 秒完成抬手、摆手和收回，肩胸先动、手指轻动，末段手臂与掌心保持连续；打滚用 4.8 秒衔接侧倒、抱手、仰躺交替蹬腿、摇摆、撑起坐稳。打滚表情只在耍赖段皱眉，不保留到正常状态。趴下睡觉仍待单独制作。通用 `three-glb-v1` 仍按实际片段播放，不自动获得奶蛙接触控制。

### 舌头与吸鼻涕

`three-naiwa-v1` 增加 `tongueKey`（伸舌头按键）与 `sniff`（吸吸鼻涕），UI 和 MCP 共用适配器动作列表，猫咪、2D 奶蛙和普通 GLB 不会获得这些专属动作。网页预览中可直接点击对应按钮。实际使用时，在原尾巴按键设置里选择的键由舌头负责；菜单示范使用 Enter（缺失时用空格），不修改用户的按键设置。

舌头与舌尖、张口装饰、鼻涕由 `src/naiwaRig.ts` 在模型完成尺寸归一化后生成，沿嘴部挂点伸展，无需修改现有 80 骨骼或增加必需形态键。舌头是扁圆截面，先离开嘴部再落向键面；释放按键后收回，睡眠、打滚和拿道具时不抢接触。吸鼻涕约 3 秒：水滴渐长、快速吸回，配合眯眼与头胸回缩，不添加专属声音；键鼠输入可打断。隐藏的装饰不参与摸头射线命中。

本轮修改运行时和后续作者动画生成脚本，**没有重新导出 `.blend` / `.glb` 二进制**。现有文件中的兼容形态键和历史作者轨道仍保留，应用强制禁用鼓腮；新版生成脚本的生气鼓腮权重为零。专用模型包 revision 为 3，资源 SHA-256 不变；旧专用包更新应用后同样获得实时动作。第三方 GLB 播放器只会看到已导出的作者片段。

## 运行时接触与动作校验

使用现有 Node / Three.js 依赖运行，无需构建应用：

```sh
node scripts/check-naiwa-runtime.mjs
node --test scripts/check-pet-motion.mjs scripts/check-glb-import.mjs scripts/check-glb-motion.mjs
```

第一项加载真实 GLB，检查坐姿尺度、软臂与手腕切线、键鼠和持杯挂点、视线、所有情绪下禁用鼓腮、睡眠、舌尖按键接触与收回、吸鼻涕中断、交替蹬腿和打滚落地。第二项还覆盖共享引擎的输入、动作中断、65 / 108 配列与五种道具的左右手握持，并检查持杯时手腕是否藏入躯干。绘制器在 Node 测试中被替代，不能据此判断 GPU 外观或原生窗口表现。

单独审查角色可运行 `node scripts/check-naiwa-runtime.mjs --review`。要同时检查实际桌面、键盘、鼠标和道具，可在 PowerShell 中导出共享引擎的变形网格，再用独立后台 Blender 渲染：

```powershell
$env:NAIWA_REVIEW = '1'
try {
  node --test --test-name-pattern='live Naiwa' scripts/check-pet-motion.mjs
} finally {
  Remove-Item Env:NAIWA_REVIEW
}
blender --background --threads 2 --python-exit-code 1 --python scripts/blender/review_naiwa_runtime.py -- scene-desk scene-gaze scene-wave scene-nap scene-coffee scene-boba scene-cola scene-energy scene-pudding
```

将 `blender` 换成本机已安装程序路径。JSON、贴图和 PNG 写到忽略的 `node_modules/.cache/naiwa-live-review/`；不保存或修改作者 GLB / Blender 工程。这些是实际运行时几何的离线渲染，使用 Blender 摄影棚灯光；Canvas 键帽文字和屏幕特效被省略，不能当作浏览器截图或桌宠安装包验收。

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

## 后续精修与制作

1. **趴下睡觉**：保留现有坐睡，另建“手掌撑桌 → 躯干前倾 → 头部落下 → 熟睡呼吸 → 手掌支撑起身”片段。先约束手掌、脚底和头部接触，再补眼皮、口水与指尖松弛。新的奶蛙 `nap` 仍需保留入睡与熟睡区间，之后再替换映射；目前没有把未制作的动作放进菜单。
2. **道具接触精修**：现已使用实际手掌和嘴部挂点拿取、饮用、放回五种道具，继续在桌面安装包核对杯柄、吸管、勺子与手指的外观，以及左右摆放和中断恢复。几何接触点正确不等于整个手掌没有穿插。
3. **手部与脚部**：继续按设计图精修肩体积和手指。已有脚部两段接触求解；伸舌按键不可达时回退双手；需在实际窗口检查不同配列、按键映射和动作极限，不能只凭单张预览判断。
4. **性能与运行验证**：作者版面数较高，需重拓扑 / LOD 和目标设备性能测量。当前本机只执行轻量回归、GLB 重载及 Blender 渲染；原生安装包编译测试交给 GitHub，仍需实际安装后验证全局输入、窗口交互和更新。

协议与导入步骤见 [模型包文档](model-packs.md#版本-2glb-文件与动作映射)。作者源文件、导出的 GLB 与预览必须同步更新，导出后重新计算清单 SHA-256。
