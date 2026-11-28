# 模型包与 2D / 3D 接入

## 已实现的范围

版本 1 模型包是内置猫咪 / 奶蛙的外观与绘制器声明，文件扩展名为 `.kurocat.json`，编码为 UTF-8。导入后沿用对应绘制器的姿态、道具动作、连续打字、抚摸、打盹与起床气反应。模型包无需附带脚本、贴图或动画文件。

版本 2 支持带网格、骨架、动画和内嵌贴图的自包含 **GLB**，适配器为 `three-glb-v1` 或 `three-naiwa-v1`；UI 也接受裸 `.glb`。尚不支持分离资源的 `.gltf`、VRM、Live2D、Spine、自动骨架重定向和在线付费商店。GitHub 模型库是用户主动加载的 JSON 目录，查看名称、作者、许可、模式与动作后确认导入。内置绘制器的包有静态缩略图；GLB 卡片点击「查看 3D」才下载并生成静态图片，不会遍历下载整个目录。查看图片不安装或切换模型。

图片是静态外观，不能用来验证动作。预览按需生成并缓存，2D / 3D 各复用一个暂停的绘制器，不会给每张卡片启动动画循环；关闭大图后可继续切换和管理模型。

同一外观在 Canvas 2D 和 Three.js 3D 中的表现可能不同，尤其是二维花纹与斑点。声明两种适配器不代表两种外观逐像素一致。大肥鱼使用专用 2D 绘制器，暂不支持此猫咪模型包格式。

## 在 UI 中操作

1. 右键猫咪，打开“模型库”。顶部显示当前模型的模式与可用动作。
2. “本机模型”可保存多个模型，支持按名称、ID、作者搜索，并按 2D / 3D 筛选；键盘与鼠标在各自分类中管理。点击缩略图打开大图，可切换支持的 2D / 3D 图片；点击“使用”才切换桌宠，并自动选择兼容模式。多模型是本机库的保存与切换，当前桌面仍显示一只猫。专用大肥鱼支持 2D 图片预览，但不支持模型包导出。
3. 在“从文件导入”可多选 UTF-8 `.kurocat.json`、自包含 `.glb` 或 `kurocat-catalog` 目录 JSON。每次最多 50 个文件、合计最多 50 个模型；外观包和目录分别限 256 KiB，单个 GLB 限 16 MiB，完整 GLB 包及整个导入批次限 23 MiB；先整体校验，含无效包或重复 ID 时不安装。用下拉列表查看每个待导入模型的图片与详情。单模型“导入并使用”；批量导入仅保存到库，不切换猫咪，同 ID 冲突默认跳过，勾选后才覆盖。未完成的项目保留待处理，重试仍遵循批量导入规则。内容完全一致的模型不重复写入。建议替换前导出备份。
4. “导出当前模型”或列表中的“导出”把文件保存到应用配置目录的 `exports/`，并显示完整路径；“导出全部自定义模型”逐个导出，报告成功数量和失败项目。同名文件自动加序号，不覆盖旧导出。“打开导出文件夹”可在桌面版中定位文件。浏览器预览使用浏览器下载目录，批量下载可能需要浏览器允许。
5. 自定义模型可点“删除”，再在该行确认。删除当前模型会切回内置黑猫，并同步设置与模型列表。删除只影响本机副本，GitHub 和已导出的文件会保留；内置模型不可在此删除。
6. “GitHub 模型库”默认读取 `bucai2417/kurcat` 的公开目录。点击“加载 / 刷新”后可筛选、查看详情并导入；也可以填写其他仓库的 catalog.json 文件页面地址或 Raw 地址。“恢复默认来源”用于回到本项目，最近一次成功加载的来源会被记住。

目录标识“未安装”“内容一致”“有新修订”“本机修订较新”或“同 ID 内容不同”。加载目录不会安装、覆盖或切换模型，也不会在启动时自动联网。导入不会替换全局键帽、音效或隐私设置。

内置猫导出时 ID 自动追加 `-custom`，便于制作自己的版本。自定义模型保留自己的 ID。模型元数据和外观保存在 `cats.json`，GLB 二进制单独保存在配置目录的 `models/<sha256>.glb`。设置、事件和 localStorage 不携带大段 Base64；导出版本 2 时才嵌入完整资源。多个模型引用同一个文件时，删除最后一个引用后才清理二进制。

DIY-Cat 1.0.0 沿用原来的模型包格式和设置目录，升级改名无需重新制作模型包。

配置目录：Windows 为 `%APPDATA%\kuro-cat-pet`；macOS 为 `~/Library/Application Support/kuro-cat-pet`；Linux 为 `~/.config/kuro-cat-pet`。

## 完整示例

仓库提供可直接导入的 [薄荷云朵外观包](../model-store/mint-cloud.kurocat.json) 和 [奶蛙 3D 清单包](../model-store/naiwa-3d.kurocat.json)。奶蛙包包含实时软臂、视线跟随与共享行为，导入时会下载并校验对应 GLB。一个最小可用外观包如下：

```json
{
  "format": "kurocat-model",
  "version": 1,
  "profile": {
    "adapters": [
      "canvas-cat-v1",
      "three-cat-v1"
    ],
    "behaviorContract": "cat-v1",
    "author": "KuroCat 示例",
    "license": "MIT",
    "revision": 1,
    "description": "我的第一只猫咪，支持 2D / 3D 互动。"
  },
  "skin": {
    "id": "my-cat",
    "name": "我的猫咪",
    "furColor": "#c9e9dc",
    "eyeColorTop": "#558b79"
  }
}
```

| 字段 | 规则 |
| --- | --- |
| `format` / `version` | `kurocat-model`；外观包为 `1`，GLB 包为 `2`；格式版本与修订号不同 |
| `profile.behaviorContract` | 固定为 `cat-v1` |
| `profile.adapters` | 每个模式最多一个；版本 1 用 `canvas-cat-v1`、`three-cat-v1`、`canvas-naiwa-v1`；版本 2 用 `three-glb-v1` 或 `three-naiwa-v1` |
| `profile.author` / `license` | 可选文本，各最多 100 个字符 |
| `profile.revision` | 模型修订号，可选，1–2147483647 的整数；省略按 1 比较，发布更新时递增 |
| `profile.description` | 可选简介，最多 240 个字符 |
| `skin.id` | 1–36 位小写字母、数字、下划线、短横线；首位为字母或数字；不能占用内置 ID |
| `skin.name` / `emoji` | 名称必填、最多 48 字符；图标可选、最多 12 字符 |
| `skin.furColor` / `eyeColorTop` | 必填颜色；支持 `#RRGGBB`、`rgb(...)`、`rgba(...)` |
| `skin.pattern` | 可选 `solid`、`bicolor`、`tuxedo`、`tabby`、`calico`、`siamese` |
| `skin.spots` | 可选，最多 64 个；部位为 `head`、`body`、`leftArm`、`rightArm` |

其他支持的颜色与布尔字段见 [共享契约](../src/modelContract.json) 的 `skinRules`；斑点坐标系可通过 MCP `get_cat_schema` 查询。每个斑点的 `x/y/rotation` 绝对值不超过 360，`rx/ry` 大于 0 且不超过 300，`opacity` 为 0–1。`rotation` 默认 0，`opacity` 默认 1。文本不允许控制字符，颜色和数字均做校验。

版本 1 包不超过 256 KiB。只提取支持的外观字段，未知字段不会作为脚本执行。版本 2 的资源与大小规则见下文。模型包的 `skin.builtin` 不会获得内置模型权限。

## 内置骨架与换肤边界

先调用 MCP `get_builtin_rigs`，再选择适配器。骨架不会根据模型名称或 ID 自动推断。

| 骨架 | 适配器 / 模式 | 导入导出 | 部件与行为 |
| --- | --- | --- | --- |
| `cat` | `canvas-cat-v1`（2D）、`three-cat-v1`（3D） | 支持配色、花纹和斑点包 | 头、耳、身体、双臂、爪、尾巴与眼皮；含内置奶猫 |
| `naiwa` 奶蛙 | `canvas-naiwa-v1`（内置 2D）、`three-naiwa-v1`（导入 3D） | 2D 配色包；3D 为版本 2 GLB 包 | 无耳、无尾；2D 由内置绘制器形变，3D 使用作者文件的软手臂、手指与实际动画 |
| `glb` | `three-glb-v1`（导入 3D） | 版本 2 GLB 包 | 部件由文件决定，动作由 `profile.glb.animations` 声明 |
| `dafeiyu` 大肥鱼 | 内置专用 2D 绘制器 | 当前不开放换肤包 | 固定图像、双手与鲸尾；支持喝水、伸展、招手 |

奶蛙的 `behaviorContract` **仍为 `cat-v1`**；它表示共同的输入与反应协议，不代表猫咪外形。原奶蛙文件使用 `canvas-naiwa-v1` 即可导入；此前的“不支持的模型适配器或行为版本”现已拆成明确的错误提示。每个 2D / 3D 模式最多一个适配器，不能在同一包同时声明 `canvas-cat-v1` 和 `canvas-naiwa-v1`。

旧自定义奶猫即使 ID 为 `naiwa`，没有奶蛙适配器声明时仍保持猫咪骨架。内置奶猫和奶蛙使用 `builtin-milk-cat`、`builtin-naiwa`，不会覆盖旧自定义模型；导出内置外观会生成带 `-custom` 后缀的副本 ID。

### 内置 2D 奶蛙动作与外观

- 普通按键（包括空格）、鼠标点击使用双手；仅原尾巴按键由脚替代，继续遵循 `smart/custom/edge/off` 配置。默认坐姿，双脚在身体两侧轻摆；伸脚敲键时配合重心侧移。
- 手臂、掌心与三指组成连续软曲面，不叠加独立手掌贴片；随接触方向伸缩、转向，伸长时变细，动作中有惯性回弹。指尖接触点独立于形变，点鼠标轻压、握杯收拢，避免手腕固定折弯。腿部仍保留折腿结构。
- 生气只在嘴巴两侧分别鼓起小腮包，保留整张头部轮廓和五官位置；搭配斜压眼皮、收紧嘴型、轻微泛红与短腮纹，安抚后逐渐回落。隐私模式立即关闭眼睛、清理表情。
- `nap` 为坐着打盹 · 流口水：通过 `sleep/drool` 通道控制坐姿睡意与口水，保持坐姿、缓慢点头，嘴角出现口水，闭眼呼吸。自然结束、输入吵醒、停止和拿饮品都有连续的恢复过程；键鼠吵醒保留跺脚与可安抚的起床气。
- 奶蛙专属动作包括 `frogCroak`（无声鼓腮吐气）、`frogHop`（蓄力小跳）、`bellyPat`（拍拍肚皮）、`frogSway`（先左倾、回中、再右倾）、`frogPeek`（眼神先动、身体探头）、`footSwing`（交替摆脚）；`groom` 为揉脸、`cuddle` 为抱肚、`tailGround` 为跺脚。完整列表以契约的适配器 `actions` 为准。
- 咖啡、奶茶、可乐、能量饮料和布丁沿用拿取、入口、放回与不同后续反应；杯子左右摆放均使用实际手掌和嘴部挂点。
- 奶蛙专属合成音效已移除，鼓腮、抚摸、惊醒、跺脚和饮用反应保持静音。`soundEnabled` 控制猫咪呼噜；键盘和鼠标音效仍由独立开关控制。

配色字段为 `furColor`、`furSecondaryColor`、`outlineColor`、`bellyBibColor`、`armColor`、`pawColor`、`pawOutlineColor`、`eyeColorTop`、`eyeColorBottom`、`pupilColor`、`eyeCatchlight`、`mouthColor`、`blushColor`；奶蛙不绘制猫咪耳朵、尾巴、花纹或斑点。部件和形变通道由 `get_builtin_rigs` 返回，并标明此处配色与输入映射属于 2D 绘制器。3D 条目标记 `glb-import-supported`，不会自动继承 2D 的全部行为。

内置 2D 奶蛙的坐姿身体和脚掌来自参考图拆分素材，打盹保持坐姿，手臂与手指通过连续形变绘制，见 [素材说明](../src/assets/naiwa/README.md)。其外观包仅改变现有配色。另有 [3D 奶蛙作者文件](../art/naiwa/README.md)：Blender、80 骨骼 GLB 与 8 段作者动画。导入 [3D 奶蛙清单](../model-store/naiwa-3d.kurocat.json) 后由实时软臂和共享猫咪引擎驱动键鼠、道具、视线与行为；HTML 预览 `/naiwa3d.html` 使用同一套引擎。裸 GLB 只有通过完整奶蛙骨架与表情校验才会自动选择专用适配器，详见 [制作说明](naiwa-3d-design.md)。

## 动作与反应契约

UI、MCP 和 OBS 读取同一个 [modelContract.json](../src/modelContract.json)。新增绘制器时先声明能力，再接入动作调度，避免菜单出现模型无法完成的动作。

| 动作 ID | 行为 | 2D 猫 | 3D 猫 |
| --- | --- | --- | --- |
| `drink` | 完整端杯、饮用、放回；需要启用道具 | 支持 | 支持 |
| `stretch` / `wave` / `tilt` | 伸懒腰、挥手、歪头 | 支持 | 支持 |
| `slowBlink` / `groom` / `cuddle` | 慢眨眼、洗脸、撒娇 | 支持 | 支持 |
| `nap` | 打盹，进入可被输入吵醒的睡眠状态 | 支持 | 支持 |
| `tailGround` | 手动触发拍尾起床气，随机 2–5 秒 | 支持 | 支持 |
| `calm` | 安抚当前起床气，平滑收尾 | 支持 | 支持 |
| `roll` / `listen` / `shimmy` / `pawCheck` | 地上打滚、侧耳听、抖毛、检查爪子 | 不支持 | 支持 |

以上表格适用于内置猫咪和完整的 `three-naiwa-v1` 奶蛙，奶蛙没有尾巴，拍地改为跺脚。通用 `three-glb-v1` 只显示映射的实际片段和安抚功能，不能自动获得未制作的道具、尾巴或打滚动作。大肥鱼仅声明 `drink`、`stretch`、`wave`。MCP 保留 `sleep`→`nap` 的旧名兼容；`roll` 在 3D 中是真正打滚。

| 输入或状态 | 需要呈现的反应 |
| --- | --- |
| 键盘 | 前爪敲击与可配置尾巴敲键，停止输入后不继续假敲键 |
| 连续输入 | 专注 `focus`、律动 `groove`、兴奋 `excited`、烦躁 `grumpy`，配合眼皮、耳朵、身体和可读字幕 |
| 鼠标 | 跟随、按键、滚轮；普通移动不吵醒打盹中的猫 |
| 睡眠被打断 | 非重复键盘按下、鼠标按下或滚轮触发起床气；尾巴蓄力、落地、回弹，出现冲击特效和提示 |
| 起床气结束 | 随机 2–5 秒自动恢复；继续输入不会续时；来回抚摸可提前安抚，并显示爱心与反馈 |
| 道具 | 咖啡提神、奶茶满足、可乐气泡、能量饮兴奋、布丁享受；包含拿取和放回 |
| 隐私 | 清除输入状态、暂停互动反馈，不显示输入内容或触发输入音效 |

反馈优先级为：起床气 > 安抚 > 道具反馈 > 打字反馈。拍尾反应及淡出期间不叠加喝水和其他待机动作。切换模型或停止绘制器会清理反应，普通设置同步不会重新计时。2D / 3D 都遵循相同时间规则，但按各自骨架绘制。

## 发布 GitHub 模型目录

默认源是本项目的 `main` 分支：

```text
https://raw.githubusercontent.com/bucai2417/kurcat/main/model-store/catalog.json
```

### 直接在 GitHub 网页上传

1. 在模型库导出模型包。首次发布时检查 `skin.id` 和名称，补充作者、许可、简介与 `profile.revision: 1`；这些字段目前通过文本编辑器或 GitHub 编辑文件填写。
2. 展开“发布自己的模型”，点“打开上传页面”，登录 GitHub 后上传到仓库 `main` 分支的 `model-store/` 文件夹，保留 `.kurocat.json` 后缀。无需手写目录，也不需要本地安装依赖。
3. 等待 Actions 的 **Publish model catalog** 完成。它检查 UTF-8、包格式、重复 ID、数量与大小，自动生成并提交 `catalog.json`。
4. 回到模型库点击“加载 / 刷新”，选择已发布模型，确认导入。已安装相同内容会显示“内容一致”。
5. 发布更新时保持模型 ID 不变，提高 `profile.revision`，并替换原文件；不要同时保留两个相同 ID 的模型包。包格式 `version` 根据外观包 / GLB 包使用 1 / 2，它不是模型修订号。
6. 从 GitHub 删除模型包并等待目录更新即可下架；已安装到其他电脑的副本会继续保留。卸载本机副本请在 UI 的本机列表操作。

仓库当前附带 [薄荷云朵外观包](../model-store/mint-cloud.kurocat.json) 和 [奶蛙 3D 清单包](../model-store/naiwa-3d.kurocat.json)。只有 `model-store/` 顶层的 `*.kurocat.json` 普通文件参与索引。目录最多 50 个包，总大小不超过 256 KiB；生成顺序按文件名固定。目录中放包的清单；GLB 请用 `asset.url` 引用公开 GitHub Raw 文件，配合 SHA-256 验证内容。推荐把 URL 的分支名换成不可变提交 SHA，避免模型文件更新后旧清单校验失败。导出产生的内嵌 `asset.data` 包适合离线分享，不适合直接塞进 256 KiB 的商城目录。

### 自动发布失败时

在 Actions 查看失败步骤。模型校验失败时旧目录保留，修正模型文件后重试。工作流用仓库自带 `GITHUB_TOKEN` 提交，仅发布任务请求 `contents: write`；不需要在桌宠中保存令牌。若仓库组织策略或分支保护禁止 bot 写入，可下载校验任务的 `model-catalog` artifact，将里面的 `catalog.json` 通过正常提交或 PR 更新。PR 只校验并生成 artifact，不直接发布。推送采用普通快进推送；遇到并发更新失败，可在 Actions 重新运行发布流程。

也可在已有 Node 22.15+ 的环境运行下面两个无 npm 依赖的命令，生成目录后一起提交。不会构建桌宠：

```sh
node scripts/build-model-catalog.mjs
node scripts/build-model-catalog.mjs --check
```

### 其他模型源

UI 接受 GitHub 的 `blob/.../catalog.json` 文件链接并转换为 Raw，也接受其他公开仓库的 Raw 地址。可以把分支名替换为提交 SHA 固定版本。普通仓库首页不作为目录地址。

```json
{ "format": "kurocat-catalog", "version": 1, "models": [] }
```

上面是合法空目录；`models` 元素必须是完整模型包对象，不能只是文件名或 URL。最终下载仅访问 `raw.githubusercontent.com` 的 HTTPS 地址，禁止重定向、凭据、查询参数与片段；超时 10 秒，按流限制大小并严格检查 UTF-8。私有仓库认证、付费购买、后台自动更新和任意骨架资源下载暂未实现；现有模型的静态缩略图与放大预览已支持。

## MCP 使用

- `get_builtin_rigs`：设计皮肤前查询 cat / naiwa / dafeiyu 的部件、字段、动作标签、输入映射、形变与模式限制。
- `get_model_contract`：读取版本、适配器、动作与反应清单，以及修订/简介字段规则、默认目录、上传页面与更新策略。
- `import_model_pack`：参数 `package` 为完整包对象；`replace`、`activate` 默认 `false`。已有 ID 必须显式替换，激活时自动选兼容模式。版本 2 必须包含 `asset.data` Base64；MCP 客户端先下载并校验 `asset.url`，原生工具不代为下载任意 URL。
- `export_model_pack`：传入 `id`，返回完整 JSON（版本 2 包含内嵌 GLB），由调用端保存为 UTF-8；不会直接写桌面文件。
- `list_cats`：读取本机模型与元数据；`switch_cat` 选择兼容模式；`delete_cat` 删除自定义模型，删除当前模型时回退到黑猫。该 MCP 工具同时保留“重置被修改的内置外观”的既有能力。
- `get_idle_actions`：返回当前模型、模式、可用动作和自动待机设置。
- `trigger_idle_action`：按 `kind` 请求动作，例如 `nap`、`tailGround`、`calm`；不修改自动待机开关。请求可能因隐私或冲突中的互动被忽略，返回成功表示请求已保存，并非动画已播完。
- `get_mood`：返回保存的情绪请求与序号，不代表实时渲染状态。起床气安抚用 `calm`，不是把烦躁表清零。

## 版本 2：GLB 文件与动作映射

最小结构如下（哈希、资源 URL、ID 和动作名需要替换为自己的真实值）：

```json
{
  "format": "kurocat-model",
  "version": 2,
  "profile": {
    "adapters": ["three-glb-v1"],
    "behaviorContract": "cat-v1",
    "author": "你的名字",
    "license": "填写你有权授予的许可",
    "revision": 1,
    "glb": {
      "sha256": "替换为资源的64位小写SHA-256",
      "height": 2.3,
      "yaw": 0,
      "animations": { "idle": "Idle", "typing": "Typing", "mouse": "Mouse", "nap": "Sleep", "wave": "Wave" }
    }
  },
  "skin": { "id": "my-glb-pet", "name": "我的3D宠物", "furColor": "#e9ead4", "eyeColorTop": "#161b17" },
  "asset": { "url": "https://raw.githubusercontent.com/用户名/仓库/提交SHA/models/pet.glb" }
}
```

- `asset` 二选一：`data` 为 Base64（本地导出和 MCP 安装），或 `url` 为允许的公开 GitHub Raw HTTPS 地址（UI 导入 / 商城）。SHA-256 不匹配会停止安装；不支持任意下载站或文件系统路径。
- `height` 为初始 `idle` 姿态的归一化高度（没有 `idle` 时使用绑定姿态），范围 0.5–4，默认 2.3；`yaw` 为朝向角度，范围 -180–180，默认 0。只在加载时确定尺度，切换 UI / 动作不会按动态包围盒重新缩放。
- `skin` 字段提供库内名称和兼容元数据；GLB 的外观来自其材质和贴图，修改猫咪配色字段不会给任意网格重新上色。
- GLB 必须为 glTF 2.0，只有 JSON 与 BIN 数据块，网格和 PNG/JPEG 贴图均内嵌，不允许 URI、外部文件、脚本、Draco、Meshopt 或 KTX2。单个二进制最大 16 MiB，完整 JSON 包最大 23 MiB；最多 4096 节点、512 网格、64 动画、16 张贴图，单张不超过 4096×4096、合计不超过 1600 万像素。
- 动作映射的键可用 `idle / typing / mouse / nap / angry / delight / sway / wave / pet / stretch / tilt / slowBlink / groom / cuddle / roll / listen / shimmy / pawCheck`；值必须为 GLB 中存在且唯一命名的片段。支持骨骼动画与形态键。通用适配器没有映射的菜单动作不会显示，输入反应缺失时回退到待机或静态姿态；奶蛙专用适配器的交互动作由应用共享引擎提供。
- 裸 `.glb` 导入会检查骨架层级、软臂表面朝向、挂点、瞳孔、表情和 `idle` / `nap` 片段，完整匹配时使用 `three-naiwa-v1`，否则使用 `three-glb-v1`，不依据文件名猜测。旧版以通用适配器导入的奶蛙可重新导入裸 GLB，或使用修订 2 的奶蛙清单。导出的离线包保留适配器、映射及完整 GLB。
- 动作切换使用 0.22 秒平滑混合；键鼠输入、抚摸和情绪可中断手动动作。奶蛙 `nap` 先播放入睡段，再保持片段中部的睡眠区间，避免反复闭眼又醒来；因此替换奶蛙睡眠片段时需保留前 40% 入睡、40–60% 熟睡的布局。通用 GLB 睡眠片段应自行制作成合适的循环。
- `three-naiwa-v1` 使用经过校验的专用软臂和脚部接触控制，支持正常键鼠、拿杯饮用、输入中断、头眼跟随、表情和共享动作。通用 `three-glb-v1` 不自动重定向任意骨架或生成缺失动作，并隐藏未适配的真实道具；隐私模式停止输入驱动。

## 后续作者工具与接触求解

GLB 加载、保存、删除、导出、静态预览、动作映射及过渡已接通。完整奶蛙骨架的实时接触和共享行为已实现；下面是将相同能力扩展到任意外部骨架时的制作与验收要求，通用适配器尚不具备这些能力：

| 接入部件 | 外部模型需要提供的信息 | 验收要求 |
| --- | --- | --- |
| 道具挂点（socket） | 左右爪握持点、嘴部接触点、杯子局部握点、桌面落点 | 端起时手杯同步；饮用接近嘴部；放回原位；中断不悬空 |
| 逆向运动学（IK） | 上臂、前臂、爪骨及弯曲方向约束 | 任意缩放与左右道具位置下，爪能接触目标 |
| 动画混合 | 待机、睡眠、起身、抚摸、四种打字反应、各道具、拍尾、打滚片段或参数 | 输入可中断；退出有过渡；不得持续假敲键 |
| 地面与尾巴 | 尾根、尾链、尾尖接触点、身体地面高度 | 尾根不脱离；落地瞬间发特效；身体和尾尖不穿地 |
| 表情与特效 | 眼皮遮挡、眼睛、耳朵、字幕锚点、爱心/冲击挂点 | 文字不裁切；起床气与安抚可区分；遵守隐私与反馈优先级 |
| 点击区域 | 模型轮廓、道具实际边界和可抚摸区域 | 点击杯柄、吸管有效；透明空白可穿透 |
| 生命周期 | 卸载资源、撤销监听、释放材质/纹理/音频、取消异步加载 | 重复切换无旧动作、无持续音频、无资源累积 |

模型包目录只分发数据和资源，行为代码由应用自带适配器提供。新适配器先通过共同动作契约回归，再开放到导入 UI 和 MCP。

## 验证

已有依赖时可运行以下检查，无需打包：

```sh
node node_modules/typescript/bin/tsc --noEmit
node scripts/check-pet-motion.mjs
node scripts/check-model-library.mjs
node scripts/check-glb-import.mjs
node scripts/check-glb-motion.mjs
node scripts/build-model-catalog.mjs --check
```

回归脚本需要 Node 22.15+，覆盖状态时序、动作中断、尾尖接地、完整 2D 特效绘制路径、包格式、中文与目录下载校验。模型库回归另外覆盖修订比较、目录生成、过期索引、错误下载、删除后的设置持久化与事件广播，不依赖 npm 包。检查模拟 Canvas/WebGL 绘制与浏览器环境，不替代安装包中的视觉与原生窗口测试。Rust 模型校验单元测试和安装包构建交给 GitHub Actions。

## 键盘与鼠标资源

商城现按宠物 / 键盘 / 鼠标及 2D / 3D 分类，键鼠支持独立替换、图片预览、导入导出和删除。制作步骤、完整字段、行为验收与发布说明见 [资源创作教程](RESOURCE_AUTHORING.md)。键鼠使用独立的 `.diycat.json` 协议与 `resources.json` 目录，不混入宠物 `catalog.json`。
