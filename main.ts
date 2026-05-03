import { Plugin, ItemView, WorkspaceLeaf, TFolder, TFile, setIcon, Menu, MarkdownView, Notice } from 'obsidian';

const VIEW_TYPE_CARD = "folder-card-view";

class FolderCardView extends ItemView {
    currentFolder: TFolder | null = null;
    sortOrder: 'name' | 'time' = 'time'; 
    sortDirection: 'desc' | 'asc' = 'desc'; 
    searchQuery: string = ''; 
    isSearchOpen: boolean = false; 

    headerContainer: HTMLElement;
    contentContainer: HTMLElement;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() { return VIEW_TYPE_CARD; }
    getDisplayText() { return "文件卡片"; }
    getIcon() { return "layout-list"; }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass("folder-card-view-container");

        this.headerContainer = container.createEl("div", { cls: "folder-card-header" });
        this.contentContainer = container.createEl("div", { cls: "folder-card-content-area" });

        this.renderEmptyState();

        this.contentContainer.addEventListener('contextmenu', (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (target.closest('.file-card')) return; 

            if (this.currentFolder) {
                const menu = new Menu();
                this.app.workspace.trigger('file-menu', menu, this.currentFolder, 'file-explorer');
                menu.showAtMouseEvent(event);
            }
        });
    }

    renderEmptyState() {
        this.headerContainer.empty();
        this.contentContainer.empty();
        this.contentContainer.createEl("p", { 
            text: "正在加载...", 
            attr: { style: "text-align: center; margin-top: 40px; color: var(--text-muted); font-size: 13px;" } 
        });
    }

    renderHeader() {
        this.headerContainer.empty();
        if (!this.currentFolder) return;

        const sortBtn = this.headerContainer.createEl("button", { cls: "card-icon-btn" });
        setIcon(sortBtn, "arrow-up-down");
        sortBtn.title = "排序方式";

        const locateBtn = this.headerContainer.createEl("button", { cls: "card-icon-btn" });
        setIcon(locateBtn, "crosshair"); 
        locateBtn.title = "全局定位当前文件";

        const searchBtn = this.headerContainer.createEl("button", { 
            cls: `card-icon-btn ${this.isSearchOpen ? 'is-active' : ''}` 
        });
        setIcon(searchBtn, "search");
        searchBtn.title = "搜索过滤";

        const searchContainer = this.headerContainer.createEl("div", { 
            cls: `folder-card-search-container ${this.isSearchOpen ? 'is-active' : ''}` 
        });
        const searchInput = searchContainer.createEl("input", { 
            type: "text", 
            cls: "folder-card-search-input",
            placeholder: "过滤词..." 
        });
        searchInput.value = this.searchQuery;

        sortBtn.onclick = (event) => {
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle("名称 (A 到 Z)").setIcon("arrow-down-a-z")
                    .setChecked(this.sortOrder === 'name' && this.sortDirection === 'asc')
                    .onClick(() => this.setSort('name', 'asc'));
            });
            menu.addItem((item) => {
                item.setTitle("名称 (Z 到 A)").setIcon("arrow-up-z-a")
                    .setChecked(this.sortOrder === 'name' && this.sortDirection === 'desc')
                    .onClick(() => this.setSort('name', 'desc'));
            });
            menu.addSeparator();
            menu.addItem((item) => {
                item.setTitle("最近修改优先").setIcon("clock")
                    .setChecked(this.sortOrder === 'time' && this.sortDirection === 'desc')
                    .onClick(() => this.setSort('time', 'desc'));
            });
            menu.addItem((item) => {
                item.setTitle("最早修改优先").setIcon("history")
                    .setChecked(this.sortOrder === 'time' && this.sortDirection === 'asc')
                    .onClick(() => this.setSort('time', 'asc'));
            });
            menu.showAtMouseEvent(event);
        };

        // ==========================================
        // 【核心优化点 1】准星按钮的全局跃迁与精准对齐
        // ==========================================
        locateBtn.onclick = async () => {
            const activeFile = this.app.workspace.getActiveFile();
            if (!activeFile) {
                new Notice("当前没有打开的笔记");
                return;
            }

            if (this.searchQuery !== '') {
                this.searchQuery = '';
                this.isSearchOpen = false;
                this.renderHeader(); 
            }

            // 1. 跨目录加载
            if (!this.currentFolder || this.currentFolder.path !== activeFile.parent?.path) {
                await this.renderFolder(activeFile.parent as TFolder);
            }

            // 2. 召唤 Obsidian 原生命令：强制展开所有折叠的父文件夹，让文件树露出来！
            (this.app as any).commands.executeCommandById('file-explorer:reveal-active-file');

            // 3. 开启“帧延迟” (150毫秒)：等待 DOM 渲染完毕，避免长列表算不准高度导致滚动失败
            setTimeout(() => {
                // 处理左侧：同步高亮并让文件夹居中
                document.querySelectorAll('.is-plugin-active-folder').forEach(el => {
                    el.classList.remove('is-plugin-active-folder');
                });
                const targetFolderEl = document.querySelector(`.nav-folder-title[data-path="${activeFile.parent?.path}"]`);
                if (targetFolderEl) {
                    targetFolderEl.classList.add('is-plugin-active-folder');
                    targetFolderEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); // 让左侧也精准滑行
                }

                // 处理右侧：寻找卡片并精准滑行到底部/顶部
                const card = this.contentContainer.querySelector(`.file-card[data-path="${activeFile.path}"]`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    const allCards = this.contentContainer.querySelectorAll('.file-card');
                    allCards.forEach(c => c.classList.remove('is-active'));
                    card.classList.add('is-active');

                    // 给刚滑到的卡片播一个提示动画
                    card.animate([
                        { transform: 'scale(0.97)', backgroundColor: 'var(--interactive-accent)' },
                        { transform: 'scale(1)', backgroundColor: 'var(--background-modifier-active-hover)' }
                    ], { duration: 350, easing: 'ease-out' });
                }
            }, 150);
        };

        searchBtn.onclick = () => {
            this.isSearchOpen = !this.isSearchOpen;
            this.renderHeader(); 
            if (this.isSearchOpen) {
                setTimeout(() => {
                    const input = this.headerContainer.querySelector('.folder-card-search-input') as HTMLInputElement;
                    if (input) input.focus();
                }, 50);
            } else {
                this.searchQuery = '';
                this.renderCards();
            }
        };

        searchInput.addEventListener("input", (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            this.renderCards(); 
        });
    }

    setSort(order: 'name' | 'time', direction: 'asc' | 'desc') {
        this.sortOrder = order;
        this.sortDirection = direction;
        this.renderCards();
    }

    async renderFolder(folder: TFolder) {
        this.currentFolder = folder;
        this.renderHeader();
        await this.renderCards();
    }

    async renderCards() {
        this.contentContainer.empty();
        if (!this.currentFolder) return;

        const allVaultFiles = this.app.vault.getFiles();
        let files = [];
        
        if (this.currentFolder.path === "/") {
            files = allVaultFiles;
        } else {
            const folderPathWithSlash = this.currentFolder.path + '/';
            files = allVaultFiles.filter(f => f.path.startsWith(folderPathWithSlash) || f.parent === this.currentFolder);
        }

        if (this.searchQuery.trim() !== '') {
            const query = this.searchQuery.toLowerCase();
            files = files.filter(f => f.basename.toLowerCase().includes(query));
        }

        files.sort((a, b) => {
            const isADirect = a.parent === this.currentFolder;
            const isBDirect = b.parent === this.currentFolder;

            if (isADirect && !isBDirect) return -1;
            if (!isADirect && isBDirect) return 1;

            if (a.parent?.path !== b.parent?.path) {
                return (a.parent?.path || "").localeCompare(b.parent?.path || "");
            }

            if (this.sortOrder === 'name') {
                const res = a.basename.localeCompare(b.basename);
                return this.sortDirection === 'asc' ? res : -res;
            } else {
                return this.sortDirection === 'asc' ? a.stat.mtime - b.stat.mtime : b.stat.mtime - a.stat.mtime;
            }
        });

        const cardList = this.contentContainer.createEl("div", { cls: "folder-card-list" });
        const activeFile = this.app.workspace.getActiveFile();

        for (const file of files) {
            const card = cardList.createEl("div", { cls: "file-card" });
            card.setAttribute("data-path", file.path);

            if (activeFile && activeFile.path === file.path) {
                card.classList.add("is-active");
            }

            if (file.parent && file.parent !== this.currentFolder) {
                let relPath = file.parent.path;
                if (this.currentFolder.path !== "/") {
                    relPath = relPath.substring(this.currentFolder.path.length + 1);
                }
                card.createEl("div", { cls: "file-card-path", text: relPath });
            }

            card.createEl("div", { cls: "file-card-title", text: file.basename });

            const content = await this.app.vault.cachedRead(file);
            let previewText = content.split('\n').slice(0, 5).join(' ').trim();
            
            const tagRegex = /#[\w\u4e00-\u9fa5]+/g;
            const tags = previewText.match(tagRegex);
            if (tags && tags.length > 0) {
                const tagsContainer = card.createEl("div", { cls: "file-card-tags" });
                tags.forEach(tag => {
                    tagsContainer.createEl("span", { cls: "file-card-tag", text: tag });
                });
                previewText = previewText.replace(tagRegex, '').trim();
            }

            if (previewText) {
                 const cleanText = previewText.replace(/[#*]/g, '').trim();
                 card.createEl("div", { cls: "file-card-preview", text: cleanText || "..." });
            }

            card.onclick = async () => {
                const allCards = this.contentContainer.querySelectorAll('.file-card');
                allCards.forEach(c => c.classList.remove('is-active'));
                card.classList.add("is-active");

                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(file);
                
                if (leaf.view instanceof MarkdownView) {
                    const editor = leaf.view.editor;
                    const firstLineLength = editor.getLine(0).length;
                    editor.setCursor({ line: 0, ch: firstLineLength });
                    editor.focus();
                }
            };
        }
    }
}

export default class FolderCardPlugin extends Plugin {
    async onload() {
        this.registerView(VIEW_TYPE_CARD, (leaf) => new FolderCardView(leaf));

        this.addRibbonIcon('layout-list', '打开文件卡片', () => this.activateView());

        this.registerDomEvent(document, 'click', async (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const folderTitleEl = target.closest('.nav-folder-title');
            if (folderTitleEl) {
                const path = folderTitleEl.getAttribute('data-path');
                if (path) {
                    const abstractFile = this.app.vault.getAbstractFileByPath(path);
                    if (abstractFile instanceof TFolder) {
                        await this.activateView(false); 
                        this.updateCardView(abstractFile);

                        document.querySelectorAll('.is-plugin-active-folder').forEach(el => {
                            el.classList.remove('is-plugin-active-folder');
                        });
                        folderTitleEl.classList.add('is-plugin-active-folder');
                    }
                }
            }
        });
    }

    // ==========================================
    // 【核心优化点 2】冷启动时的全局跃迁修复
    // ==========================================
    async activateView(autoFocusRecent: boolean = true) {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_CARD)[0];
        
        if (!leaf) {
            const fileExplorerLeaf = workspace.getLeavesOfType('file-explorer')[0];
            if (fileExplorerLeaf) {
                leaf = workspace.createLeafBySplit(fileExplorerLeaf, 'vertical');
            } else {
                leaf = workspace.getLeaf('split', 'vertical');
            }
            await leaf.setViewState({ type: VIEW_TYPE_CARD, active: true });
        }
        workspace.revealLeaf(leaf);

        if (autoFocusRecent) {
            setTimeout(async () => {
                const view = leaf.view as FolderCardView;

                let targetFile = workspace.getActiveFile();
                if (!targetFile) {
                    const allFiles = this.app.vault.getFiles().filter(f => f.extension === 'md');
                    if (allFiles.length > 0) {
                        allFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);
                        targetFile = allFiles[0]; 
                    }
                }

                if (targetFile && targetFile.parent) {
                    view.sortOrder = 'time';
                    view.sortDirection = 'desc';
                    
                    await view.renderFolder(targetFile.parent as TFolder);

                    const mainLeaf = workspace.getLeaf(false);
                    await mainLeaf.openFile(targetFile);

                    // 同步展开左侧文件树
                    (this.app as any).commands.executeCommandById('file-explorer:reveal-active-file');

                    // 延迟等渲染，双边同时居中滑行！
                    setTimeout(() => {
                        document.querySelectorAll('.is-plugin-active-folder').forEach(el => {
                            el.classList.remove('is-plugin-active-folder');
                        });
                        const targetFolderEl = document.querySelector(`.nav-folder-title[data-path="${targetFile?.parent?.path}"]`);
                        if (targetFolderEl) {
                            targetFolderEl.classList.add('is-plugin-active-folder');
                            targetFolderEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }

                        const card = view.contentContainer.querySelector(`.file-card[data-path="${targetFile?.path}"]`);
                        if (card) {
                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            card.classList.add('is-active');
                        }
                    }, 150);
                    
                    if (mainLeaf.view instanceof MarkdownView) {
                        const editor = mainLeaf.view.editor;
                        const firstLineLength = editor.getLine(0).length;
                        editor.setCursor({ line: 0, ch: firstLineLength });
                        editor.focus();
                    }
                }

                window.dispatchEvent(new Event('resize'));

            }, 100); 
        }
    }

    updateCardView(folder: TFolder) {
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CARD)[0];
        if (leaf) (leaf.view as FolderCardView).renderFolder(folder);
    }
}