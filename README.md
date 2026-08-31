# Log Fitter

类似 Unity Console / Android Studio Logcat 的本地日志查看器。导入 Unity 的 `.txt` / `.log`，按级别、关键词、标签过滤，并查看完整堆栈。

## 启动

```bash
npm install
npm run dev
```

浏览器打开终端里提示的本地地址（默认 `http://localhost:5173`）。

## 用法

- **导入日志**：点「导入日志」、拖拽文件到窗口，或 `Ctrl+O`
- **导入 zip**：可直接拖入反馈包 zip，自动解压 `logs/` 下全部 `.log` 并合并显示
- **粘贴文本**：从 Unity 控制台直接复制后点「粘贴」
- **过滤**：搜索框即时过滤；`Aa` 区分大小写，`.*` 正则，`反向` 排除匹配项
- **级别开关**：右上角 Verbose / Debug / Info / Warning / Error，带计数
- **标签 / 文件**：下拉只看某个模块或某个导入文件
- **折叠相同**：连续相同日志合成一行，右侧显示次数
- **详情**：点一行查看完整内容与堆栈，可复制或拖动分隔条改高度
- **导出 HTML**：把当前过滤结果打成独立 `.html`，双击即可用浏览器打开继续查看/过滤
- **导出 TXT**：只导出纯文本
- **便携版工具**：`npm run pack` 后，双击 `便携版/LogFitter.html`（或 `双击打开.bat`）即可运行完整导入器

## 支持的格式

- 游戏自定义日志：`2026-08-29 21:53:14|消息…` + Lua `stack traceback`
- 反馈包 zip（内含 `logs/*.log`）
- Unity `Player.log` / `Editor.log`（`Debug.Log` / `LogWarning` / `LogError` + Filename）
- 自定义标签：`[2026-08-31 18:00:01] [INFO] [Network] connected`
- Android Logcat：`08-31 18:00:04.012  2144  2168 I Unity : message`

项目里自带 `public/sample-unity.log`，可在界面点「示例」试看。
