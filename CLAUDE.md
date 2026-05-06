# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 构建与开发

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（esbuild watch，输出 main.js）
npm run build        # 生产构建（esbuild --minify，输出 main.js）
./sync.sh            # 构建并同步到 Obsidian vault
```

目标 vault 插件目录：`~/obs-note/youdaonote/.obsidian/plugins/folder-card-view/`

没有测试套件和 linter 配置。

## 架构概览

这是一个 Obsidian 插件，在左侧边栏以卡片形式展示文件夹内的文件。整个应用逻辑集中在 `main.ts` 单文件中。

### 核心类

- **`FolderCardPlugin`**（`Plugin` 子类）—— 入口。注册自定义视图 `VIEW_TYPE_CARD`，监听文件树中的文件夹点击（桌面端 `click` / 移动端 `touchend`），监听 vault 的 create/delete/rename 事件以清除缓存并刷新视图。`activateView()` 负责创建或显示卡片视图的 leaf（桌面端从文件浏览器右侧分屏打开，移动端作为新标签页打开）。

- **`FolderCardView`**（`ItemView` 子类）—— 核心视图。`renderFolder(folder)` 渲染指定文件夹的内容，`renderCards()` 负责实际绘制文件卡片（预览、标签、排序、搜索过滤）。右键菜单支持打开/移动/复制/删除/复制路径/在系统中显示等操作。

- **`FolderSuggestModal`**（`FuzzySuggestModal<TFolder>` 子类）—— 用于"移至其他目录"操作的文件夹选择器。

### 关键设计决策

- **文件列表缓存**：模块级 `Map<string, TFile[]>` (`folderFileCache`) 缓存每个文件夹的文件列表，vault 变更时清空。搜索时跳过缓存直接过滤。
- **预览限制**：常量 `PREVIEW_LIMIT = 20`，前 20 张卡片异步读取文件内容（前 5 行 + 标签提取），超出部分只从 metadata cache 获取标签，避免渲染大量文件时卡顿。
- **卡片数量上限**：常量 `MAX_CARDS = 500`，超过截断并提示，防止极端大目录卡死。根目录只显示直接子文件（不递归），避免加载全部 vault 文件。
- **搜索防抖**：250ms 防抖避免每次按键都触发完整渲染。
- **准星定位按钮**：`locateBtn` 点击后跨目录加载当前活跃文件所在文件夹，同步展开左侧文件树（调用 `file-explorer:reveal-active-file` 命令），并在右侧卡片列表中居中高亮对应的卡片。
- **根目录按钮**：header 最左侧 `home` 图标，点击回到仓库根目录。已在根目录时按钮禁用。
- **文件类型区分**：`isObsidianEditable()` 判断文件是否可编辑（md / canvas / txt / base），非可编辑文件显示虚框卡片 + 扩展名标签（如 PNG、PDF），防止误点击。
- **文件夹点击防抖**：500ms 防抖防止移动端 click 和 touchend 先后触发导致重复调用。
- **移动端长按**：`addLongPress()` 方法实现 500ms 长按弹出菜单，10px 移动阈值取消触发。
- **移动端文件夹菜单按钮**：`Platform.isMobile` 时在 header 右侧额外显示 `menu` 图标，点击弹出文件夹操作菜单（等同桌面端右键 / 长按空白区）。

### 样式 (styles.css)

CSS 使用 `:has()` 选择器锁定左侧边栏布局：整体宽度固定 520px，卡片视图片固定 310px，文件树片固定 210px，并禁用分割线拖拽。移动端（`.is-mobile`）解除所有固定宽度限制，放大触控区域。

文件树中的 `.nav-file` 通过多层选择器强制隐藏（`display: none !important` + `height: 0`），确保只显示文件夹不显示文件条目。
