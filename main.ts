import { App, Plugin, ItemView, WorkspaceLeaf, TFolder, TFile, setIcon, Menu, MarkdownView, Notice, FuzzySuggestModal, Platform } from 'obsidian';

const VIEW_TYPE_CARD = "folder-card-view";

// 文件列表缓存：文件夹路径 → 该文件夹下的文件列表
const folderFileCache = new Map<string, TFile[]>();
// 预览读取上限：超过此数量的卡片不读取文件内容，仅显示骨架
const PREVIEW_LIMIT = 20;
// 卡片渲染数量上限：超过此数量截断，防止极端情况卡死
const MAX_CARDS = 500;

// Obsidian 可直接编辑的文本文件扩展名
const OBSIDIAN_EDITABLE_EXTENSIONS = new Set(['md', 'canvas', 'txt', 'base']);

function isObsidianEditable(file: TFile): boolean {
    return OBSIDIAN_EDITABLE_EXTENSIONS.has(file.extension.toLowerCase());
}

class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
    onChoose: (folder: TFolder) => void;

    constructor(app: App, onChoose: (folder: TFolder) => void) {
        super(app);
        this.onChoose = onChoose;
    }

    getItems(): TFolder[] {
        const folders: TFolder[] = [];
        this.app.vault.getAllLoadedFiles().forEach((f) => {
            if (f instanceof TFolder) {
                folders.push(f);
            }
        });
        return folders;
    }

    getItemText(item: TFolder): string {
        return item.path === "/" ? "仓库根目录" : item.path;
    }

    onChooseItem(item: TFolder, _evt: MouseEvent | KeyboardEvent): void {
        this.onChoose(item);
    }
}

class FolderCardView extends ItemView {
    currentFolder: TFolder | null = null;
    sortOrder: 'name' | 'time' = 'time'; 
    sortDirection: 'desc' | 'asc' = 'desc'; 
    searchQuery: string = ''; 
    isSearchOpen: boolean = false;
    searchDebounceTimer: number | null = null;

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
                this.showFolderMenu({ x: event.clientX, y: event.clientY });
            }
        });

        // 移动端：空白区长按弹出文件夹菜单
        this.addLongPress(this.contentContainer, (pos) => {
            this.showFolderMenu(pos);
        });

        // 默认加载根目录
        const rootFolder = this.app.vault.getRoot();
        await this.renderFolder(rootFolder);
    }

    renderEmptyState() {
        this.headerContainer.empty();
        this.contentContainer.empty();
        this.contentContainer.createEl("p", {
            text: "正在加载...",
            attr: { style: "text-align: center; margin-top: 40px; color: var(--text-muted); font-size: 13px;" }
        });
    }

    showFileMenu(file: TFile, pos: { x: number; y: number }) {
        const menu = new Menu();

        menu.addItem((item) => item
            .setTitle("在新标签页中打开")
            .setIcon("file-plus")
            .onClick(() => this.app.workspace.getLeaf('tab').openFile(file))
        );

        menu.addSeparator();

        menu.addItem((item) => item
            .setTitle("移至其他目录")
            .setIcon("folder-input")
            .onClick(() => {
                new FolderSuggestModal(this.app, async (folder) => {
                    await this.app.fileManager.renameFile(file, `${folder.path}/${file.name}`);
                }).open();
            })
        );

        menu.addItem((item) => item
            .setTitle("复制文件")
            .setIcon("copy")
            .onClick(async () => {
                const newPath = file.path.replace(/(\.[^.]+)$/, ' (副本)$1');
                await this.app.vault.copy(file, newPath);
            })
        );

        menu.addSeparator();

        menu.addItem((item) => item
            .setTitle("复制路径")
            .setIcon("link")
            .onClick(() => {
                const fullPath = (this.app.vault.adapter as any).getFullPath(file.path);
                navigator.clipboard.writeText(fullPath);
            })
        );

        menu.addItem((item) => item
            .setTitle("在系统中显示")
            .setIcon("folder")
            .onClick(() => {
                try {
                    const electron = (window as any).require?.('electron');
                    const fullPath = (this.app.vault.adapter as any).getFullPath(file.path);
                    electron?.shell?.showItemInFolder(fullPath);
                } catch {
                    new Notice("仅桌面端支持此功能");
                }
            })
        );

        menu.addSeparator();

        menu.addItem((item) => item
            .setTitle("删除")
            .setIcon("trash")
            .onClick(() => this.app.fileManager.trashFile(file))
        );

        menu.showAtPosition(pos);
    }

    showFolderMenu(pos: { x: number; y: number }) {
        if (!this.currentFolder) return;
        const menu = new Menu();
        this.app.workspace.trigger('file-menu', menu, this.currentFolder, 'file-explorer');
        menu.showAtPosition(pos);
    }

    private addLongPress(el: HTMLElement, callback: (pos: { x: number; y: number }) => void, duration = 500) {
        let timer: number | null = null;
        let startX = 0;
        let startY = 0;
        const threshold = 10;

        el.addEventListener('touchstart', (e: TouchEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.file-card-more-btn')) return;
            if (e.touches.length !== 1) return;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            (el as any).__longPressFired = false;
            timer = window.setTimeout(() => {
                (el as any).__longPressFired = true;
                callback({ x: startX, y: startY });
                timer = null;
            }, duration);
        }, { passive: true });

        el.addEventListener('touchmove', (e: TouchEvent) => {
            if (timer === null) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
                clearTimeout(timer);
                timer = null;
            }
        }, { passive: true });

        el.addEventListener('touchend', () => {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
        });

        el.addEventListener('touchcancel', () => {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
        });
    }

    renderHeader() {
        this.headerContainer.empty();
        if (!this.currentFolder) return;

        // 根目录图标：点击回到仓库根目录
        const rootBtn = this.headerContainer.createEl("button", { cls: "card-icon-btn card-root-btn" });
        setIcon(rootBtn, "home");
        rootBtn.title = "返回根目录";
        if (this.currentFolder.path === "/") {
            rootBtn.classList.add("is-disabled");
        }
        rootBtn.onclick = async () => {
            if (this.currentFolder?.path === "/") return;
            const rootFolder = this.app.vault.getRoot();
            await this.renderFolder(rootFolder);
        };

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

        // 方案 C：搜索防抖 250ms，避免每次按键都触发完整渲染
        searchInput.addEventListener("input", (e) => {
            this.searchQuery = (e.target as HTMLInputElement).value;
            if (this.searchDebounceTimer) {
                clearTimeout(this.searchDebounceTimer);
            }
            this.searchDebounceTimer = window.setTimeout(() => {
                this.renderCards();
            }, 250);
        });

        // 移动端：右侧文件夹菜单按钮（功能等同长按空白区域）
        if (Platform.isMobile) {
            const folderMenuBtn = this.headerContainer.createEl("button", {
                cls: "card-icon-btn card-folder-menu-btn"
            });
            setIcon(folderMenuBtn, "menu");
            folderMenuBtn.title = "文件夹操作";
            folderMenuBtn.onclick = (e) => {
                if (this.currentFolder) {
                    this.showFolderMenu({ x: e.clientX, y: e.clientY });
                }
            };
        }
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
        if (!this.currentFolder) return;

        // 延迟 100ms 才显示加载态，避免快目录闪现"加载中..."
        let loadingTimer: number | null = window.setTimeout(() => {
            loadingTimer = null;
            this.contentContainer.empty();
            this.contentContainer.createEl("div", { cls: "folder-card-loading" }).createEl("span", { text: "加载中..." });
        }, 100);

        // 使用缓存获取文件夹下的文件列表（方案 D：文件列表缓存）
        const cacheKey = this.currentFolder.path;
        let files: TFile[];

        if (this.searchQuery.trim() === '' && folderFileCache.has(cacheKey)) {
            files = [...folderFileCache.get(cacheKey)!];
        } else {
            const allVaultFiles = this.app.vault.getFiles();
            if (this.currentFolder.path === "/") {
                // 根目录仅显示直接子文件，避免加载全部文件导致卡死
                files = allVaultFiles.filter(f => !f.path.includes("/"));
            } else {
                const folderPathWithSlash = this.currentFolder.path + '/';
                files = allVaultFiles.filter(f => f.path.startsWith(folderPathWithSlash) || f.parent === this.currentFolder);
            }
            // 仅在无搜索时缓存原始列表
            if (this.searchQuery.trim() === '') {
                folderFileCache.set(cacheKey, [...files]);
            }
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

        // 超出上限时截断，避免超大目录渲染卡死
        let truncated = false;
        if (files.length > MAX_CARDS) {
            files = files.slice(0, MAX_CARDS);
            truncated = true;
        }

        // 方案 A：仅对可编辑文件异步读取前 PREVIEW_LIMIT 张的内容，图片等文件直接跳过
        const filesToPreview = files.filter(f => isObsidianEditable(f)).slice(0, PREVIEW_LIMIT);
        const previewContents = await Promise.all(
            filesToPreview.map(f => this.app.vault.cachedRead(f).catch(() => ''))
        );
        const previewMap = new Map(filesToPreview.map((f, i) => [f.path, previewContents[i]]));

        // 数据就绪后取消延迟加载态并渲染卡片
        if (loadingTimer !== null) clearTimeout(loadingTimer);
        this.contentContainer.empty();
        const cardList = this.contentContainer.createEl("div", { cls: "folder-card-list" });
        const activeFile = this.app.workspace.getActiveFile();

        for (const file of files) {
            const editable = isObsidianEditable(file);
            const card = cardList.createEl("div", {
                cls: `file-card ${editable ? '' : 'file-card--non-editable'}`
            });
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

            const titleRow = card.createEl("div", { cls: "file-card-title-row" });
            const titleEl = titleRow.createEl("div", { cls: "file-card-title", text: file.basename });
            // 非可编辑文件显示扩展名标签
            if (!editable) {
                const extBadge = titleRow.createEl("span", { cls: "file-card-ext-badge", text: file.extension.toUpperCase() });
            }
            const moreBtn = titleRow.createEl("button", { cls: "file-card-more-btn" });
            setIcon(moreBtn, "more-vertical");
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.showFileMenu(file, { x: e.clientX, y: e.clientY });
            });

            // \u65b9\u6848 A\uff1a\u4f7f\u7528\u9884\u8bfb\u53d6\u7684\u5185\u5bb9\uff08\u524d PREVIEW_LIMIT \u5f20\uff09\uff0c\u5176\u4f59\u5361\u7247\u4ece\u5143\u6570\u636e\u7f13\u5b58\u83b7\u53d6\u6807\u7b7e
            const cachedContent = previewMap.get(file.path);
            if (cachedContent !== undefined) {
                let previewText = cachedContent.split('\n').slice(0, 5).join(' ').trim();

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
            } else {
                // \u8d85\u51fa\u9884\u89c8\u9650\u5236\u7684\u5361\u7247\uff1a\u4ece\u5143\u6570\u636e\u7f13\u5b58\u8bfb\u53d6\u6807\u7b7e\uff08\u65e0\u9700\u8bfb\u53d6\u6587\u4ef6\u5185\u5bb9\uff09
                const fileCache = this.app.metadataCache.getFileCache(file);
                if (fileCache?.tags?.length) {
                    const tagsContainer = card.createEl("div", { cls: "file-card-tags" });
                    fileCache.tags.forEach(tagCache => {
                        tagsContainer.createEl("span", { cls: "file-card-tag", text: tagCache.tag });
                    });
                }
            }

            card.onclick = async () => {
                if ((card as any).__longPressFired) {
                    (card as any).__longPressFired = false;
                    return;
                }
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

            card.oncontextmenu = (event: MouseEvent) => {
                event.preventDefault();
                this.showFileMenu(file, { x: event.clientX, y: event.clientY });
            };

            // 移动端长按弹出文件菜单
            this.addLongPress(card, (pos) => {
                this.showFileMenu(file, pos);
            });
        }

        // 截断提示
        if (truncated) {
            const truncateNotice = cardList.createEl("div", { cls: "folder-card-truncate-notice" });
            truncateNotice.createEl("span", {
                text: `仅显示前 ${MAX_CARDS} 个文件，使用搜索过滤或进入子目录查看其余文件`,
                attr: { style: "color: var(--text-muted); font-size: 12px;" }
            });
        }
    }
}

export default class FolderCardPlugin extends Plugin {
    private lastFolderClickTime = 0;

    async onload() {
        this.registerView(VIEW_TYPE_CARD, (leaf) => new FolderCardView(leaf));

        this.addRibbonIcon('layout-list', '打开文件卡片', () => this.activateView());

        const refreshCurrentFolder = () => {
            const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CARD)[0];
            if (leaf && (leaf.view as FolderCardView).currentFolder) {
                (leaf.view as FolderCardView).renderCards();
            }
        };

        // 文件变更时清除缓存并刷新视图
        this.registerEvent(this.app.vault.on('create', () => {
            folderFileCache.clear();
            refreshCurrentFolder();
        }));
        this.registerEvent(this.app.vault.on('delete', () => {
            folderFileCache.clear();
            refreshCurrentFolder();
        }));
        this.registerEvent(this.app.vault.on('rename', () => {
            folderFileCache.clear();
            refreshCurrentFolder();
        }));

        const handleFolderClick = async (target: HTMLElement) => {
            const folderTitleEl = target.closest('.nav-folder-title');
            if (!folderTitleEl) return;

            const path = folderTitleEl.getAttribute('data-path');
            if (!path) return;

            const abstractFile = this.app.vault.getAbstractFileByPath(path);
            if (!(abstractFile instanceof TFolder)) return;

            // 防抖：移动端 click 和 touchend 会先后触发，过滤掉 500ms 内的重复调用
            const now = Date.now();
            if (now - this.lastFolderClickTime < 500) return;
            this.lastFolderClickTime = now;

            await this.activateView(false);
            this.updateCardView(abstractFile);

            document.querySelectorAll('.is-plugin-active-folder').forEach(el => {
                el.classList.remove('is-plugin-active-folder');
            });
            folderTitleEl.classList.add('is-plugin-active-folder');
        };

        // 桌面端：click 事件足够
        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
            handleFolderClick(evt.target as HTMLElement);
        });

        // 移动端：touchend 确保在 Obsidian 拦截 touch 事件后仍能触发
        this.registerDomEvent(document, 'touchend', (evt: TouchEvent) => {
            handleFolderClick(evt.target as HTMLElement);
        });
    }

    async activateView(autoFocusRecent: boolean = true) {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_CARD)[0];
        const isNewLeaf = !leaf;

        if (!leaf) {
            if (Platform.isMobile) {
                leaf = workspace.getLeaf('tab');
            } else {
                const fileExplorerLeaf = workspace.getLeavesOfType('file-explorer')[0];
                if (fileExplorerLeaf) {
                    leaf = workspace.createLeafBySplit(fileExplorerLeaf, 'vertical');
                } else {
                    leaf = workspace.getLeaf('split', 'vertical');
                }
            }
            await leaf.setViewState({ type: VIEW_TYPE_CARD, active: true });
        }

        // 新创建的 leaf 需要显示；已存在的仅在主动打开（ribbon 图标）时切换焦点，
        // 文件夹点击时不抢焦点，避免文件树重渲染导致文件夹闪烁消失
        if (isNewLeaf || autoFocusRecent) {
            if (Platform.isMobile) {
                workspace.setActiveLeaf(leaf, { focus: true });
            } else {
                workspace.revealLeaf(leaf);
            }
        }

        if (autoFocusRecent) {
            setTimeout(async () => {
                const view = leaf.view as FolderCardView;
                view.sortOrder = 'time';
                view.sortDirection = 'desc';

                const rootFolder = this.app.vault.getRoot();
                await view.renderFolder(rootFolder);

                window.dispatchEvent(new Event('resize'));
            }, 100);
        }
    }

    updateCardView(folder: TFolder) {
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CARD)[0];
        if (leaf) {
            if (Platform.isMobile) {
                this.app.workspace.setActiveLeaf(leaf, { focus: true });
            }
            (leaf.view as FolderCardView).renderFolder(folder);
        }
    }
}