var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => FolderCardPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VIEW_TYPE_CARD = "folder-card-view";
var folderFileCache = /* @__PURE__ */ new Map();
var PREVIEW_LIMIT = 20;
var MAX_CARDS = 500;
var OBSIDIAN_EDITABLE_EXTENSIONS = /* @__PURE__ */ new Set(["md", "canvas", "txt", "base"]);
var nodeFs = null;
var nodePath = null;
try {
  if (!import_obsidian.Platform.isMobile) {
    nodeFs = require("fs");
    nodePath = require("path");
  }
} catch (e) {
}
function isSymlinkEntry(f) {
  return f && f.__isSymlink === true;
}
__name(isSymlinkEntry, "isSymlinkEntry");
function isObsidianEditable(file) {
  return OBSIDIAN_EDITABLE_EXTENSIONS.has(file.extension.toLowerCase());
}
__name(isObsidianEditable, "isObsidianEditable");
var FolderSuggestModal = class extends import_obsidian.FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
  }
  getItems() {
    const folders = [];
    this.app.vault.getAllLoadedFiles().forEach((f) => {
      if (f instanceof import_obsidian.TFolder) {
        folders.push(f);
      }
    });
    return folders;
  }
  getItemText(item) {
    return item.path === "/" ? "\u4ED3\u5E93\u6839\u76EE\u5F55" : item.path;
  }
  onChooseItem(item, _evt) {
    this.onChoose(item);
  }
};
__name(FolderSuggestModal, "FolderSuggestModal");
var FolderCardView = class extends import_obsidian.ItemView {
  constructor(leaf) {
    super(leaf);
    this.currentFolder = null;
    this.sortOrder = "time";
    this.sortDirection = "desc";
    this.searchQuery = "";
    this.isSearchOpen = false;
    this.searchDebounceTimer = null;
    this.renderGeneration = 0;
  }
  getViewType() {
    return VIEW_TYPE_CARD;
  }
  getDisplayText() {
    return "\u6587\u4EF6\u5361\u7247";
  }
  getIcon() {
    return "layout-list";
  }
  onOpen() {
    return __async(this, null, function* () {
      const container = this.containerEl.children[1];
      container.empty();
      container.addClass("folder-card-view-container");
      this.headerContainer = container.createEl("div", { cls: "folder-card-header" });
      this.contentContainer = container.createEl("div", { cls: "folder-card-content-area" });
      this.renderEmptyState();
      this.contentContainer.addEventListener("contextmenu", (event) => {
        const target = event.target;
        if (target.closest(".file-card"))
          return;
        if (this.currentFolder) {
          this.showFolderMenu({ x: event.clientX, y: event.clientY });
        }
      });
      this.addLongPress(this.contentContainer, (pos) => {
        this.showFolderMenu(pos);
      });
      const rootFolder = this.app.vault.getRoot();
      yield this.renderFolder(rootFolder);
    });
  }
  renderEmptyState() {
    this.headerContainer.empty();
    this.contentContainer.empty();
    this.contentContainer.createEl("p", {
      text: "\u6B63\u5728\u52A0\u8F7D...",
      attr: { style: "text-align: center; margin-top: 40px; color: var(--text-muted); font-size: 13px;" }
    });
  }
  showFileMenu(file, pos) {
    const menu = new import_obsidian.Menu();
    menu.addItem(
      (item) => item.setTitle("\u5728\u65B0\u6807\u7B7E\u9875\u4E2D\u6253\u5F00").setIcon("file-plus").onClick(() => this.app.workspace.getLeaf("tab").openFile(file))
    );
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle("\u79FB\u81F3\u5176\u4ED6\u76EE\u5F55").setIcon("folder-input").onClick(() => {
        new FolderSuggestModal(this.app, (folder) => __async(this, null, function* () {
          yield this.app.fileManager.renameFile(file, `${folder.path}/${file.name}`);
        })).open();
      })
    );
    menu.addItem(
      (item) => item.setTitle("\u590D\u5236\u6587\u4EF6").setIcon("copy").onClick(() => __async(this, null, function* () {
        const newPath = file.path.replace(/(\.[^.]+)$/, " (\u526F\u672C)$1");
        yield this.app.vault.copy(file, newPath);
      }))
    );
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle("\u590D\u5236\u8DEF\u5F84").setIcon("link").onClick(() => {
        const fullPath = this.app.vault.adapter.getFullPath(file.path);
        navigator.clipboard.writeText(fullPath);
      })
    );
    menu.addItem(
      (item) => item.setTitle("\u5728\u7CFB\u7EDF\u4E2D\u663E\u793A").setIcon("folder").onClick(() => {
        var _a, _b;
        try {
          const electron = (_a = window.require) == null ? void 0 : _a.call(window, "electron");
          const fullPath = this.app.vault.adapter.getFullPath(file.path);
          (_b = electron == null ? void 0 : electron.shell) == null ? void 0 : _b.showItemInFolder(fullPath);
        } catch (e) {
          new import_obsidian.Notice("\u4EC5\u684C\u9762\u7AEF\u652F\u6301\u6B64\u529F\u80FD");
        }
      })
    );
    menu.addSeparator();
    menu.addItem(
      (item) => item.setTitle("\u5220\u9664").setIcon("trash").onClick(() => this.app.fileManager.trashFile(file))
    );
    menu.showAtPosition(pos);
  }
  showFolderMenu(pos) {
    if (!this.currentFolder)
      return;
    const menu = new import_obsidian.Menu();
    this.app.workspace.trigger("file-menu", menu, this.currentFolder, "file-explorer");
    menu.showAtPosition(pos);
  }
  addLongPress(el, callback, duration = 500) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    const threshold = 10;
    el.addEventListener("touchstart", (e) => {
      const target = e.target;
      if (target.closest(".file-card-more-btn"))
        return;
      if (e.touches.length !== 1)
        return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      el.__longPressFired = false;
      timer = window.setTimeout(() => {
        el.__longPressFired = true;
        callback({ x: startX, y: startY });
        timer = null;
      }, duration);
    }, { passive: true });
    el.addEventListener("touchmove", (e) => {
      if (timer === null)
        return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
        clearTimeout(timer);
        timer = null;
      }
    }, { passive: true });
    el.addEventListener("touchend", () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    });
    el.addEventListener("touchcancel", () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    });
  }
  renderHeader() {
    this.headerContainer.empty();
    if (!this.currentFolder)
      return;
    const rootBtn = this.headerContainer.createEl("button", { cls: "card-icon-btn card-root-btn" });
    (0, import_obsidian.setIcon)(rootBtn, "home");
    rootBtn.title = "\u8FD4\u56DE\u6839\u76EE\u5F55";
    if (this.currentFolder.path === "/") {
      rootBtn.classList.add("is-disabled");
    }
    rootBtn.onclick = () => __async(this, null, function* () {
      var _a;
      if (((_a = this.currentFolder) == null ? void 0 : _a.path) === "/")
        return;
      const rootFolder = this.app.vault.getRoot();
      yield this.renderFolder(rootFolder);
    });
    const sortBtn = this.headerContainer.createEl("button", { cls: "card-icon-btn" });
    (0, import_obsidian.setIcon)(sortBtn, "arrow-up-down");
    sortBtn.title = "\u6392\u5E8F\u65B9\u5F0F";
    const locateBtn = this.headerContainer.createEl("button", { cls: "card-icon-btn" });
    (0, import_obsidian.setIcon)(locateBtn, "crosshair");
    locateBtn.title = "\u5168\u5C40\u5B9A\u4F4D\u5F53\u524D\u6587\u4EF6";
    const searchBtn = this.headerContainer.createEl("button", {
      cls: `card-icon-btn ${this.isSearchOpen ? "is-active" : ""}`
    });
    (0, import_obsidian.setIcon)(searchBtn, "search");
    searchBtn.title = "\u641C\u7D22\u8FC7\u6EE4";
    const searchContainer = this.headerContainer.createEl("div", {
      cls: `folder-card-search-container ${this.isSearchOpen ? "is-active" : ""}`
    });
    const searchInput = searchContainer.createEl("input", {
      type: "text",
      cls: "folder-card-search-input",
      placeholder: "\u8FC7\u6EE4\u8BCD..."
    });
    searchInput.value = this.searchQuery;
    sortBtn.onclick = (event) => {
      const menu = new import_obsidian.Menu();
      menu.addItem((item) => {
        item.setTitle("\u540D\u79F0 (A \u5230 Z)").setIcon("arrow-down-a-z").setChecked(this.sortOrder === "name" && this.sortDirection === "asc").onClick(() => this.setSort("name", "asc"));
      });
      menu.addItem((item) => {
        item.setTitle("\u540D\u79F0 (Z \u5230 A)").setIcon("arrow-up-z-a").setChecked(this.sortOrder === "name" && this.sortDirection === "desc").onClick(() => this.setSort("name", "desc"));
      });
      menu.addSeparator();
      menu.addItem((item) => {
        item.setTitle("\u6700\u8FD1\u4FEE\u6539\u4F18\u5148").setIcon("clock").setChecked(this.sortOrder === "time" && this.sortDirection === "desc").onClick(() => this.setSort("time", "desc"));
      });
      menu.addItem((item) => {
        item.setTitle("\u6700\u65E9\u4FEE\u6539\u4F18\u5148").setIcon("history").setChecked(this.sortOrder === "time" && this.sortDirection === "asc").onClick(() => this.setSort("time", "asc"));
      });
      menu.showAtMouseEvent(event);
    };
    locateBtn.onclick = () => __async(this, null, function* () {
      var _a;
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        new import_obsidian.Notice("\u5F53\u524D\u6CA1\u6709\u6253\u5F00\u7684\u7B14\u8BB0");
        return;
      }
      if (this.searchQuery !== "") {
        this.searchQuery = "";
        this.isSearchOpen = false;
        this.renderHeader();
      }
      if (!this.currentFolder || this.currentFolder.path !== ((_a = activeFile.parent) == null ? void 0 : _a.path)) {
        yield this.renderFolder(activeFile.parent);
      }
      this.app.commands.executeCommandById("file-explorer:reveal-active-file");
      setTimeout(() => {
        var _a2;
        document.querySelectorAll(".is-plugin-active-folder").forEach((el) => {
          el.classList.remove("is-plugin-active-folder");
        });
        const targetFolderEl = document.querySelector(`.nav-folder-title[data-path="${(_a2 = activeFile.parent) == null ? void 0 : _a2.path}"]`);
        if (targetFolderEl) {
          targetFolderEl.classList.add("is-plugin-active-folder");
          targetFolderEl.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        const card = this.contentContainer.querySelector(`.file-card[data-path="${activeFile.path}"]`);
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          const allCards = this.contentContainer.querySelectorAll(".file-card");
          allCards.forEach((c) => c.classList.remove("is-active"));
          card.classList.add("is-active");
          card.animate([
            { transform: "scale(0.97)", backgroundColor: "var(--interactive-accent)" },
            { transform: "scale(1)", backgroundColor: "var(--background-modifier-active-hover)" }
          ], { duration: 350, easing: "ease-out" });
        }
      }, 150);
    });
    searchBtn.onclick = () => {
      this.isSearchOpen = !this.isSearchOpen;
      this.renderHeader();
      if (this.isSearchOpen) {
        setTimeout(() => {
          const input = this.headerContainer.querySelector(".folder-card-search-input");
          if (input)
            input.focus();
        }, 50);
      } else {
        this.searchQuery = "";
        this.renderCards();
      }
    };
    searchInput.addEventListener("input", (e) => {
      this.searchQuery = e.target.value;
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
      }
      this.searchDebounceTimer = window.setTimeout(() => {
        this.renderCards();
      }, 250);
    });
    if (import_obsidian.Platform.isMobile) {
      const folderMenuBtn = this.headerContainer.createEl("button", {
        cls: "card-icon-btn card-folder-menu-btn"
      });
      (0, import_obsidian.setIcon)(folderMenuBtn, "menu");
      folderMenuBtn.title = "\u6587\u4EF6\u5939\u64CD\u4F5C";
      folderMenuBtn.onclick = (e) => {
        if (this.currentFolder) {
          this.showFolderMenu({ x: e.clientX, y: e.clientY });
        }
      };
    }
  }
  setSort(order, direction) {
    this.sortOrder = order;
    this.sortDirection = direction;
    this.renderCards();
  }
  renderFolder(folder) {
    return __async(this, null, function* () {
      this.currentFolder = folder;
      this.renderHeader();
      yield this.renderCards();
    });
  }
  renderCards() {
    return __async(this, null, function* () {
      var _a;
      if (!this.currentFolder)
        return;
      const generation = ++this.renderGeneration;
      let loadingTimer = window.setTimeout(() => {
        loadingTimer = null;
        this.contentContainer.empty();
        this.contentContainer.createEl("div", { cls: "folder-card-loading" }).createEl("span", { text: "\u52A0\u8F7D\u4E2D..." });
      }, 100);
      const cacheKey = this.currentFolder.path;
      let files;
      if (this.searchQuery.trim() === "" && folderFileCache.has(cacheKey)) {
        files = [...folderFileCache.get(cacheKey)];
      } else {
        const allVaultFiles = this.app.vault.getFiles();
        if (this.currentFolder.path === "/") {
          files = allVaultFiles.filter((f) => !f.path.includes("/"));
        } else {
          const folderPathWithSlash = this.currentFolder.path + "/";
          files = allVaultFiles.filter((f) => f.path.startsWith(folderPathWithSlash) || f.parent === this.currentFolder);
        }
        if (this.searchQuery.trim() === "") {
          folderFileCache.set(cacheKey, [...files]);
        }
      }
      if (nodeFs && nodePath && this.searchQuery.trim() === "") {
        try {
          const adapter = this.app.vault.adapter;
          if (adapter.getFullPath) {
            const folderFullPath = adapter.getFullPath(this.currentFolder.path);
            const dirEntries = nodeFs.readdirSync(folderFullPath, { withFileTypes: true });
            const vaultFileNames = new Set(files.map((f) => f.name));
            for (const entry of dirEntries) {
              if (entry.isSymbolicLink()) {
                const linkFullPath = nodePath.join(folderFullPath, entry.name);
                const realPath = nodeFs.realpathSync(linkFullPath);
                const ext = nodePath.extname(entry.name).toLowerCase().slice(1);
                if (ext && nodeFs.statSync(realPath).isFile()) {
                  const realStat = nodeFs.statSync(realPath);
                  const symEntry = {
                    name: entry.name,
                    basename: nodePath.basename(entry.name, nodePath.extname(entry.name)),
                    extension: ext,
                    path: this.currentFolder.path === "/" ? entry.name : `${this.currentFolder.path}/${entry.name}`,
                    parent: this.currentFolder,
                    stat: { mtime: realStat.mtimeMs, ctime: realStat.ctimeMs, size: realStat.size },
                    __isSymlink: true,
                    __linkTarget: realPath
                  };
                  if (!vaultFileNames.has(entry.name)) {
                    files.push(symEntry);
                  } else {
                    const idx = files.findIndex((f) => f.name === entry.name);
                    if (idx !== -1)
                      files[idx] = symEntry;
                  }
                }
              }
            }
          }
        } catch (_e) {
        }
      }
      if (this.searchQuery.trim() !== "") {
        const query = this.searchQuery.toLowerCase();
        files = files.filter((f) => f.basename.toLowerCase().includes(query));
      }
      files.sort((a, b) => {
        var _a2, _b, _c, _d;
        const isADirect = a.parent === this.currentFolder;
        const isBDirect = b.parent === this.currentFolder;
        if (isADirect && !isBDirect)
          return -1;
        if (!isADirect && isBDirect)
          return 1;
        if (((_a2 = a.parent) == null ? void 0 : _a2.path) !== ((_b = b.parent) == null ? void 0 : _b.path)) {
          return (((_c = a.parent) == null ? void 0 : _c.path) || "").localeCompare(((_d = b.parent) == null ? void 0 : _d.path) || "");
        }
        if (this.sortOrder === "name") {
          const res = a.basename.localeCompare(b.basename);
          return this.sortDirection === "asc" ? res : -res;
        } else {
          return this.sortDirection === "asc" ? a.stat.mtime - b.stat.mtime : b.stat.mtime - a.stat.mtime;
        }
      });
      let truncated = false;
      if (files.length > MAX_CARDS) {
        files = files.slice(0, MAX_CARDS);
        truncated = true;
      }
      const filesToPreview = files.filter((f) => isObsidianEditable(f)).slice(0, PREVIEW_LIMIT);
      const previewContents = yield Promise.all(
        filesToPreview.map((f) => {
          if (isSymlinkEntry(f)) {
            return Promise.resolve((nodeFs == null ? void 0 : nodeFs.readFileSync(f.__linkTarget, "utf-8")) || "");
          }
          return this.app.vault.cachedRead(f).catch(() => "");
        })
      );
      const previewMap = new Map(filesToPreview.map((f, i) => [f.path, previewContents[i]]));
      if (this.renderGeneration !== generation)
        return;
      if (loadingTimer !== null)
        clearTimeout(loadingTimer);
      const fragment = document.createDocumentFragment();
      const cardList = document.createElement("div");
      cardList.className = "folder-card-list";
      fragment.appendChild(cardList);
      const activeFile = this.app.workspace.getActiveFile();
      for (const file of files) {
        const editable = isObsidianEditable(file);
        const card = cardList.createEl("div", {
          cls: `file-card ${editable ? "" : "file-card--non-editable"}`
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
        if (!editable) {
          const extBadge = titleRow.createEl("span", { cls: "file-card-ext-badge", text: file.extension.toUpperCase() });
        }
        if (isSymlinkEntry(file)) {
          card.classList.add("file-card--symlink");
          titleRow.createEl("span", { cls: "file-card-symlink-badge", text: "\u{1F517}" });
        }
        const moreBtn = titleRow.createEl("button", { cls: "file-card-more-btn" });
        (0, import_obsidian.setIcon)(moreBtn, "more-vertical");
        moreBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.showFileMenu(file, { x: e.clientX, y: e.clientY });
        });
        const cachedContent = previewMap.get(file.path);
        if (cachedContent !== void 0) {
          let previewText = cachedContent.split("\n").slice(0, 5).join(" ").trim();
          const tagRegex = /#[\w\u4e00-\u9fa5]+/g;
          const tags = previewText.match(tagRegex);
          if (tags && tags.length > 0) {
            const tagsContainer = card.createEl("div", { cls: "file-card-tags" });
            tags.forEach((tag) => {
              tagsContainer.createEl("span", { cls: "file-card-tag", text: tag });
            });
            previewText = previewText.replace(tagRegex, "").trim();
          }
          if (previewText) {
            const cleanText = previewText.replace(/[#*]/g, "").trim();
            card.createEl("div", { cls: "file-card-preview", text: cleanText || "..." });
          }
        } else {
          const fileCache = this.app.metadataCache.getFileCache(file);
          if ((_a = fileCache == null ? void 0 : fileCache.tags) == null ? void 0 : _a.length) {
            const tagsContainer = card.createEl("div", { cls: "file-card-tags" });
            fileCache.tags.forEach((tagCache) => {
              tagsContainer.createEl("span", { cls: "file-card-tag", text: tagCache.tag });
            });
          }
        }
        card.onclick = () => __async(this, null, function* () {
          if (card.__longPressFired) {
            card.__longPressFired = false;
            return;
          }
          const allCards = this.contentContainer.querySelectorAll(".file-card");
          allCards.forEach((c) => c.classList.remove("is-active"));
          card.classList.add("is-active");
          if (isSymlinkEntry(file)) {
            try {
              const cacheDir = "_symlink_cache";
              if (!this.app.vault.getAbstractFileByPath(cacheDir)) {
                yield this.app.vault.createFolder(cacheDir);
              }
              const content = (nodeFs == null ? void 0 : nodeFs.readFileSync(file.__linkTarget, "utf-8")) || "";
              const cachePath = `${cacheDir}/${file.name}`;
              const oldFile = this.app.vault.getAbstractFileByPath(cachePath);
              if (oldFile instanceof import_obsidian.TFile) {
                yield this.app.vault.delete(oldFile);
              }
              yield this.app.vault.create(cachePath, content);
              const tempFile = this.app.vault.getAbstractFileByPath(cachePath);
              if (tempFile instanceof import_obsidian.TFile) {
                const leaf = this.app.workspace.getLeaf(false);
                yield leaf.openFile(tempFile);
                if (leaf.view instanceof import_obsidian.MarkdownView) {
                  const editor = leaf.view.editor;
                  const firstLineLength = editor.getLine(0).length;
                  editor.setCursor({ line: 0, ch: firstLineLength });
                  editor.focus();
                }
              }
            } catch (_e) {
              new import_obsidian.Notice(`\u65E0\u6CD5\u6253\u5F00\u8F6F\u94FE\u6587\u4EF6: ${file.name}`);
            }
          } else {
            const leaf = this.app.workspace.getLeaf(false);
            yield leaf.openFile(file);
            if (leaf.view instanceof import_obsidian.MarkdownView) {
              const editor = leaf.view.editor;
              const firstLineLength = editor.getLine(0).length;
              editor.setCursor({ line: 0, ch: firstLineLength });
              editor.focus();
            }
          }
        });
        card.oncontextmenu = (event) => {
          event.preventDefault();
          this.showFileMenu(file, { x: event.clientX, y: event.clientY });
        };
        this.addLongPress(card, (pos) => {
          this.showFileMenu(file, pos);
        });
      }
      if (truncated) {
        const truncateNotice = cardList.createEl("div", { cls: "folder-card-truncate-notice" });
        truncateNotice.createEl("span", {
          text: `\u4EC5\u663E\u793A\u524D ${MAX_CARDS} \u4E2A\u6587\u4EF6\uFF0C\u4F7F\u7528\u641C\u7D22\u8FC7\u6EE4\u6216\u8FDB\u5165\u5B50\u76EE\u5F55\u67E5\u770B\u5176\u4F59\u6587\u4EF6`,
          attr: { style: "color: var(--text-muted); font-size: 12px;" }
        });
      }
      this.contentContainer.empty();
      this.contentContainer.appendChild(fragment);
    });
  }
};
__name(FolderCardView, "FolderCardView");
var FolderCardPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.lastFolderClickTime = 0;
  }
  onload() {
    return __async(this, null, function* () {
      this.registerView(VIEW_TYPE_CARD, (leaf) => new FolderCardView(leaf));
      this.addRibbonIcon("layout-list", "\u6253\u5F00\u6587\u4EF6\u5361\u7247", () => this.activateView());
      const refreshCurrentFolder = /* @__PURE__ */ __name(() => {
        const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CARD)[0];
        if (leaf && leaf.view.currentFolder) {
          leaf.view.renderCards();
        }
      }, "refreshCurrentFolder");
      const isCacheDir = /* @__PURE__ */ __name((path) => path.startsWith("_symlink_cache/") || path === "_symlink_cache", "isCacheDir");
      this.registerEvent(this.app.vault.on("create", (file) => {
        if (isCacheDir(file.path))
          return;
        folderFileCache.clear();
        refreshCurrentFolder();
      }));
      this.registerEvent(this.app.vault.on("delete", (file) => {
        if (isCacheDir(file.path))
          return;
        folderFileCache.clear();
        refreshCurrentFolder();
      }));
      this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
        if (isCacheDir(file.path) || isCacheDir(oldPath))
          return;
        folderFileCache.clear();
        refreshCurrentFolder();
      }));
      const handleFolderClick = /* @__PURE__ */ __name((target) => __async(this, null, function* () {
        const folderTitleEl = target.closest(".nav-folder-title");
        if (!folderTitleEl)
          return;
        const path = folderTitleEl.getAttribute("data-path");
        if (!path)
          return;
        const abstractFile = this.app.vault.getAbstractFileByPath(path);
        if (!(abstractFile instanceof import_obsidian.TFolder))
          return;
        const now = Date.now();
        if (now - this.lastFolderClickTime < 500)
          return;
        this.lastFolderClickTime = now;
        yield this.activateView(false);
        this.updateCardView(abstractFile);
        document.querySelectorAll(".is-plugin-active-folder").forEach((el) => {
          el.classList.remove("is-plugin-active-folder");
        });
        folderTitleEl.classList.add("is-plugin-active-folder");
      }), "handleFolderClick");
      this.registerDomEvent(document, "click", (evt) => {
        handleFolderClick(evt.target);
      });
      this.registerDomEvent(document, "touchend", (evt) => {
        handleFolderClick(evt.target);
      });
    });
  }
  activateView(autoFocusRecent = true) {
    return __async(this, null, function* () {
      const { workspace } = this.app;
      let leaf = workspace.getLeavesOfType(VIEW_TYPE_CARD)[0];
      const isNewLeaf = !leaf;
      if (!leaf) {
        if (import_obsidian.Platform.isMobile) {
          leaf = workspace.getLeaf("tab");
        } else {
          const fileExplorerLeaf = workspace.getLeavesOfType("file-explorer")[0];
          if (fileExplorerLeaf) {
            leaf = workspace.createLeafBySplit(fileExplorerLeaf, "vertical");
          } else {
            leaf = workspace.getLeaf("split", "vertical");
          }
        }
        yield leaf.setViewState({ type: VIEW_TYPE_CARD, active: true });
      }
      if (isNewLeaf || autoFocusRecent) {
        if (import_obsidian.Platform.isMobile) {
          workspace.setActiveLeaf(leaf, { focus: true });
        } else {
          workspace.revealLeaf(leaf);
        }
      }
      if (autoFocusRecent) {
        setTimeout(() => __async(this, null, function* () {
          const view = leaf.view;
          view.sortOrder = "time";
          view.sortDirection = "desc";
          const rootFolder = this.app.vault.getRoot();
          yield view.renderFolder(rootFolder);
          window.dispatchEvent(new Event("resize"));
        }), 100);
      }
    });
  }
  updateCardView(folder) {
    const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_CARD)[0];
    if (leaf) {
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      leaf.view.renderFolder(folder);
    }
  }
};
__name(FolderCardPlugin, "FolderCardPlugin");
