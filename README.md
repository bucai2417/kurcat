# 🐈‍⬛ DIY-Cat

> **当前版本：1.0.0** · [项目仓库](https://github.com/bucai2417/kurcat) · [下载与发布记录](https://github.com/bucai2417/kurcat/releases) · [GitHub Actions 构建](#github-actions-build)

轻量级 **Windows（Win10/11；Win7/8.1 实验包）/ macOS（10.15+ Apple Silicon & Intel）/ Linux（银河麒麟 KylinOS / Ubuntu / UOS）** 透明置顶桌面打字猫咪伴侣（开箱自带 **7 款猫咪皮肤 + 🐸 奶蛙 + 🐳 大肥鱼（鲸鱼娘）**：经典小黑猫、暖奶茶布偶猫、大橘猫、三花猫、奶牛猫、暹罗猫、奶猫、奶蛙、大肥鱼，支持**输密码自动闭眼/捂眼防偷窥**，并原生内置 **MCP 协议服务端**，支持用 AI 一句话定制或新增更多你自己的猫咪！），基于 **Tauri v2（Rust 全局原生钩子 + 内置 MCP 引擎 + HTML5 Canvas 2D + Three.js 3D）** 打造。桌面版支持透明窗口与全局键鼠监听；系统运行库要求以对应平台构建产物为准。

DIY-Cat 在上游 KuroCat 的基础上继续开发 2D / 3D 互动与模型库，版本从 **1.0.0** 开始。程序检查更新和下载安装均使用 `bucai2417/kurcat` 的正式 Releases，仅识别 `DIY-Cat-` 开头的发布包，不把旧 KuroCat 4.x / 5.x 版本当成更新。已有设置目录、MCP 服务 ID `kurocat` 与 `.kurocat.json` 模型格式保留兼容。

## 未发布更新（Unreleased）

以下变更属于当前源码分支，安装包请以 GitHub Actions 和 Releases 实际产物为准；不改变已发布的 1.0.0 标签。

- **奶蛙与奶猫内置**：奶猫沿用猫咪 2D / 3D 骨架；奶蛙使用专用 2D 适配器和参考图拆分素材，坐着操作键鼠。普通按键（包括空格）和鼠标由手完成，仅配置的原尾巴按键改成脚踩，双脚平时在两侧轻摆。
- **2D 奶蛙连续手部与嘴边鼓腮**：奶蛙的手臂、掌心和三指连成一层皮肤，掌心沿伸手方向自然转动，点鼠标时指尖轻触上缘，拿道具时收拢；伸缩和回弹不改变接触点。生气时只在嘴巴两侧小幅鼓腮，搭配斜压眼皮、收紧嘴型与轻微泛红；安抚后逐渐回落。
- **坐着打盹 · 流口水**：奶蛙保持坐姿闭眼打盹，轻微点头与呼吸，闭眼后嘴角渐渐流出口水；醒来时口水平滑收回。自然醒来或被输入、停止动作、拿饮品打断时平滑衔接；键鼠吵醒仍触发跺脚起床气。
- **2D 奶蛙专属行为**：新增左右晃身、好奇探头和交替摆脚；左右倾斜经过中间姿态，眼神先动、身体随后，输入时平滑收回。保留无声鼓腮、蓄力小跳和拍肚皮；移除奶蛙专属合成音效，键鼠音效仍独立控制。
- **导入与 MCP 骨架说明**：支持 `canvas-naiwa-v1` + `cat-v1` 的原奶蛙包；无 profile 的旧“naiwa”奶猫保持猫咪骨架。MCP 新增 `get_builtin_rigs`，列明 cat / naiwa / dafeiyu 可用模式、换肤字段、部件、动作与形变通道。新增版本 2 GLB 模型包：`three-glb-v1` 和 `three-naiwa-v1` 可加载自包含 GLB，并按文件实际动画开放动作；UI、MCP、导入导出和 GitHub 目录共用能力声明。
- **3D 奶蛙与猫咪共用交互控制**：使用 [Blender 连续皮肤与 80 骨骼模型](art/naiwa/README.md)，桌宠默认坐姿。`three-naiwa-v1` 接入猫咪的键盘、鼠标、道具、连续输入情绪、睡眠与小动作控制；双手跟随真实接触点，软手臂末端沿掌心方向衔接并分散扭转。眼睛先看向鼠标、头部随后平滑转向，瞳孔随好奇、兴奋和生气变化；所有情绪下都禁用鼓腮，生气由眼皮和嘴型表达。坐姿高度在加载时固定，切换动作不重新缩放。支持拿取五种道具、伸缩舌头接替原尾巴按键、脚跺地、无声吸鼻涕、检查手掌等；招手带动肩胸、头部和手指，打滚按侧倒、抱手、交替蹬腿、撑起坐稳衔接。普通键鼠仍由双手完成，坐着打盹会闭眼流口水；趴睡尚未制作。导入 [奶蛙 3D 模型包](model-store/naiwa-3d.kurocat.json)，或导入通过完整骨架校验的裸 GLB，即可启用专用控制。已有开发环境打开 `/naiwa3d.html` 可直接体验与桌宠相同的键鼠、道具和动作控制，包括“伸舌头按键”“吸吸鼻涕”按钮；[制作说明](docs/naiwa-3d-design.md) 区分作者动画与运行时行为。
- **2D HTML 动作对照**：预览页提供参考图、双手敲键、点鼠标、原尾巴按键、嘴边鼓腮、坐着打盹 · 流口水、左右晃身、好奇探头、交替摆脚与停止动作按钮，关闭随机待机后仍可反复触发和停止手动动作。

## 已有功能

- **睡眠被打断后的起床气**：猫咪打盹时，键盘按下、鼠标按下或滚轮会把它吵醒。2D / 3D 都会生气拍尾，尾巴先抬起蓄力、快速落地、再回弹，落地点带冲击反馈，并显示清晰中文气泡。随机 **2–5 秒**恢复，继续输入不会延长；来回抚摸头部可提前安抚。普通移动鼠标不会吵醒。
- **更清晰的互动反馈**：起床气、安抚、道具与连续打字使用高对比文字；同一时刻按优先级显示，避免文字重叠。隐私模式会清理并暂停这些输入反应。
- **多模型库与图片预览**：本机可保存多个模型，按名称、作者和 2D / 3D 能力筛选，点击缩略图可放大并切换查看支持的 2D / 3D 外观，无需先启用模型。支持多选文件或目录 JSON 批量导入、导出全部自定义模型、删除与冲突确认；批量导入不切换当前猫咪。当前桌面显示一只猫，多模型指保存和切换。
- **拖动与点击分离**：从猫咪或道具区域按住拖动；原地点击道具才会使用。增加释放、失焦与取消后的状态清理，Windows 拖动检查真实鼠标按键，更新提示只占用自身命中区域。
- **会表达情绪的 3D 耳朵**：左右耳独立轻抖、朝向鼠标，侧耳听、打盹、抚摸和生气分别有平滑过渡的耳朵姿态。
- **GitHub 模型发布**：默认读取 `bucai2417/kurcat/main/model-store/catalog.json`。UI 提供上传入口；将 `.kurocat.json` 上传到 `model-store/` 后，**Publish model catalog** 工作流自动校验并提交目录，回到模型库刷新即可安装。发布和下架步骤见 [模型包文档](docs/model-packs.md#发布-github-模型目录)。
- **统一模型能力契约**：UI、MCP、OBS 根据适配器提供的能力选择 2D / 3D 模式和动作。版本 1 包含内置猫咪与奶蛙的外观配置，继承其互动；版本 2 导入带网格、贴图、骨架与动画的自包含 GLB。支持直接选择 `.glb`，或用包声明动作映射、SHA-256 和 GitHub Raw 资源；导出包含完整资源。`three-naiwa-v1` 使用应用内的专用接触求解与共享动作；通用 `three-glb-v1` 仅播放映射片段，不具备道具抓握。尚不支持 VRM / Live2D 和任意骨架自动重定向。详细格式、动作列表及后续设计见 [模型包文档](docs/model-packs.md)。

### 模型商城与创作

右键 → 设置 → 模型库，选择 **宠物 / 键盘 / 鼠标**，再选 **2D / 3D**。点击“查看图片”预览，加载 GitHub 目录后安装，再点“用于 2D / 3D”。键盘和鼠标独立替换，不必重新更换宠物。可导入多个包、导出当前设计、导出全部和删除；当前设计包含个人键帽修改，列表导出保留原包。删除正在使用的资源会恢复桌面主题。

- [完整制作教程：宠物、键盘、鼠标（2D / 3D）](docs/RESOURCE_AUTHORING.md)
- [模型包协议与动作能力](docs/model-packs.md)
- [GitHub 上传与目录维护](model-store/README.md)

模板和教程入口也在模型库内。键鼠包使用 `.diycat.json`，宠物包使用 `.kurocat.json`；JSON 文件统一使用 UTF-8。版本 1 宠物和键鼠包是外观配置；版本 2 宠物包携带 GLB 资源，单个 GLB 最大 16 MiB，完整包 / 导入批次最大 23 MiB。VRM / Live2D、任意键鼠网格仍未支持。

锁定鼠标穿透后，不按 Alt 将指针移到宠物或桌面道具上，会自动隐藏整个宠物画面；移开或按 Alt 后恢复，便于操作被遮住的内容。

## 🎬 上游历史演示

以下链接与图片展示上游 KuroCat，供了解原始外观；不代表 DIY-Cat 1.0.0 的全部功能。

<table>
  <tr>
    <td align="center" width="54%" valign="top">
      <a href="https://qianyi.one/kurocat/" target="_blank" rel="noopener">
        <img src="docs/playground-demo.webp" alt="KuroCat 官网实时网页试玩（7 款皮肤切换 · 65%/108 键 · 密码防偷窥）" width="400" />
      </a>
      <br/>
      <strong>🎮 <a href="https://qianyi.one/kurocat/">点此进入官网实时在线试玩（直接敲键盘 &amp; 摸猫头）→</a></strong>
      <br/>
      <sub>内置 6 款猫咪 + 🐳 大肥鱼 · 65%/108 键 · 正反双视角 · 密码防偷窥 · 20%–150% 无级缩放</sub>
    </td>
    <td align="center" width="46%" valign="top">
      <a href="https://qianyi.one/kurocat/#whale-demo" target="_blank" rel="noopener">
        <img src="docs/whale-demo.webp" alt="KuroCat 🐳 大肥鱼（鲸鱼娘）14s 演示视频（鼠标 + 打字 + 鲸尾三同动 · 加速笑开花 · 密码捂眼防偷窥）" width="272" />
      </a>
      <br/>
      <strong>🐳 <a href="https://qianyi.one/kurocat/#whale-demo">观看 1080×1920 60fps 含音效原版视频 →</a></strong>
      <br/>
      <sub>
        鼠标 + 手打字 + 鲸尾甩拍三同动 → 加速笑开花 → 密码捂眼防偷窥<br/>
        📥 <a href="https://qianyi.one/kurocat/media/whale-douyin-14s.mp4">下载原版 MP4（国内高速）</a> · <a href="https://github.com/qianyiai/kurocat/releases/download/v4.7.0/KuroCat-whale-demo-14s.mp4">GitHub 原片</a>
      </sub>
    </td>
  </tr>
</table>

## 📥 下载与更新

请到 [bucai2417/kurcat Releases](https://github.com/bucai2417/kurcat/releases) 下载已公开的 **DIY-Cat** 版本。以页面实际上传的附件为准；尚未发布时，可先通过下面的 Actions 流程下载测试包。不要使用上游 KuroCat 安装包验证本项目的新功能。

| 平台 | 构建产物 | 使用方式 |
| --- | --- | --- |
| Windows x64 | `DIY-Cat-1.0.0-x64-setup.exe` | 安装版 |
| Windows x64 | `DIY-Cat-1.0.0-x64-portable.zip` / `DIY-Cat-1.0.0-windows-x64.exe` | 便携版；独立 exe 也供程序内更新下载 |
| macOS Universal | `DIY-Cat-v1.0.0-macos-universal.dmg` | 将 DIY-Cat.app 拖入“应用程序” |
| Linux amd64 / arm64 | `DIY-Cat-v1.0.0-linux-<arch>.deb` / `.AppImage` | 按系统架构选择；AppImage 为尽力构建 |
| Android 8.0+ | `DIY-Cat-1.0.0-android.apk` | 签名 APK，2D 悬浮宠物；[安装与权限](docs/ANDROID.md) |
| Windows 7 SP1 / 8.1 x64（实验） | `DIY-Cat-1.0.0-win7-x64-experimental.zip` | 需旧版 WebView2 与系统补丁；[限制与排查](docs/LEGACY_WINDOWS.md) |

上表为标签构建的命名约定，以 Release 实际附件为准。常规 Windows 包面向 Win10/11；实验包通过编译不等于已验证旧系统运行兼容性。Android 当前提供 2D 悬浮宠物，不包含桌面版 3D、模型商城和 MCP。

macOS 首次运行需在“系统设置 → 隐私与安全性”中为 **DIY-Cat** 授予“辅助功能”与“输入监控”。Stdio MCP 路径为 `/Applications/DIY-Cat.app/Contents/MacOS/DIY-Cat`，参数为 `--mcp`。

软件启动或手动检查更新时，从本仓库读取非草稿、非预发布的三段版本号 Release，并按当前平台选择 DIY-Cat 附件。重命名版本通道不会混入上游旧包；草稿或未上传 DIY-Cat 附件的版本不会触发安装。

<a id="github-actions-build"></a>
## ☁️ 使用 GitHub Actions 构建

本地无需安装构建依赖。在仓库 **Actions → Build Cross-Platform Release → Run workflow** 选择目标分支；只测试 Windows 时勾选 `windows_only`，或选择 `android_only`、`legacy_only`、`macos_only`、`linux_only`，平台筛选项最多选择一个。全部不选则构建所有平台。可填写 `release_tag: v1.0.0` 作为文件名标签。

工作流先检查 TypeScript、互动回归、模型和键鼠资源目录，再在 GitHub runner 安装依赖、执行 Rust 测试并打包。运行成功后，从该次运行的 **Artifacts** 下载相应平台产物。普通代码推送不会触发二进制构建。

推送 `v1.0.0` 等版本标签会触发同一工作流，并把附件上传到 **Release 草稿**。验证测试包后再公开草稿，软件内检查更新才会看到它。后续版本需同步 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 、`src-tauri/tauri.conf.json` 和 Android `versionName` 的版本，并递增 Android `versionCode`，再推送对应标签。

## ✨ 核心特性

<table>
  <tr>
    <td align="center" width="50%">
      <img src="website/public/assets/showcase-108key.webp" alt="65% 紧凑 / 108 键全尺寸 × 面向猫咪 / 面向观众双视角" />
      <br/><sub>65% 紧凑 / 108 键全尺寸 × 面向猫咪 / 面向观众双视角</sub>
    </td>
    <td align="center" width="50%">
      <img src="website/public/assets/showcase-mouse.webp" alt="鼠标左/右键独立高亮 + 自动更新提醒" />
      <br/><sub>鼠标左/右键独立双色高亮 + App 内自动更新提醒</sub>
    </td>
  </tr>
</table>

- **9 款内置模型（7 款猫咪 + 🐸 奶蛙 + 🐳 大肥鱼鲸鱼娘）+ MCP 自定义**：
  - **🐈‍⬛ 经典小黑猫** / **🐱 暖奶茶布偶猫** / **🍊 大橘猫**（虎斑 `M` 额纹 + 环纹尾） / **🌸 三花猫** / **🐄 奶牛猫**（燕尾服 + 白手套） / **🤎 暹罗猫**（挖煤重点色） / **😹 奶猫** / **🐸 奶蛙**（2D 坐姿、连续软手臂、嘴边鼓腮与坐着打盹 · 流口水） / **🐳 大肥鱼（鲸鱼娘）**（三肢同步键鼠 + 鲸鱼尾拍打右侧功能键带水花特效 + 稳定 4 表情与手速腮红），右键或系统托盘 0.1 秒一键无缝切换。
  - **🙈 系统级输密码自动闭眼 / 捂眼防偷窥**：Windows（UI Automation `CurrentIsPassword` + Win32 `ES_PASSWORD`）与 macOS（`IsSecureEventInputEnabled` + `AXSecureTextField`）自动感知密码输入框，Rust 底层钩子直接拦截真实按键不外传——猫咪温柔闭眼、大肥鱼双手捂眼并覆盖键盘防窥遮罩，可右键/托盘随时开关。
  - **🤖 原生内置 MCP 服务（AI 一句话捏自己的猫）**：无需装 Node.js 或 Python，直接把自家猫照片发给 **Claude Desktop / Cursor / Antigravity / Windsurf / Cline**，AI 通过内置 MCP 工具自动生成橘猫（虎斑 `M` 额纹 + 环纹尾）、三花猫、奶牛猫、暹罗猫、英短蓝猫或带专属胎记斑块的独一无二桌宠，**0.4 秒热更新到桌面、无需重启**！
- **65% / 108 键全尺寸可选 + 键盘正反视角可选 + 鼠标左右键独立识别**：
  - 支持 **65% 紧凑机械键盘** 与 **108 键全尺寸机械键盘（完整 F1~F12、PrtSc/ScrLk/Pause、顶部 4 颗多媒体键、独立方向/编辑区与完整数字小键盘，含 2U 竖长 `+` 与独立小回车 `Num↵`）**，右键或托盘一键切换并自动平滑调整窗口宽度。
  - **108 键不再撑大画面**：新增「键盘尺寸」滑杆（65% 默认 100%、108 默认 85%），切换配列时左右留白保持一致，想还原真实 1:1 键距可自行拖到 100%。
  - 支持 **「面向猫咪（180° 真实视角）」** 与 **「面向观众（正向字母易读视角）」** 自由切换，同步重投影 3D 梯形透视；**鼠标朝向可单独设置**（跟随键盘 / 固定面向猫咪 / 固定面向观众），键盘转、鼠标不转也能自由组合。
  - 鼠标左键（`L`）、右键（`R`）、中键/滚轮完全独立区分高亮（左键用猫咪主强调色、右键用高对比珊瑚橙/天蓝色、各自带 3D 按下阴影与迷你 `LMB`/`RMB` 气泡），猫爪握鼠时自动露出双键并向对应按键偏移轻拍，支持左右键同时按住！
  - 纯打字时头部与上身随敲击节奏灵动左右晃动歪头，未敲键一侧自动蜷爪收在胸前。
- **🌈 键盘 RGB 灯光（9 种效果 · 单色/多选/随机配色 · 边缘灯带）**：
  - **常亮 / 呼吸 / 流光彩虹 / 随机炫彩 / 波浪 / 按键涟漪 / 打字余晖 / 极光**，加上关闭共 9 档；开启后键帽自动转为背光暗壳，光才透得出来。
  - **三种配色模式**：**单色**（主色 + 副色双色可调）、**多选配色**（自选 2–16 种颜色，逐键铺开）、**随机颜色**（从调色板随机取色并持续轮换）。开启「按键涟漪」后，每次敲键都会溅出一圈**不同颜色**的光环。
  - **键盘边缘灯带**：像真实 RGB 键盘那样，机身边缘有一圈随音乐律动的彩色光带，颜色跟随配色模式轮换。
  - 亮度 10%–100%、流动速度 0.2×–3× 连续可调；可限定只亮 **全部按键 / 仅字母数字 / 仅 WASD / 仅数字区**。
  - **按键响应**：敲哪个键哪个键亮起副色；底座另有一圈柔和环境辉光。
  - 空闲 3 秒后自动降到约 15fps 继续呼吸，静止 60 秒后休眠，兼顾炫光与低功耗。
- **🎨 2D / 3D 键帽 DIY（分别保存）**：
  - 右键菜单打开设计器，按当前模型模式编辑。**2D / 3D** 均支持顶面、侧面、文字颜色以及自定义文字和 Emoji，分别保存；Emoji 的显示取决于系统字体。
  - 提供 WASD、数字区、Esc、方向键等配色方案；清除当前模式的 DIY 不影响另一模式。
  - MCP 的 `set_keycaps`、`get_keycaps`、`clear_keycaps` 接受 `mode: "2d" | "3d"`。合法键名由 `get_keycaps` 返回。
- **🎨 2D / 3D 键鼠资源**：
  - 内置经典奶白、暗夜碳纤、胡桃木、樱花奶油、赛博终端、深海鲸；键盘底座、键帽、修饰键、强调键、鼠标外壳与按键可以分别配色。
  - OEM / SA / 矮轴 / 果冻键帽、三种鼠标轮廓、材质与程序化纹理分别由 2D / 3D 绘制器呈现；两种模式的视觉效果可以不同。
  - 自定义外观存入 `desk-skins.json`；MCP 的五个桌面皮肤工具负责查询、新增、切换和删除。
- **🥤 键盘旁边的小道具（点一下就喝，动作完整）**：
  - 内置 **可乐 / 咖啡 / 奶茶 / 能量饮 / 布丁** 五种，可放键盘左侧或右侧（放左侧时鼠标自动让位到右侧），支持手动开关。
  - **点击道具立即触发完整的四段动作**：靠近道具的那只手伸出 → **端起杯子举到嘴边** → 眯眼倾斜喝一口（液面下降）→ 放回桌面、手收回。手臂是毛绒渐变 + 爪掌，和猫的身体同一套画风。
  - **喝的时候会闭眼享受**，喝完在头顶弹出气泡反馈（🥤 嗝～ / ☕ 提神！ / 🧋 好喝～ / ⚡ 满电！ / 🍮 甜甜的）。
  - **每种饮品一套粒子特效 + 一套专属表情**（喝完会明显不同，不是全都闭眼）：
    - 🥤 可乐：**打嗝** —— 整只猫上下一跳、嘴边冒气泡、半眯眼
    - ☕ 咖啡：**精神一振** —— 眼睛睁大、耳朵快速抖动、尾巴狂摆
    - 🧋 奶茶：**满足** —— 眯眼 + 呼噜 + 腮红
    - ⚡ 能量饮：**过载** —— 双眼发青蓝光、脑袋高频轻颤
    - 🍮 布丁：**陶醉** —— 眯眼 + 腮红加深 + 飘爱心
  - 用户离开 20 秒后也会自己喝；杯子喝空会露出失落表情并提示 **「点我续杯」**，点击即可续满。
  - **🐳 大肥鱼单独适配**：她用自己的手端杯、身体侧倾靠近杯子，喝完会甩一下鲸尾并露出开心表情。
- **🐾 待机与手动动作**：
  - 2D / 3D 猫咪支持伸懒腰、挥手、歪头、慢眨眼、洗脸、打盹、撒娇和饮用道具。3D 另有地上打滚、侧耳听、抖毛、检查爪子，使用现有骨架平滑衔接。
  - 自动待机默认在空闲 6 秒后开始，可设置 2–120 秒或关闭；手动点动作不会重新开启自动待机。输入可打断普通动作，打盹时的键盘、鼠标按下与滚轮会触发起床气，普通鼠标移动不会吵醒。
  - 大肥鱼沿用专用 2D 绘制器，支持喝饮料、伸懒腰与挥手。菜单只显示当前模型可完成的动作。
  - MCP 使用 `trigger_idle_action` 的 `kind` 参数；`sleep` 兼容为 `nap`，`roll` 为 3D 真正打滚，`tailGround` 为拍尾起床气，`calm` 为安抚。完整能力请查 `get_idle_actions`。
- **⌨️ 连续输入的不同反应**：
  - 猫咪会在专注、律动、兴奋与烦躁之间呈现不同姿态，搭配耳朵、身体、眼皮和中文提示。2D 生气通过眼皮遮挡眼睛表现。
  - 停止输入后动作淡出，不再持续假敲键。自动反应可在设置中关闭；MCP 使用 `set_mood_tracking` 控制。
  - `get_mood` / `set_mood` 读取或设置烦躁、晕眩的保存请求，查询值不是当前画面的实时情绪；睡眠起床气有独立计时，可用 `calm` 安抚。
- **🔊 键鼠音效与呼噜独立控制**：
  - 键盘和鼠标音效可分别开关，共用音量滑条，并可选择红轴 `linear`、茶轴 `tactile`、青轴 `clicky`、静音轴 `silent` 风格。这些是 Web Audio 合成音色，不是实物轴体录音。
  - 呼噜有独立开关，关闭后立即停止；禁用呼噜不影响已开启的键鼠音效。设置窗口与右键菜单同步保存。
- **App 内新版本提醒与检查**：启动后及定时检查本项目 `bucai2417/kurcat` 的稳定 Releases，有更新时显示提醒。右键菜单、系统托盘的「检查更新」只检查；确认点击「立即更新」后才下载、SHA-256 校验并安装重启（Windows 安装版 / 绿色单文件版 / macOS 通用版）。API 请求失败时尝试仓库的备用更新索引，并提示备用来源可能滞后；连接失败、没有本项目稳定版与没有对应平台附件分别提示。索引由 `.github/workflows/update-index.yml` 在正式发布事件后更新，需先合入默认分支。
- **摸头眯眼与呼噜互动**：鼠标移到猫头上自动切换为黑白描边小手光标，来回抚摸即触发慵懒细眯眼表情，并伴随 Web Audio 实时合成的温柔猫咪呼噜声（默认开启，可随时开关，不干扰自身键鼠声音）。
- **错落弹跳 3D 按键气泡**：键盘上方实时弹出白底立体键帽，支持一键隐藏（输密码更安心）。
- **智能鼠标穿透 & 系统托盘**：透明区域自动点击穿透不遮挡办公或游戏，右键猫咪或系统托盘可一键切换外观、使用 **20%–150% 丝滑滑动条**无级调节尺寸、开关 MCP 服务并**一键复制 MCP 配置**。
- **多显示器选择 & macOS 原生全屏悬浮**：Windows 与 macOS 系统托盘均提供 **「选择显示器」** 子菜单，可将桌宠固定到指定显示器的工作区右下角（拔插外接屏自动回退主屏并在重连后恢复，拖动或选择「自由摆放」即可解除固定）；macOS 13+ 原生支持跨 App 全屏空间悬浮显示。

## 🤖 MCP 接入指南（用 AI 改猫 / 加自己的猫）

DIY-Cat `v1.0.0` 桌面程序原生内置 **Stdio** 与 **本机 Streamable HTTP（`127.0.0.1:27420`）** 双模式 MCP Server，无需任何额外依赖！

### 最快接入方式
1. 运行 `DIY-Cat`，右键猫咪 → 确认勾选 **「开启 MCP 扩展」** → 点击 **「复制 MCP 配置」**。
2. 粘贴到你常用的 AI 客户端 MCP 配置文件（Claude Desktop / Cursor / Antigravity / Windsurf / Cline）：

**方式 A：Stdio 模式（通用推荐，所有 MCP 客户端均支持）**
```json
{
  "mcpServers": {
    "kurocat": {
      "command": "C:\\Users\\<你的用户名>\\AppData\\Local\\DIY-Cat\\DIY-Cat.exe",
      "args": ["--mcp"]
    }
  }
}
```

**方式 B：本机 HTTP 模式（桌宠运行时直接连接）**
```json
{
  "mcpServers": {
    "kurocat": {
      "url": "http://127.0.0.1:27420/mcp"
    }
  }
}
```

### 试试这样跟 AI 说
- *「帮我用 DIY-Cat MCP 新增一只大橘猫（虎斑纹 + 白手套 + 橘色高亮键盘），并马上切过去」*
- *「看这张我家三花猫的照片，用 DIY-Cat MCP 按它的花色和斑点给我捏一只专属桌宠！」*
- *「把桌宠放大到 125%，关闭悬浮按键气泡，切回小黑猫」*

### 内置 MCP 工具清单

| 工具名 | 功能说明 |
| --- | --- |
| `get_builtin_rigs` | 设计前查询 cat / naiwa / dafeiyu 的部件、可导入字段、动作映射、形变与模式限制 |
| `get_model_contract` | 读取模型包/修订规则、适配器、动作与反应契约、默认 GitHub 目录和发布入口 |
| `import_model_pack` | 导入 `package` 对象；`replace` / `activate` 默认 false，已有 ID 需显式替换 |
| `export_model_pack` | 按 `id` 导出 JSON 内容，由客户端保存为 UTF-8 文件 |
| `get_resource_contract` / `list_resources` | 查询键盘、鼠标资源协议、本机资源与四个模式选择槽位 |
| `import_resource_pack` / `export_resource_pack` | 导入或导出 `.diycat.json`；同 ID 替换需要显式确认 |
| `switch_resource` / `delete_resource_pack` | 按 `kind`、`mode` 切换键鼠；删除后回退至桌面主题 |
| `list_cats` / `get_cat_schema` | 查看所有外观、当前模型、花色参数、斑点坐标与品种模板 |
| `upsert_cat` / `switch_cat` / `delete_cat` | 新增或修改外观、切换模型、删除自定义外观或重置内置外观 |
| `get_settings` / `update_settings` | 查询或修改模式、缩放、气泡、猫咪呼噜、项圈、耳机、尾巴控制、键鼠音效、置顶、穿透等设置 |
| `set_prop` / `get_prop` / `trigger_prop_sip` | 设置道具种类、位置、开关，查询配置，触发饮用 |
| `get_desk_schema` / `list_desk_skins` | 查询键鼠主题参数与皮肤列表 |
| `upsert_desk_skin` / `switch_desk_skin` / `delete_desk_skin` | 管理键鼠主题 |
| `get_idle_actions` / `set_idle_actions` | 查询当前模型、模式、可用动作和上次请求；开关自动待机、设置空闲延时 |
| `trigger_idle_action` | 按 `kind` 请求动作，例如 `nap`、`tailGround`、`calm`；不改变自动待机开关 |
| `get_mood` / `set_mood` / `set_mood_tracking` | 查询或设置情绪请求，开关连续打字反应；查询并非实时情绪遥测 |
| `set_keycaps` / `get_keycaps` / `clear_keycaps` | 通过 `mode` 分开管理 2D / 3D 键帽，含顶面、侧面、图例与文字色 |
| `set_lighting` / `get_lighting` | 设置与查询 RGB 效果、配色、亮度、速度和边缘灯带 |

动作是否可用取决于当前模型与模式；请求被保存不代表动画已播放，隐私模式或正在进行的冲突动作可能阻止执行。`update_settings.inputSound` 包含 `keyboard`、`mouse`、`profile`、`volume`；`soundEnabled` 控制猫咪呼噜，关闭立即停止；奶蛙没有专属音效，键盘和鼠标音效单独设置。模型包完整示例及扩展设计见 [接入文档](docs/model-packs.md)。

自定义猫咪配置保存在：
- **Windows**：`%APPDATA%\kuro-cat-pet\cats.json`
- **macOS**：`~/Library/Application Support/kuro-cat-pet/cats.json`

也可手动编辑，桌宠自动实时热重载。

## 🛠️ 本地源码构建

前置环境：Windows 10/11 或 macOS 11+、Node.js 22.15+、Rust 工具链（`cargo`）。

```bash
git clone https://github.com/bucai2417/kurcat.git
cd kurcat
npm install
npm run tauri:dev      # 本地热更新调试
npm run tauri:build    # 编译 Release 可执行文件与安装包
```

### 🌐 不打包也能完整体验（浏览器预览）

没装 Rust / MSVC 也能把**打包后的同一套 UI** 跑起来：

```bash
npm install
npm run dev
```

然后打开 **<http://127.0.0.1:1420/>** —— 页面会自动安装一个 Tauri 预览垫片（`src/tauriPreview.ts`），用 localStorage 模拟设置读写与事件总线，导入的 GLB 二进制单独存入 IndexedDB。你可以直接体验：

- **右键猫咪**打开完整右键菜单（配列 / 外观 / 键帽 DIY / 灯光 / 道具 / 缩放）
- **切换 9 款模型**：小黑猫 / 布偶猫 / 大肥鱼 / 大橘猫 / 三花猫 / 奶牛猫 / 暹罗猫 / 奶猫 / 奶蛙
- **🎨 键帽设计器**：点键、换色、加 Emoji、写自定义文字
- **灯光**：9 种效果 + 单色/多选/随机配色 + 边缘灯带
- **道具**：点杯子，猫会伸手把杯子端到嘴边喝一口，喷粒子、液面下降
- **键盘/鼠标输入**：敲键盘、点鼠标左右键都能看到反应

> 预览模式的设置和模型信息存入 localStorage，GLB 文件存入 IndexedDB 的 `diy-cat-model-assets` 数据库，刷新后保留；桌面端图标 / 托盘 / 点击穿透等原生能力仍需安装包验证。清空预览时，在 DevTools 清理 `kurocat-preview-v1` 和该 IndexedDB 数据库；先导出需要保留的模型。

奶蛙 2D 对照预览：`http://127.0.0.1:1420/harness.html?breed=builtin-naiwa&idle=0`；3D 桌面互动预览：`http://127.0.0.1:1420/naiwa3d.html`；奶猫预览：`http://127.0.0.1:1420/harness.html?breed=builtin-milk-cat`。3D 页与桌宠共用引擎，可测试视线跟随、输入、道具、招手、打滚、睡觉与吵醒反应，并切换 65 / 108 键盘。已有依赖时只需运行 `npm run dev`，无需打包。

另外还提供了一个参数化工装页：`http://127.0.0.1:1420/harness.html?layout=108&light=wave&mode=palette&edge=1&prop=coffee,right`，适合快速比对单点效果。

## 📄 开源协议与致谢

本项目基于 [MIT License](LICENSE) 开源。

- DIY-Cat 基于 [qianyiai/kurocat](https://github.com/qianyiai/kurocat) 继续开发，保留原项目许可与素材署名。

- 内置皮肤 **🐳 大肥鱼（鲸鱼娘）** 运行时素材基于 MIT 开源项目 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（参考衍生 [QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu)）制作，完整许可声明见 `src/assets/dafeiyu/LICENSE-MIT.txt`。
