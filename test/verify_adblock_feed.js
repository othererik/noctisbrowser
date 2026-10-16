const assert = require('assert');
const privacyEngine = require('../src/main/privacyEngine');
const feedManager = require('../src/main/feedManager');

console.log('--- Verifying NetScope Ad, Tracker & Feed Blocking (Webkit/Electron) ---');

// 1. Test Default Blocking of Ad Networks
console.log('1. Testing Default Blocking of Major Ad Networks...');
const adUrls = [
  'https://googleads.g.doubleclick.net/pagead/ads?client=ca-pub-123',
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'https://adservice.google.com/adsid/integrator.js',
  'https://aax.amazon-adsystem.com/e/dtb/bid',
  'https://secure.adnxs.com/j/ani.js',
  'https://static.criteo.net/js/ld/ld.js',
  'https://ads.pubmatic.com/AdServer/js/pwt.js',
  'https://secure.rubiconproject.com/p/123/fastlane.json',
  'https://contextual.media.net/bidexchange.js',
  'https://ib.adnxs.com/ut/v3/prebid'
];

for (const url of adUrls) {
  const check = privacyEngine.isTracker(url);
  assert.strictEqual(check.isTracker, true, `Ad URL should be blocked: ${url}`);
}
console.log(`   ✅ All ${adUrls.length} ad networks verified blocked by default!`);

// 2. Test Default Blocking of Sponsored Content & Recommendation Feeds
console.log('2. Testing Default Blocking of Sponsored & Native Ad Feeds...');
const feedUrls = [
  'https://cdn.taboola.com/libtrc/unip/loader.js',
  'https://trc.taboola.com/123/recommendations.get',
  'https://widgets.outbrain.com/outbrain.js',
  'https://log.outbrain.com/logger/feed',
  'https://trends.revcontent.com/serve.js.php',
  'https://gemini.yahoo.com/ad/v1/feed',
  'https://cdn.nativo.net/inline/nativo.js',
  'https://api.content.ad/widgets/get',
  'https://servicer.mgid.com/123/widget.js'
];

for (const url of feedUrls) {
  const check = privacyEngine.isTracker(url);
  assert.strictEqual(check.isTracker, true, `Sponsored feed URL should be blocked: ${url}`);
}
console.log(`   ✅ All ${feedUrls.length} sponsored feeds verified blocked by default!`);

// 3. Test Default Blocking of User Trackers & Telemetry
console.log('3. Testing Default Blocking of Analytics & Telemetry...');
const trackerUrls = [
  'https://www.google-analytics.com/analytics.js',
  'https://www.googletagmanager.com/gtm.js?id=GTM-123',
  'https://connect.facebook.net/en_US/fbevents.js',
  'https://analytics.tiktok.com/i18n/pixel/events.js',
  'https://static.ads-twitter.com/uwt.js',
  'https://snap.licdn.com/li.lms-analytics/insight.min.js',
  'https://www.clarity.ms/tag/xyz789',
  'https://static.hotjar.com/c/hotjar-123.js',
  'https://cdn.segment.io/analytics.js/v1/abc/analytics.min.js',
  'https://api.mixpanel.com/track/',
  'https://cdn.amplitude.com/libs/amplitude-8.0.0.js',
  'https://api.fpjs.io/v3/fingerprint'
];

for (const url of trackerUrls) {
  const check = privacyEngine.isTracker(url);
  assert.strictEqual(check.isTracker, true, `Tracker URL should be blocked: ${url}`);
}
console.log(`   ✅ All ${trackerUrls.length} trackers verified blocked by default!`);

// 4. Test Clean Legitimate Sites (No False Positives)
console.log('4. Testing Safe URLs (Clean Traffic Allowed)...');
const cleanUrls = [
  'https://en.wikipedia.org/wiki/Web_browser',
  'https://api.github.com/repos/electron/electron',
  'https://news.ycombinator.com/news',
  'https://developer.mozilla.org/en-US/docs/Web/API',
  'https://oppose47.com/about'
];

for (const url of cleanUrls) {
  const check = privacyEngine.isTracker(url);
  assert.strictEqual(check.isTracker, false, `Safe URL should NOT be blocked: ${url}`);
}
console.log('   ✅ Safe URLs allowed through without interference!');

// 5. Test Host Parsing in FeedManager
console.log('5. Testing FeedManager Hosts File & Adblock Parsing...');
const mockHostsContent = `
# Comment line
! Adblock comment
127.0.0.1 localhost
0.0.0.0 broadcasthost
127.0.0.1 malicious-adserver.com
0.0.0.0 tracker-node.net
||sponsored-feed-widget.org^
standalone-ad-feed.co
# another comment
0.0.0.0 sub.evil-telemetry.io
`;

const parsedDomains = feedManager.parseHostsText(mockHostsContent);
assert.strictEqual(parsedDomains.includes('malicious-adserver.com'), true);
assert.strictEqual(parsedDomains.includes('tracker-node.net'), true);
assert.strictEqual(parsedDomains.includes('sponsored-feed-widget.org'), true);
assert.strictEqual(parsedDomains.includes('standalone-ad-feed.co'), true);
assert.strictEqual(parsedDomains.includes('sub.evil-telemetry.io'), true);
assert.strictEqual(parsedDomains.includes('localhost'), false, 'localhost must be excluded');
assert.strictEqual(parsedDomains.includes('broadcasthost'), false, 'broadcasthost must be excluded');
console.log(`   ✅ Feed parser extracted ${parsedDomains.length} valid domains correctly!`);

// 6. Test Dynamic In-Memory Feed Injection & Reversion
console.log('6. Testing In-Memory Feed Injection & Clean Reversion...');
const initialHostCount = privacyEngine.adTrackerHosts.size;
const testDomain = 'new-zero-day-adnetwork.biz';

assert.strictEqual(privacyEngine.isTracker(`https://${testDomain}/ad.js`).isTracker, false);

// Inject feed domains
const added = privacyEngine.addFeedDomains([testDomain, 'another-bad-tracker.info'], "Peter Lowe's Feed (Mock)");
assert.strictEqual(added, 2);
assert.strictEqual(privacyEngine.adTrackerHosts.size, initialHostCount + 2);
assert.strictEqual(privacyEngine.isTracker(`https://${testDomain}/ad.js`).isTracker, true, 'Injected domain should now be blocked');

// Reset to defaults
privacyEngine.resetToDefaults();
assert.strictEqual(privacyEngine.adTrackerHosts.size, initialHostCount, 'Should revert back to built-in count');
assert.strictEqual(privacyEngine.isTracker(`https://${testDomain}/ad.js`).isTracker, false, 'Reset domain should no longer be in feed list');
console.log('   ✅ In-memory feed injection and clean reset verified!');

console.log('🎉 ALL AD, TRACKER & FEED BLOCKING TESTS PASSED!');
