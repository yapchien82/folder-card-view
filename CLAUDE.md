# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 构建与开发

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（esbuild watch，输出 main.js）
npm run build        # 生产构建（esbuild --minify，输出 main.js）
./sync.sh "message"  # 构建 → 同步 vault → git commit → git push 一键完成
```

目标 vault 插件目录：`~/obs-note/youdaonote/.obsidian/plugins/folder-card-view/`
GitHub 仓库：`https://github.com/yapchien82/folder-card-view`

没有测试套件和 linter 配置。

## 架构概览

这是一个 Obsidian 插件，在左侧边栏以卡片形式展示文件夹内的文件。整个应用逻辑集中在 `main.ts` 单文件中（~730 行）。

### 核心类

- **`FolderCardPlugin`**（`Plugin` 子类）—— 入口。注册自定义视图 `VIEW_TYPE_CARD`，监听文件树中的文件夹点击（桌面端 `click` / 移动端 `touchend`），监听 vault 的 create/delete/rename 事件以清除缓存并刷新视图。`activateView()` 负责创建或显示卡片视图的 leaf（桌面端从文件浏览器右侧分屏打开，移动端作为新标签页打开）。

- **`FolderCardView`**（`ItemView` 子类）—— 核心视图。`renderFolder(folder)` 渲染指定文件夹的内容，`renderCards()` 负责实际绘制文件卡片（预览、标签、排序、搜索过滤）。右键菜单支持打开/移动/复制/删除/复制路径/在系统中显示等操作。

- **`FolderSuggestModal`**（`FuzzySuggestModal<TFolder>` 子类）—— 用于"移至其他目录"操作的文件夹选择器。

### 模块级常量

- `PREVIEW_LIMIT = 20` — 预览读取上限
- `MAX_CARDS = 500` — 卡片渲染数量上限
- `OBSIDIAN_EDITABLE_EXTENSIONS` — Set(['md', 'canvas', 'txt', 'base'])
- `folderFileCache` — Map<string, TFile[]> 文件列表缓存

### 辅助函数

- `isObsidianEditable(file: TFile): boolean` — 判断文件是否可被 Obsidian 直接编辑

## 关键设计决策

- **文件列表缓存**：模块级 `Map<string, TFile[]>` 缓存每个文件夹的文件列表，vault 变更时清空。搜索时跳过缓存直接过滤。
- **预览限制**：`PREVIEW_LIMIT = 20`，仅对可编辑文件异步读取前 20 张的内容（前 5 行 + 标签提取），非可编辑文件（图片等）直接跳过 `cachedRead`，超出部分只从 metadata cache 获取标签。
- **卡片数量上限**：`MAX_CARDS = 500`，超过截断并提示。根目录只显示直接子文件（不递归 `!f.path.includes("/")`），避免加载全部 vault 文件。
- **搜索防抖**：250ms 防抖。
- **根目录按钮**：header 最左侧 `home` 图标，点击回到仓库根目录。已在根目录时按钮 `.is-disabled`。
- **准星定位按钮**：`locateBtn` 点击后跨目录加载当前活跃文件所在文件夹，调用 `file-explorer:reveal-active-file` 展开左侧文件树，右侧居中高亮对应卡片。
- **文件类型区分**：`isObsidianEditable()` 判断，非可编辑文件卡片加 `.file-card--non-editable` 样式（虚线边框、降低透明度）+ 扩展名标签（如 PNG、PDF）。
- **移动端适配**：
  - 右侧独立 `menu` 图标按钮，功能等同长按空白区域（文件夹操作菜单）
  - `addLongPress()` 500ms 长按弹出菜单，10px 移动阈值取消
- **文件夹点击防抖**：500ms，防止移动端 click 和 touchend 重复触发。
- **渲染代数锁**：`renderGeneration` 计数器，新渲染开始时自动使旧渲染作废，避免并发 DOM 操作冲突。
- **离屏构建**：卡片在 `DocumentFragment` 中离屏构建完成后一次性原子插入 DOM，减少布局震荡。
- **延迟加载态**：100ms 后才显示"加载中..."，快目录（如图片目录）直接切换无闪烁。
- **启动默认根目录**：`onOpen()` 和 `activateView(autoFocusRecent=true)` 均加载根目录而非最近文件。
- **文件夹点击不抢焦点**：`activateView(false)` 时跳过 `revealLeaf`，仅首次创建 leaf 或 ribbon 主动打开时才调用。

## 已知问题

- **左侧文件树展开时下方文件夹偶尔闪烁消失**：点击文件夹展开子目录时，下方其他文件夹会短暂消失再出现。已尝试多项修复（取消自动 revealLeaf、渲染代数锁、离屏构建原子替换 DOM），现象有改善但未完全根除。疑似与 Obsidian 原生文件树的展开/重排机制有关，需进一步排查。

## 样式 (styles.css)

- 左侧边栏固定宽度：整体 520px，卡片视图 310px，文件树 210px，禁用分割线拖拽
- 移动端解除宽度限制，放大触控区域
- `.nav-file` / `.nav-file-container` 多层选择器强制隐藏（`display: none !important` + 零高度 + 零 padding/margin），`.nav-folder-children` 强制 `min-height: 0`，确保文件树只显示文件夹
- `.file-card--non-editable` 虚线边框 + 降低透明度
- `.file-card-ext-badge` 扩展名标签胶囊
- `.card-root-btn.is-disabled` 根目录按钮禁用态
- `.card-folder-menu-btn` 移动端菜单按钮，`margin-left: auto` 推到右侧
