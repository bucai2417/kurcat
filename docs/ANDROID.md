# DIY-Cat Android

## 安装与使用

1. 从本仓库 Releases 下载 DIY-Cat-1.0.0-android.apk，在安装来源提示中允许当前浏览器或文件管理器安装。
2. 打开 DIY-Cat，授予“显示在其他应用上层”权限。根据系统提示允许通知并启动悬浮宠物。
3. 若希望响应其他应用中的输入，按应用引导开启辅助功能服务；系统对可观测输入有限制，不能等同于桌面全局键鼠钩子。
4. 如宠物被系统关闭，可允许后台运行或关闭针对本应用的电池优化；停止悬浮服务可在应用内操作。

最低 Android 8.0（API 26）。当前为 **2D 悬浮宠物版本**，没有桌面版的 Three.js 3D、模型商城、键鼠包管理与 MCP。桌面商城导出的包暂不能在 Android 导入；后续接入需要独立实现移动端存储、权限和渲染适配。

应用包名继续使用 com.kurocat.pet，显示名为 DIY-Cat。项目签名与上游签名不同，旧上游 APK 可能无法直接覆盖安装；请先记录设置再卸载旧版。DIY-Cat 后续版本使用同一签名，versionCode 持续递增（1.0.0 为 40801）。

## GitHub 构建

Actions → Build Cross-Platform Release → 仅选 android_only。runner 构建前端、签名 APK、执行 Android lint 并验证 APK 签名；无需本机安装 Android SDK。标签构建把 APK 与 SHA-256 校验文件放入 Release 草稿。

仓库 Actions Secrets：ANDROID_KEYSTORE_BASE64（PKCS12 文件的 Base64）、ANDROID_STORE_PASSWORD、ANDROID_KEY_ALIAS、ANDROID_KEY_PASSWORD。私钥不得放进 Git 仓库或 Release。每次构建必须复用同一密钥；更换密钥会导致已安装版本不能覆盖更新。

创建者需另行妥善备份签名文件及密码，GitHub Secrets 无法下载还原。工作流缺少签名时直接失败，不发布未签名 APK。
