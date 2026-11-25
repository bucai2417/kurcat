# 🐈‍⬛ KuroCat

> 🌐 **上游官方网站与网页端在线试玩 / 国内高速下载**：[**https://qianyi.one/kurocat**](https://qianyi.one/kurocat)

轻量级 **Windows（Win11/10 & Win7 SP1）/ macOS（10.15+ Apple Silicon & Intel）/ Linux（银河麒麟 KylinOS / Ubuntu / UOS）** 透明置顶桌面打字猫咪伴侣（开箱自带 **6 款手绘猫咪皮肤 + 🐳 大肥鱼（鲸鱼娘）**：经典小黑猫、暖奶茶布偶猫、大橘猫、三花猫、奶牛猫、暹罗猫、大肥鱼，支持**输密码自动闭眼/捂眼防偷窥**，并原生内置 **MCP 协议服务端**，支持用 AI 一句话定制或新增更多你自己的猫咪！），基于 **Tauri v2（Rust 全局原生钩子 + 内置 MCP 引擎 + HTML5 Canvas 2D + Three.js 3D）** 打造。单文件轻量低耗，零外部运行时依赖。

本分支在 [bucai2417/kurcat](https://github.com/bucai2417/kurcat) 继续开发 2D / 3D 互动与模型库。下面保留的上游官网演示和 v4.8.0 下载链接属于历史版本，不包含本分支新增功能；测试本分支请使用 [GitHub Actions 构建](#github-actions-build)。

## 本分支新增功能

- **睡眠被打断后的起床气**：猫咪打盹时，键盘按下、鼠标按下或滚轮会把它吵醒。2D / 3D 都会生气拍尾，尾巴先抬起蓄力、快速落地、再回弹，落地点带冲击反馈，并显示清晰中文气泡。随机 **2–5 秒**恢复，继续输入不会延长；来回抚摸头部可提前安抚。普通移动鼠标不会吵醒。
- **更清晰的互动反馈**：起床气、安抚、道具与连续打字使用高对比文字；同一时刻按优先级显示，避免文字重叠。隐私模式会清理并暂停这些输入反应。
- **模型库与导入导出**：右键菜单的“模型库”页签支持 UTF-8 `.kurocat.json` 文件、作者与许可及动作预览、导入并使用、导出当前猫咪，以及按 GitHub Raw 地址加载模型目录。
- **统一模型能力契约**：UI、MCP、OBS 根据适配器提供的能力选择 2D / 3D 模式和动作。版本 1 包含现有程序化猫咪的外观配置，继承其完整互动；任意 GLB / VRM / Live2D 骨架文件接入尚未实现。详细格式、动作列表及后续接入设计见 [模型包文档](docs/model-packs.md)，可试用 [薄荷云朵示例](model-store/mint-cloud.kurocat.json)。

## 🎬 在线试玩预览 & 鲸鱼娘 14s 演示视频

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

## 📥 直接下载使用（Windows / Win7 / macOS / Linux）

前往上游 [Releases](https://github.com/qianyiai/kurocat/releases) 页面，或使用下面保留的历史 **`v4.8.0`** 安装包链接（所有版本均内置 **20%–150% 丝滑缩放滑动条**、右键一键切换 **65% 紧凑 / 108 全尺寸小键盘** 与 **面向猫咪 / 面向观众** 方向、**输密码自动闭眼/捂眼防偷窥**、**按住 `Alt` 随时解锁鼠标穿透**、**无边框 / 全屏优化游戏持续 Z 序置顶守护**、托盘一键 **以管理员身份重启（捕获游戏键鼠）** & **游戏反作弊护航暂停** 与 App 内自动新版本提醒及一键自升级）：

- **🪟 Windows 10 / 11（65% 经典安装版 · `v4.8.0`）**：[**`KuroCat-4.8.0-x64-setup.exe`**](https://github.com/qianyiai/kurocat/releases/download/v4.8.0/KuroCat-4.8.0-x64-setup.exe)（约 1.96 MB）｜[**官网国内高速下载**](https://qianyi.one/kurocat/#download)
  - 默认 65% 紧凑机械键盘，自动创建桌面 **`KuroCat`** 图标、开始菜单与系统卸载入口；右键或托盘随时一键切换 **108 键全尺寸小键盘**、**🐳 大肥鱼（鲸鱼娘）** 与 App 内一键更新。
  - **常见问题说明**：
    - **Edge / Chrome 浏览器提示「通常不会下载 `.exe`」怎么办？**（开源免费软件未购商业代码签名证书，全量源码公开可放心信任）：
      - **Edge 浏览器**：鼠标移到该下载条上 → 点右侧 **三个点 `···`** → 点 **「保留」** → 弹窗出现「删除」按钮时，点开旁边的 **下箭头 `▾`（显示更多）** → 选择 **「仍然保留」** 即可完成下载。
      - **Chrome 浏览器**：按 `Ctrl + J` 打开下载记录 → 点 **「保留危险文件」** → **「仍然保留」**。
      - **双击安装若弹出蓝框「Windows 已保护你的电脑」**：点 **「更多信息」** → 点 **「仍要运行」** 即可。
    - 极少数老版 Win10 / LTSC 精简版若提示缺少 `WebView2 Runtime`，安装微软官方 1.8 MB 引导程序（右键「以管理员身份运行」）即可：[`MicrosoftEdgeWebview2Setup.exe`](https://go.microsoft.com/fwlink/p/?LinkId=2124703)。
    - **游戏全屏 / 管理员权限 / 直播提示**：单机与常规游戏在 Win10/11 全屏优化（FSO）或「无边框窗口化」下内置持续 Z 序置顶守卫且绝不抢焦点（建议开启「锁定鼠标穿透」，按 `Alt` 随时解锁）；若游戏本身以管理员权限运行导致无法捕获键鼠，右键系统托盘点击 **「以管理员身份重启（捕获游戏键鼠）」** 即可无缝提权；直播录屏推荐 OBS 添加「窗口捕获」叠加；玩无畏契约 / 三角洲行动等强内核反作弊网游建议右键托盘开启 **「暂停监听并隐藏（游戏反作弊护航）」**。
- **🖥️ Windows 7 SP1（64 位专属兼容绿包版 · `v4.8.0`）**：[**`KuroCat-v4.8.0-win7-x64-portable.zip`**](https://github.com/qianyiai/kurocat/releases/download/v4.8.0/KuroCat-v4.8.0-win7-x64-portable.zip)（178.78 MB）｜[**官网国内高速下载**](https://qianyi.one/kurocat/releases/v4.8.0/KuroCat-v4.8.0-win7-x64-portable.zip)
  - 原生 PE 6.01 编译（零 Win8/Win10 DLL 依赖），内置微软官方最后一版支持 Win7 的离线 **WebView2 109.0.1518.78** 运行库，并搭载 **Win7 原生 256 级逐像素透明抗锯齿渲染（`UpdateLayeredWindow`）**，开不开 Aero 均无白底框与锯齿；解压后保持 `KuroCat.exe` 与 `WebView2Runtime` 同目录直接双击即可运行。
- **🍎 macOS 10.15 Catalina+（Apple Silicon M1–M4 & Intel 通用版 · `v4.8.0`）**：[**`KuroCat-v4.8.0-macos-universal.dmg`**](https://github.com/qianyiai/kurocat/releases/download/v4.8.0/KuroCat-v4.8.0-macos-universal.dmg)（5.53 MB）｜[**官网国内高速下载**](https://qianyi.one/kurocat/releases/v4.8.0/KuroCat-v4.8.0-macos-universal.dmg)
  - 打开 `.dmg` 将 `KuroCat.app` 拖入「应用程序」文件夹运行，内置 65% / 108 键切换与全部 7 款皮肤（含 🐳 大肥鱼鲸鱼娘）。
  - **首次打开说明（开源未公证应用）**：若提示「无法验证开发者」或「已损坏」，在终端执行一次 `xattr -cr /Applications/KuroCat.app` 后即可正常打开（后续 App 内一键升级会自动处理，无需再敲命令）。
  - **键盘与鼠标监听权限**：首次启动会自动弹出系统授权引导，请在「系统设置 → 隐私与安全性」中同时勾选 **「辅助功能」与「输入监控」** 里的 `KuroCat`（即开即生效，兼容 Karabiner-Elements；若覆盖升级后权限未生效，在列表中选中 `KuroCat` 点左下角 `-` 删除再重新 `+` 添加即可）。
  - **macOS Stdio MCP 路径**：`/Applications/KuroCat.app/Contents/MacOS/KuroCat`（参数 `--mcp`），或在桌宠运行时直接连接 `http://127.0.0.1:27420/mcp`。
- **🐧 Linux / Ubuntu 22.04+ / Debian 12+ / 银河麒麟 V11+ / UOS（`v4.8.0`）**：
  - **x86_64（Intel / AMD / 兆芯 / 海光）**：[**`.deb`（2.18 MB）**](https://github.com/qianyiai/kurocat/releases/download/v4.8.0/KuroCat-v4.8.0-linux-amd64.deb) · [**`.AppImage`（77.32 MB）**](https://github.com/qianyiai/kurocat/releases/download/v4.8.0/KuroCat-v4.8.0-linux-amd64.AppImage)
  - **ARM64（飞腾 / 鲲鹏 / 树莓派）**：[**`.deb`（2.14 MB）**](https://github.com/qianyiai/kurocat/releases/download/v4.8.0/KuroCat-v4.8.0-linux-arm64.deb) · [**`.AppImage`（75.50 MB）**](https://github.com/qianyiai/kurocat/releases/download/v4.8.0/KuroCat-v4.8.0-linux-arm64.AppImage)
  - **系统要求说明**：基于 Tauri v2 + Ubuntu 22.04 基线构建，需要 **`glibc >= 2.34`** 且（`.deb` 版）依赖 **`libwebkit2gtk-4.1-0`** 与 **`libayatana-appindicator3-1`**（适用于 Ubuntu 22.04+ / Debian 12+ / 银河麒麟 V11+ 等发行版；**暂不支持基于 Ubuntu 20.04 / `glibc 2.31` / `webkit2gtk-4.0` 的银河麒麟 V10 SP1**）。
  - 原生动态加载 X11 `XRecord`（免 root 捕获全局键鼠，Wayland 自动支持 `evdev` 回退），官网亦提供全部国内高速镜像：[`https://qianyi.one/kurocat/#linux-download`](https://qianyi.one/kurocat/#linux-download)。

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

- **7 款内置皮肤（6 款猫咪 + 🐳 大肥鱼鲸鱼娘）+ MCP 无限自定义**：
  - **🐈‍⬛ 经典小黑猫** / **🐱 暖奶茶布偶猫** / **🍊 大橘猫**（虎斑 `M` 额纹 + 环纹尾） / **🌸 三花猫** / **🐄 奶牛猫**（燕尾服 + 白手套） / **🤎 暹罗猫**（挖煤重点色） / **🐳 大肥鱼（鲸鱼娘）**（三肢同步键鼠 + 鲸鱼尾拍打右侧功能键带水花特效 + 稳定 4 表情与手速腮红），右键或系统托盘 0.1 秒一键无缝切换。
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
  - 右键菜单打开设计器，按当前模型模式编辑。**2D** 支持顶面、侧面、文字颜色以及自定义文字和 Emoji；**3D** 当前支持顶面颜色，未接入的图例与侧面选项不会显示为可用。
  - 提供 WASD、数字区、Esc、方向键等配色方案；清除当前模式的 DIY 不影响另一模式。
  - MCP 的 `set_keycaps`、`get_keycaps`、`clear_keycaps` 接受 `mode: "2d" | "3d"`。3D 写入仅接受 `top`；合法键名由 `get_keycaps` 返回。
- **🎨 2D 键鼠外观**：
  - 内置经典奶白、暗夜碳纤、胡桃木、樱花奶油、赛博终端、深海鲸；键盘底座、键帽、修饰键、强调键、鼠标外壳与按键可以分别配色。
  - OEM / SA / 矮轴 / 果冻键帽、三种鼠标轮廓、材质与程序化纹理由 2D 绘制器提供；这些选项不代表 3D 网格也会改变形状或材质。
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
- **App 内自动新版本提醒 & 一键升级**：启动后及定时静默检测 GitHub Releases 新版本，有更新时自动在猫头上方弹出轻量提醒条，右键猫咪或系统托盘点 **「检查更新」** 即可自动下载、SHA-256 校验并静默安装重启（Windows 安装版 / 绿色单文件版 / macOS 通用版均支持）。
- **摸头眯眼与呼噜互动**：鼠标移到猫头上自动切换为黑白描边小手光标，来回抚摸即触发慵懒细眯眼表情，并伴随 Web Audio 实时合成的温柔猫咪呼噜声（默认开启，可随时开关，不干扰自身键鼠声音）。
- **错落弹跳 3D 按键气泡**：键盘上方实时弹出白底立体键帽，支持一键隐藏（输密码更安心）。
- **智能鼠标穿透 & 系统托盘**：透明区域自动点击穿透不遮挡办公或游戏，右键猫咪或系统托盘可一键切换外观、使用 **20%–150% 丝滑滑动条**无级调节尺寸、开关 MCP 服务并**一键复制 MCP 配置**。
- **多显示器选择 & macOS 原生全屏悬浮**：Windows 与 macOS 系统托盘均提供 **「选择显示器」** 子菜单，可将桌宠固定到指定显示器的工作区右下角（拔插外接屏自动回退主屏并在重连后恢复，拖动或选择「自由摆放」即可解除固定）；macOS 13+ 原生支持跨 App 全屏空间悬浮显示。

## 🤖 MCP 接入指南（用 AI 改猫 / 加自己的猫）

KuroCat `v4.0.0+` 单文件程序原生内置 **Stdio** 与 **本机 Streamable HTTP（`127.0.0.1:27420`）** 双模式 MCP Server，无需任何额外依赖！

### 最快接入方式
1. 运行 `KuroCat`，右键猫咪 → 确认勾选 **「开启 MCP 扩展」** → 点击 **「复制 MCP 配置」**。
2. 粘贴到你常用的 AI 客户端 MCP 配置文件（Claude Desktop / Cursor / Antigravity / Windsurf / Cline）：

**方式 A：Stdio 模式（通用推荐，所有 MCP 客户端均支持）**
```json
{
  "mcpServers": {
    "kurocat": {
      "command": "C:\\Users\\<你的用户名>\\AppData\\Local\\KuroCat\\KuroCat.exe",
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
- *「帮我用 KuroCat MCP 新增一只大橘猫（虎斑纹 + 白手套 + 橘色高亮键盘），并马上切过去」*
- *「看这张我家三花猫的照片，用 KuroCat MCP 按它的花色和斑点给我捏一只专属桌宠！」*
- *「把桌宠放大到 125%，关闭悬浮按键气泡，切回小黑猫」*

### 内置 MCP 工具清单

| 工具名 | 功能说明 |
| --- | --- |
| `get_model_contract` | 读取模型包版本、适配器、2D / 3D 动作与反应契约 |
| `import_model_pack` | 导入 `package` 对象；`replace` / `activate` 默认 false，已有 ID 需显式替换 |
| `export_model_pack` | 按 `id` 导出 JSON 内容，由客户端保存为 UTF-8 文件 |
| `list_cats` / `get_cat_schema` | 查看所有外观、当前模型、花色参数、斑点坐标与品种模板 |
| `upsert_cat` / `switch_cat` / `delete_cat` | 新增或修改外观、切换模型、删除自定义外观或重置内置外观 |
| `get_settings` / `update_settings` | 查询或修改模式、缩放、气泡、呼噜、项圈、耳机、尾巴控制、键鼠音效、置顶、穿透等设置 |
| `set_prop` / `get_prop` / `trigger_prop_sip` | 设置道具种类、位置、开关，查询配置，触发饮用 |
| `get_desk_schema` / `list_desk_skins` | 查询 2D 键鼠外观参数与皮肤列表 |
| `upsert_desk_skin` / `switch_desk_skin` / `delete_desk_skin` | 管理 2D 键鼠外观 |
| `get_idle_actions` / `set_idle_actions` | 查询当前模型、模式、可用动作和上次请求；开关自动待机、设置空闲延时 |
| `trigger_idle_action` | 按 `kind` 请求动作，例如 `nap`、`tailGround`、`calm`；不改变自动待机开关 |
| `get_mood` / `set_mood` / `set_mood_tracking` | 查询或设置情绪请求，开关连续打字反应；查询并非实时情绪遥测 |
| `set_keycaps` / `get_keycaps` / `clear_keycaps` | 通过 `mode` 分开管理 2D / 3D 键帽；3D 当前仅支持顶面色 |
| `set_lighting` / `get_lighting` | 设置与查询 RGB 效果、配色、亮度、速度和边缘灯带 |

动作是否可用取决于当前模型与模式；请求被保存不代表动画已播放，隐私模式或正在进行的冲突动作可能阻止执行。`update_settings.inputSound` 包含 `keyboard`、`mouse`、`profile`、`volume`；`soundEnabled` 仅控制呼噜。模型包完整示例及扩展设计见 [接入文档](docs/model-packs.md)。

自定义猫咪配置保存在：
- **Windows**：`%APPDATA%\kuro-cat-pet\cats.json`
- **macOS**：`~/Library/Application Support/kuro-cat-pet/cats.json`

也可手动编辑，桌宠自动实时热重载。

## 🛠️ 本地源码构建

前置环境：Windows 10/11 或 macOS 11+、Node.js 18+、Rust 工具链（`cargo`）。

```bash
git clone https://github.com/qianyiai/kurocat.git
cd kurocat
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

然后打开 **<http://127.0.0.1:1420/>** —— 页面会自动安装一个 Tauri 预览垫片（`src/tauriPreview.ts`），用 localStorage 模拟设置读写与事件总线。你可以直接体验：

- **右键猫咪**打开完整右键菜单（配列 / 外观 / 键帽 DIY / 灯光 / 道具 / 缩放）
- **切换 7 款猫咪**：小黑猫 / 布偶猫 / 大肥鱼 / 大橘猫 / 三花猫 / 奶牛猫 / 暹罗猫
- **🎨 键帽设计器**：点键、换色、加 Emoji、写自定义文字
- **灯光**：9 种效果 + 单色/多选/随机配色 + 边缘灯带
- **道具**：点杯子，猫会伸手把杯子端到嘴边喝一口，喷粒子、液面下降
- **键盘/鼠标输入**：敲键盘、点鼠标左右键都能看到反应

> 预览模式下设置会存进浏览器 localStorage，刷新后保留；桌面端图标 / 托盘 / 点击穿透等原生能力仍然需要真正打包。想重置预览状态可在 DevTools 执行 `localStorage.removeItem('kurocat-preview-v1')` 后刷新。

另外还提供了一个参数化工装页：`http://127.0.0.1:1420/harness.html?layout=108&light=wave&mode=palette&edge=1&prop=coffee,right`，适合快速比对单点效果。

## 📄 开源协议与致谢

本项目基于 [MIT License](LICENSE) 开源。

- 内置皮肤 **🐳 大肥鱼（鲸鱼娘）** 运行时素材基于 MIT 开源项目 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（参考衍生 [QCYTSN/dsh-dafeiyu](https://github.com/QCYTSN/dsh-dafeiyu)）制作，完整许可声明见 `src/assets/dafeiyu/LICENSE-MIT.txt`。
