# Folder Card View

Obsidian 插件 —— 以卡片视图展示文件夹内容，点击左侧文件树的文件夹即可在右侧面板中浏览所有文件卡片。

## 功能

- 点击左侧文件树中的任意文件夹，在卡片面板中展示该文件夹下的所有文件
- 支持按名称（A-Z / Z-A）或修改时间排序
- 支持关键词搜索过滤
- 准星定位按钮：全局跳转到当前打开的文件
- 显示文件预览（前5行）、标签等元信息
- 根目录模式下展示整个仓库的所有文件

## 使用方式

1. 点击左侧 Ribbon 图标（layout-list），或点击文件树中的任意文件夹
2. 右侧出现卡片面板，显示该文件夹下的所有笔记卡片
3. 点击任意卡片即可打开对应笔记

## 安装

### 通过 Obsidian 社区插件商店

在 Obsidian 设置 → 第三方插件 → 浏览 → 搜索 "Folder Card View"

### 手动安装

1. 从 [Releases](https://github.com/yapchien82/folder-card-view/releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. 放入仓库的 `.obsidian/plugins/folder-card-view/` 目录
3. 在 Obsidian 设置中启用插件

## 开发

```bash
npm install
npm run dev    # 开发模式（watch）
npm run build  # 生产构建
```
