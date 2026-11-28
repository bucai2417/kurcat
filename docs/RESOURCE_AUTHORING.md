# DIY-Cat 资源创作教程：宠物、键盘与鼠标

本教程对应 DIY-Cat 当前桌面源码；奶蛙、奶猫和 `get_builtin_rigs` 属于 README 中的未发布更新。商城按「宠物 / 键盘 / 鼠标」和「2D / 3D」筛选。每类可以保存多个资源，桌面同时显示一只宠物、一套键盘和一个鼠标；2D 与 3D 的键鼠选择、个人键帽设置分别保存。

## 先了解可导入的内容

版本 1 是**内置模型外观包**：通过 JSON 控制颜色、花纹、材质与支持的形状参数。版本 2 是**外部 3D 模型包**：加载自包含 GLB，保留其网格、骨架、贴图和实际导出的动画；UI 也支持直接导入 `.glb`。暂不接收分离的 GLTF、VRM、FBX、Live2D、Spine 或自定义脚本。二维图案、三维体积和材质表现会不同，请分别预览。

| 类型 | 文件 | 模式声明 | 自动继承的交互 |
| --- | --- | --- | --- |
| 内置宠物外观（v1） | `.kurocat.json` | `profile.adapters` | 打字、鼠标、抚摸、道具、休息与情绪反应 |
| 外部 3D 宠物（v2） | `.glb` / `.kurocat.json` | `three-glb-v1` / `three-naiwa-v1` | 按 `profile.glb.animations` 映射文件中的实际片段；未提供的动作不显示 |
| 键盘 | `.diycat.json`，`kind: keyboard` | `modes` | 65 / 108 配列、键帽下压、爪子对位、输入灯效 |
| 鼠标 | `.diycat.json`，`kind: mouse` | `modes` | 左右键、滚轮、移动跟随与爪子对位 |

键鼠包不改变实体按键编号、配列、输入映射或动作轨迹。材质是绘制器的外观效果，并非物理模拟；鼠标轮廓是内置形状与比例。大肥鱼是专用 2D 绘制器，不能按猫咪包导出。安卓版当前是独立 2D 悬浮宠物，不提供桌面资源商城和 3D 接入。

## 从 UI 完成设计、验证与分享

1. 右键宠物 → 模型库 → 选择类别及适用模式。筛选不会改变正在使用的宠物模式。
2. 宠物点「导出当前模型」；键鼠可点「导出键鼠创作模板」。在键帽设计器中调好文字和颜色后，返回键盘分类点「导出当前设计」，会把该模式的个人键帽覆盖合并到包里。列表里的「导出」保留资源包原始设计。
3. 用支持 UTF-8 的编辑器修改文件，保留格式与版本，换成自己的唯一 ID、名称、作者和许可。不要用 GBK/ANSI 保存中文。
4. 从文件导入，查看待导入列表，确认后安装。键鼠安装只保存到库，点「用于 2D / 3D」才应用；给另一个模式配置资源时不必切换当前宠物。
5. 点「查看图片」检查实际绘制器生成的静态图片，再切到相应模式检查动作。静态预览不包含个人键帽覆盖和动态灯效，也不能证明动作对位正确。
6. 同 ID 更新需要显式勾选替换；建议更新前导出备份。删除已选键鼠会恢复跟随桌面主题，删除当前自定义宠物会切回内置黑猫。内置资源不能删除。

桌面版导出到应用配置目录的 `exports/`，界面显示完整路径，重名会加序号，不覆盖旧文件。宠物分类可以打开导出文件夹。Windows 配置目录为 `%APPDATA%\kuro-cat-pet`，macOS 为 `~/Library/Application Support/kuro-cat-pet`，Linux 为 `~/.config/kuro-cat-pet`。浏览器预览使用浏览器下载。

个人键帽设置优先于资源包；如果安装后的文字或颜色被旧设置盖住，在相应模式的键帽设计器中「清除此键 / 清除全部」。更换组合桌面主题会清除当前模式的独立键鼠选择；另一个模式的选择保留。

## 制作宠物

先通过 MCP `get_builtin_rigs` 查询骨架。`cat` 适用 2D / 3D 猫咪（包括奶猫）；`naiwa` 包括内置 2D 奶蛙和使用 `three-naiwa-v1` 导入的 3D 奶蛙；`dafeiyu` 是不可导入导出换肤的专用 2D 大肥鱼。详细部件表与动作映射见 [内置骨架与换肤边界](model-packs.md#内置骨架与换肤边界)。

从 [薄荷云朵完整示例](../model-store/mint-cloud.kurocat.json) 开始。字段细节、斑点与校验规则见 [宠物协议](model-packs.md)，程序共享定义见 [modelContract.json](../src/modelContract.json)。

```json
{
  "format": "kurocat-model",
  "version": 1,
  "profile": {
    "adapters": ["canvas-cat-v1", "three-cat-v1"],
    "behaviorContract": "cat-v1",
    "author": "你的名字",
    "license": "MIT",
    "revision": 1,
    "description": "支持 2D 与 3D 的原创配色"
  },
  "skin": {
    "id": "my-mint-cat",
    "name": "薄荷猫",
    "furColor": "#c9e9dc",
    "eyeColorTop": "#558b79"
  }
}
```

只做 2D 就保留 `canvas-cat-v1`；只做 3D 就保留 `three-cat-v1`。不要声明尚未验证的模式。外观色包括身体、耳内、尾巴、爪子、眼睛、鼻子、嘴与轮廓；`pattern` 可选 solid / bicolor / tuxedo / tabby / calico / siamese。

### 制作奶蛙皮肤

在 UI 切换内置奶蛙并导出，保留 `profile.adapters: ["canvas-naiwa-v1"]`、`behaviorContract: "cat-v1"`。更换唯一 ID 和配色即可复用坐姿、连续软手臂与手指、嘴边鼓腮、坐着打盹 · 流口水、无声鼓腮、小跳、拍肚皮、左右晃身、好奇探头与交替摆脚。普通打字和鼠标用手，原尾巴按键改为脚踩，起床气改为跺脚。猫咪的耳朵、尾巴、花纹与斑点不会在奶蛙上显示；3D 奶蛙必须另做版本 2 包并提供 GLB；仅把适配器改成 `three-naiwa-v1` 不能将 2D 配色变为 3D 模型。

已有开发依赖时运行 `npm run dev`，打开 `http://127.0.0.1:1420/harness.html?breed=builtin-naiwa&idle=0`，可展开参考图并逐个触发键鼠、道具、“嘴边鼓腮 · 跺脚”和“坐着打盹 · 流口水”。检查鼠标两侧的掌心朝向、指尖接触、嘴边两个小腮包，以及坐姿打盹时双脚保持支撑、头部轻轻点下、闭眼后嘴角渐渐流出口水。新增三种小动作也可从按钮触发，奶蛙互动没有专属音效。用“停止动作”检查收回是否平滑，再在动作中敲键盘检查中断衔接；无需打包。

3D 奶蛙已有 [Blender 源文件与动画 GLB](../art/naiwa/README.md)，在已有开发服务中打开 `/naiwa3d.html` 可以检查 8 段动作、骨架和正侧背视角。骨架控制、形态键与复现步骤见 [制作说明](naiwa-3d-design.md)。可在模型库导入 [3D 奶蛙版本 2 清单](../model-store/naiwa-3d.kurocat.json)，下载并校验它引用的 GLB，再切换到 3D 使用。该清单还启用奶蛙键鼠位置校准。直接导入裸 `.glb` 使用通用适配器；不支持直接导入 `.blend`。3D 以文件提供的 8 段片段为准，不继承内置 2D 的全部行为。

### 内置外观包继承行为，外部 GLB 需要实际动画片段

下面的行为列表适用于内置外观包。固定适配器负责动作，因此修改配色不会丢失行为。共同动作包括喝一口、伸懒腰、招手、歪头、慢眨眼、洗脸、打盹、撒娇、尾巴拍地与安抚。3D 还包括打滚、侧耳听、扭身和看爪子。连续输入可触发专注、律动、兴奋、生气；鼠标包含跟随、按键与滚轮。

打盹被键盘或鼠标打扰时触发起床气和尾巴拍地（奶蛙为跺脚），抚摸可安抚，也会在随机 2–5 秒后恢复。咖啡、奶茶、可乐、能量饮料和布丁分别带来专注、开心、惊讶、兴奋、满足反应。隐私状态会清理输入并暂停相应反应。作品至少应检查这些行为时眼皮、耳朵、尾巴与特效仍然清晰。

## 制作键盘和鼠标

可直接导入的完整示例：

- [2D 薄荷键盘](../model-store/mint-keyboard-2d.diycat.json) / [3D 薄荷键盘](../model-store/mint-keyboard-3d.diycat.json)
- [2D 薄荷鼠标](../model-store/mint-mouse-2d.diycat.json) / [3D 薄荷鼠标](../model-store/mint-mouse-3d.diycat.json)

统一外层格式如下，`skin` 用对应完整示例的内容替换，不能留空：

```json
{
  "format": "diy-cat-resource",
  "version": 1,
  "kind": "keyboard",
  "id": "my-keyboard-3d",
  "name": "我的三维键盘",
  "modes": ["3d"],
  "revision": 1,
  "author": "你的名字",
  "license": "MIT",
  "description": "奶白键帽与薄荷外壳",
  "skin": {}
}
```

| 字段 | 校验规则 |
| --- | --- |
| `format` / `version` | 固定 `diy-cat-resource` / `1` |
| `kind` | `keyboard` 或 `mouse`，同 ID 不能改类型 |
| `id` | 1–36 位小写英文字母、数字、短横线、下划线；首位为字母或数字；禁止 `builtin-` 前缀 |
| `name` | 1–48 个字符 |
| `modes` | `["2d"]`、`["3d"]` 或 `["2d","3d"]`，不可重复 |
| `revision` | 必填整数 1–2147483647；发布更新时递增 |
| `author` / `license` | 可选，填写时 1–100 字符 |
| `description` | 可选，填写时 1–240 字符 |
| 所有颜色 | `#RGB` 或 `#RRGGBB`，不接收 CSS 表达式、图片地址 |

名称和说明不能含控制字符或换行。需要两个模式呈现不同设计时，用两个 ID；双模式包共享同一份 `skin`。

### 键盘 skin 字段

以下 12 个颜色均必填：`deckTop`（面板）、`deckSide`（外壳侧面）、`deckEdge`（边缘）、`bedFill`（键帽间底板）、`keyTop` / `keySide` / `keyText`（普通键顶面、侧面、文字）、`modKeyTop` / `modKeySide`（功能键）、`accentKeyTop` / `accentKeySide`（强调键）、`patternColor`（图案）。

| 字段 | 可选值 / 范围 |
| --- | --- |
| `shape` | `classic` 常规、`sa` 高键帽、`flat` 薄键帽、`jelly` 圆润风格 |
| `material` | `plastic` / `metal` / `wood` / `glass` / `fabric` |
| `pattern` | `solid` / `carbon` / `wood` / `marble` / `grid` / `hologram` |
| `patternScale` | 必填数值 0.2–4 |
| `keycaps` | 可选对象，最多 200 项，每项可设置 `top` / `side` / `text` 颜色和 `label` / `emoji` 图例 |

键帽文字在文件中最多 24 字符，UI 快捷设计器限制 4 字；图例过长会缩小，短中文更清晰。`emoji` 非空时优先于 `label`，显示结果取决于系统字体。

```json
"keycaps": {
  "esc": { "top": "#4eac92", "text": "#ffffff", "label": "喵" },
  "space": { "top": "#d5f0e5", "side": "#9bc8b6", "label": "摸鱼时间" },
  "a": { "emoji": "🐾" }
}
```

**按键 ID 是小写 `space` / `esc`，不是浏览器事件的 `Space` / `Escape`。** 真实编号包含 `a`–`z`、`0`–`9`、`f1`–`f12`、`lshift`、`enter`、`np_0` 等。完整合法编号在 [resourceContract.json 的 keyboard.keyIds](../src/resourceContract.json)，同时由测试与 [65 / 108 配列定义](../src/keyboardLayout.ts) 对照，未知编号会拒绝导入。某配列没有的按键会在切换到包含它的配列后显示。

### 鼠标 skin 字段

必填颜色：`shell`（外壳）、`shellEdge`（壳侧）、`button`（按钮）、`buttonEdge`（按键边缘）、`wheel`（滚轮）、`outline`（轮廓）。`glow` 可选，设为颜色或空字符串；它控制装饰线的配色，不是独立光源。

`silhouette` 必填，可选 `oval`（椭圆）、`ergonomic`（人体工学风格）、`gaming`（游戏鼠标风格）；`material` 与 `pattern` 的可选值同键盘。鼠标包没有 `patternScale` 或键帽字段。

## 导入边界与发布到 GitHub

- JSON 使用 UTF-8。内置外观包和生成目录上限 256 KiB；GLB 二进制上限 16 MiB；版本 2 包及一次宠物导入总计上限 23 MiB。一次最多 50 个文件、50 个条目。键鼠导入总计仍为 256 KiB，本机自定义键鼠合计最多 50 个。
- 键鼠目录格式为 `{ "format": "diy-cat-resource-catalog", "version": 1, "resources": [...] }`；宠物目录仍是 `kurocat-catalog`。两种目录不要混用。
- 将 `.kurocat.json` / `.diycat.json` 放在本仓库 `model-store/` 顶层。不要手改生成目录。推送后 Model Catalog Actions 校验 UTF-8、ID、字段、重复资源与数量，生成 `catalog.json` 和 `resources.json`。
- 商城默认读取本仓库 `main`，加载目录不会自动安装。可以填写其他公开 GitHub 仓库的目录文件页面或 Raw HTTPS 地址。只支持允许的 GitHub 来源；私有仓库和任意下载站不在此版本范围内。
- 更新保留 ID 并提高 revision，用户刷新后显式替换。删除本机资源不删除 GitHub 文件；下架需在 GitHub 删除资源文件并让目录任务完成。
- 内置外观缩略图由本地绘制器生成。外部 GLB 点「查看 3D」后才下载并预览；未安装的模型不会随目录自动下载。目录仅保存清单和 GitHub Raw HTTPS 地址，GLB 另存并填写 SHA-256，建议使用固定提交地址。添加作者与许可，只发布你有权分享的内容。

创作者可运行轻量检查（Node 22.15+，不用构建桌宠）。`check-glb-motion.mjs` 使用项目已有的 Three.js 开发依赖；本机没有依赖时可交给 GitHub Actions，不必专门安装：

```sh
node scripts/build-model-catalog.mjs
node scripts/build-model-catalog.mjs --check
node scripts/check-model-library.mjs
node scripts/check-glb-import.mjs
node scripts/check-glb-motion.mjs
node scripts/check-resource-library.mjs
```

## 发布前实际验收

1. 分别在声明的 2D / 3D 模式预览，检查中文、键帽图例、眼睛和轮廓；每种配列、方向和键盘大小都试一次。
2. 连续按键后停止，检查爪子停下、键帽回弹；左右鼠标键与滚轮均应有反馈，爪子不要遮住整个按钮。
3. 内置模型分别使用五种道具，检查拿起、入口、放回与表情；测试起床气、抚摸和自然恢复。外部 GLB 逐一检查已映射片段、输入中断与恢复，不应显示没有片段的动作；当前未接入外部模型道具抓握。
4. 独立替换键盘和鼠标后切换 2D / 3D，确认各自选择保留；重启、导出、删除、重新导入，确认外观一致。
5. 测试同 ID 替换、无效 JSON、重复 ID、错误模式与不存在的按键，应该看到明确错误而不破坏已安装资源。

## 从 Blender 制作外部 3D 宠物

1. 完成蒙皮与形态键，让肩、手臂、手腕和掌心自然连接。把 IK、约束等结果烘焙成骨骼关键帧，导出自包含 GLB；贴图和缓冲区内嵌，不使用 Draco / Meshopt 压缩。
2. 给动作片段起唯一名称，按需要制作 `idle`、`typing`、`mouse`、`wave`、`nap`、`angry` 等。导出后检查文件里确实存在这些片段，不能只改 JSON 声明动作。
3. UI 可直接导入 GLB 并识别同名片段。需要自定义动作名、比例与朝向时，使用版本 2 包，在 `profile.glb.animations` 映射行为到片段，设置 `height` / `yaw`；奶蛙使用 `three-naiwa-v1`。完整格式见 [GLB 接入协议](model-packs.md#版本-2glb-文件与动作映射)。
4. 离线分享使用 UI 导出，得到内嵌 Base64 的单文件包。商城发布使用 `asset.url` 指向固定提交的 GitHub Raw GLB，并填入对应 SHA-256；不要将 Base64 写进商城目录。
5. 验证动作被键鼠输入打断时平滑衔接，检查休息、唤醒、反向切换和重复触发。导出、删除、重新导入后，材质和动作应保持一致。隐私模式暂停输入反应并回到 idle，不会凭空生成闭眼片段。

目前支持加载实际骨架和片段、平滑过渡与菜单能力查询；不自动重定向任意骨架，不补画缺失动画。外部模型道具握持点、接触 IK 和更多表情特效仍需后续接入。当前奶蛙 `nap` 是坐姿入睡—睡眠—醒来的完整片段，运行时保持片段 40%–60% 的睡眠区间；趴睡需要另做片段与键盘接触验收。
