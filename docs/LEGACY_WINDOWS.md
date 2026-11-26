# DIY-Cat：旧版 Windows 实验包

适用目标：Windows 7 SP1 / Windows 8.1，64 位。常规 Windows 安装包面向 Win10/11，请勿混用。

## 安装

1. 下载 Release 中带 `win7-x64-experimental` 的 ZIP，完整解压后运行 DIY-Cat.exe。
2. 系统需要可运行的 Microsoft WebView2 Runtime。Windows 7/8.1 最后支持的是 109 系列；当前 Evergreen 安装器不支持这些旧系统。仅从可信来源取得适合系统的运行库，项目不附带旧版 WebView2。
3. 补齐系统 SHA-2、Universal C Runtime 和 Visual C++ 运行库等所需更新。
4. 若显卡无法运行 3D，请使用 2D。旧系统使用独立的透明窗口呈现路径，按 Alt 临时操作锁定穿透的宠物。

## 兼容性边界

此包在 GitHub Windows runner 使用 Rust `x86_64-win7-windows-msvc` 目标重新编译标准库（nightly + build-std），并启用项目的 `win7` 透明呈现功能。使用标准 Win10 目标加开关并不能证明 Win7 兼容。

**实验包编译成功只证明能生成二进制，并不代表 Tauri、WebView2 或所有依赖已经在 Win7/8.1 真机验证。** 未完成旧系统真机测试；若出现缺少入口点、白屏或启动失败，请提交系统版本、更新状态、WebView2 版本及错误截图。常规 Win10/11 包为主要支持通道。

自动更新只为此通道选择带 win7 标记的 ZIP，不会用常规 Windows EXE 覆盖。

## 构建

GitHub Actions → Build Cross-Platform Release → 仅选 legacy_only。所有依赖与编译都在 runner 完成，本地不需要安装 Rust/Node 构建环境。

参考：[Rust Win7 目标](https://doc.rust-lang.org/rustc/platform-support/win7-windows-msvc.html)、[Microsoft Edge 与 WebView2 旧系统支持公告](https://blogs.windows.com/msedgedev/2022/12/09/microsoft-edge-and-webview2-ending-support-for-windows-7-and-windows-8-8-1/)。
