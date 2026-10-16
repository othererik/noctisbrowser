const { EventEmitter } = require('events');

class TabManager extends EventEmitter {
  constructor(networkManager) {
    super();
    this.networkManager = networkManager;
    this.tabs = new Map(); // tabId -> tabData
    this.activeTabId = null;
    this.tabCounter = 1;
  }

  createTab(initialUrl = 'about:blank', title = 'New Tab') {
    const tabId = 'tab-' + (this.tabCounter++);
    const tabData = {
      id: tabId,
      url: initialUrl,
      title: title,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      favicon: null,
      isSpecial: false,
      createdAt: Date.now()
    };

    this.tabs.set(tabId, tabData);
    if (!this.activeTabId) {
      this.activeTabId = tabId;
    }

    this.emit('tab-created', tabData);
    return tabData;
  }

  createSpecialTab(type = 'matrix') {
    const isVault = type === 'vault';
    const tabId = isVault ? 'tab-vault' : 'tab-matrix';
    if (this.tabs.has(tabId)) {
      this.setActiveTab(tabId);
      return this.tabs.get(tabId);
    }

    const tabData = {
      id: tabId,
      url: isVault ? 'noctis://vault' : 'noctis://monitor',
      title: isVault ? 'Privacy Vault' : 'Network Monitor',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      favicon: null,
      isSpecial: true,
      specialType: isVault ? 'vault' : 'monitor',
      createdAt: Date.now()
    };

    this.tabs.set(tabId, tabData);
    this.emit('tab-created', tabData);
    this.setActiveTab(tabId);
    return tabData;
  }

  closeTab(tabId) {
    if (!this.tabs.has(tabId)) return false;

    this.tabs.delete(tabId);
    this.emit('tab-closed', { tabId });

    if (this.activeTabId === tabId) {
      const remainingTabIds = Array.from(this.tabs.keys());
      if (remainingTabIds.length > 0) {
        this.setActiveTab(remainingTabIds[remainingTabIds.length - 1]);
      } else {
        // Create a default tab if all are closed
        const newTab = this.createTab('about:blank', 'New Tab');
        this.setActiveTab(newTab.id);
      }
    }
    return true;
  }

  setActiveTab(tabId) {
    if (!this.tabs.has(tabId)) return false;
    this.activeTabId = tabId;
    this.emit('active-tab-changed', { tabId, tab: this.tabs.get(tabId) });
    return true;
  }

  updateTab(tabId, updates) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    Object.assign(tab, updates);
    this.emit('tab-updated', tab);
  }

  getTab(tabId) {
    return this.tabs.get(tabId) || null;
  }

  getAllTabs() {
    return Array.from(this.tabs.values());
  }

  getActiveTab() {
    return this.tabs.get(this.activeTabId) || null;
  }
}

module.exports = TabManager;
