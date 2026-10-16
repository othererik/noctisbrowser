const assert = require('assert');
const NetworkManager = require('../src/main/networkManager');
const TabManager = require('../src/main/tabManager');

console.log('--- Testing NetScope Browser Core Modules ---');

// 1. Test NetworkManager
const nm = new NetworkManager();
assert.strictEqual(nm.isGlobalPaused, false, 'Initial pause state should be false');

// Test pattern matching
assert.strictEqual(nm.matchesPattern('https://google-analytics.com/collect', '*google-analytics.com*'), true);
assert.strictEqual(nm.matchesPattern('https://api.github.com/events', '*github.com*'), true);
assert.strictEqual(nm.matchesPattern('https://example.com/api', '*github.com*'), false);

// Test block rules
const rule = nm.addBlockRule('*example-custom-block.com*', 'Test Block Rule');
assert.strictEqual(rule.enabled, true);
assert.strictEqual(rule.pattern, '*example-custom-block.com*');
const checkBlocked = nm.checkBlocked('https://example-custom-block.com/api/data');
assert.strictEqual(checkBlocked.blocked, true);
assert.strictEqual(rule.hits, 1);

// Test toggling block rule
nm.toggleBlockRule(rule.id, false);
const checkUnblocked = nm.checkBlocked('https://example-custom-block.com/api/data');
assert.strictEqual(checkUnblocked.blocked, false);

// Test breakpoints
const bp = nm.addBreakpoint('url', '/api/users');
assert.strictEqual(bp.type, 'url');
assert.strictEqual(nm.checkBreakpoint({ url: 'https://example.com/api/users', method: 'GET' }), true);
assert.strictEqual(nm.checkBreakpoint({ url: 'https://example.com/static/style.css', method: 'GET' }), false);

// Test global pause
nm.setGlobalPause(true);
assert.strictEqual(nm.isGlobalPaused, true);
assert.strictEqual(nm.checkBreakpoint({ url: 'https://example.com/anywhere', method: 'GET' }), true);
nm.setGlobalPause(false);

// Test TabManager
const tm = new TabManager(nm);
// Default tab should be about:blank (no default Hacker News)
const defaultTab = tm.createTab();
assert.strictEqual(defaultTab.url, 'about:blank', 'Default tab URL must be about:blank');
assert.strictEqual(defaultTab.title, 'New Tab', 'Default tab title must be New Tab');

const tab1 = tm.createTab('https://news.ycombinator.com', 'HN');
assert.strictEqual(tab1.id, 'tab-2');

const matrixTab = tm.createSpecialTab('matrix');
assert.strictEqual(matrixTab.id, 'tab-matrix');
assert.strictEqual(tm.getActiveTab().id, 'tab-matrix');

// Test closing tabs and fallback to about:blank
tm.closeTab('tab-1');
tm.closeTab('tab-2');
tm.closeTab('tab-matrix');
const fallbackTab = tm.getActiveTab();
assert.strictEqual(fallbackTab.url, 'about:blank', 'Fallback when all tabs closed must be about:blank');
assert.strictEqual(fallbackTab.title, 'New Tab', 'Fallback tab title must be New Tab');

console.log('✅ All core tests passed successfully!');

