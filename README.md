# 声波闯关 · 网页版

一个打开即玩的 H5 猜歌闯关应用，不需要微信审核，也不需要服务器。支持手机和电脑浏览器，可添加到桌面作为 PWA 使用。

## 功能

- **混合闯关**：从全部曲目随机抽 10 题。
- **分类闯关**：按儿歌、古典、民谣、民歌、节日、庆典或自定义分类练习。
- **无尽闯关**：不设题数上限，直到 3 条生命耗尽，也可以随时结束。
- **本机曲库**：从手机/电脑选择 mp3、m4a、aac、wav、ogg、webm，填写歌名、演唱者和分类后加入题库。
- **翻唱录制 / 批量上传**：可以直接用麦克风录 30 秒翻唱，也可以一次选择多个翻唱文件导入本机曲库。
- 三种模式分别记录最高分，成绩保存在浏览器 `localStorage`。
- 音频文件保存在浏览器 `IndexedDB`，不会上传服务器，也不会同步给其他用户。
- **我的曲库统一管理**：10 首内置旋律 + 17 首 30 秒试听都已放进「我的曲库」，三种模式直接使用；播放超过 30 秒会自动停止。
- PWA 离线缓存，安装到桌面后可以像小程序一样从桌面打开。

## 直接运行

不要直接双击 `index.html` 使用全部功能（Service Worker 需要 HTTP）。在本目录启动一个静态服务器：

```bash
python -m http.server 8080
```

然后访问：

```text
http://localhost:8080
```

Windows 也可以直接运行：

```powershell
powershell -ExecutionPolicy Bypass -File start-web.ps1
```

## 单文件版

仓库根目录的 `声波闯关-网页版.html` 是把 CSS、JS 和音频全部内联后的单文件版本，可以直接双击打开，内置曲库可正常玩。

受浏览器 `file://` 安全限制，单文件版的“本机曲库上传”和 PWA 离线缓存可能不可用；需要完整功能时，请用上面的本地服务器或部署到 HTTPS 静态托管。

重新生成单文件：

```bash
python tools/build_web_single.py
```

## 部署到网上

这是纯静态站点，把整个 `web-mini-program/` 目录上传到任意静态托管即可：

- Vercel / Netlify / Cloudflare Pages：拖入目录，或连接 Git 仓库；
- GitHub Pages：把本目录内容推到仓库 `main` 分支，仓库 Settings → Pages → Source 选择 `Deploy from a branch`，分支 `main`、目录 `/ (root)`；
- 自己的 Nginx / 对象存储：确保 `index.html`、`assets/`、`audio/`、`sw.js` 保持相对路径。

部署后通过 HTTPS 访问，浏览器才会允许“添加到主屏幕”和 Service Worker 离线缓存。

## 文件结构

```text
index.html              页面结构
manifest.json           PWA 配置
.nojekyll               关闭 GitHub Pages 的 Jekyll 处理
sw.js                   Service Worker 离线缓存
assets/style.css        全部样式与响应式布局
assets/app.js           闯关、计分、曲库、上传逻辑
assets/songs.js         10 首内置曲目
assets/preview-songs.js 17 首站内 30 秒试听曲目
assets/icon-*.png       桌面图标
audio/01.wav … 10.wav   内置旋律
audio/success.wav 等    音效
start-web.ps1           本地启动脚本
```

## 我的曲库与翻唱

「我的曲库」现在统一显示三部分：

- 10 首内置旋律；
- 17 首站内 30 秒试听（全部为经典老歌，术力口暂无可用预览）；
- 用户上传或录制的翻唱。

30 秒试听不再单独占一个模式，直接参与混合、分类和无尽模式；播放到 30 秒自动停止。想继续加歌，用「录制 30 秒翻唱」或「批量添加翻唱文件」。翻唱只保存在当前浏览器，不会上传服务器。

> 不内置 300 首经典老歌/术力口，是因为商用录音和 B 站视频音频不能在没有授权的情况下直接打包或转存。30 秒预览来自公开的 iTunes 预览接口；如果公开运营，仍需遵守对应平台条款。翻唱请只使用你有权演唱和录制的作品。

## 添加内置歌曲

编辑 `assets/songs.js`，追加：

```js
{
  id: "my-song",
  title: "歌名",
  category: "古典",
  difficulty: "进阶",
  accent: "#d7ff4f",
  audio: "audio/11.wav",
  fact: "答对后显示的一句介绍。"
}
```

把音频放到 `audio/11.wav`。内置曲目需要重新部署网页才会对所有访问者生效。

## 用户上传与数据

- 上传只存在当前浏览器，不会上传服务器；清除浏览器站点数据会丢失。
- 单首限制 10MB，建议使用 mp3/m4a 控制体积。
- 上传的音频会参与混合、分类、无尽三种模式。
- 请只上传你创作、已获授权或属于公有领域的音频。

## 兼容性

- 推荐 Chrome / Edge / Safari 最新版。
- `dialog`、IndexedDB、Service Worker 需要较新的浏览器；旧浏览器仍可玩内置曲库，但上传/离线能力会降级。
- iOS Safari 可通过「分享 → 添加到主屏幕」安装。

## 与微信小程序版的关系

微信小程序版在 `../wechat-miniprogram/`，需要微信审核；这个网页版是独立的 H5 实现，不需要审核，也不需要 cloudfunctions。两版共用同一套内置旋律和玩法概念。
