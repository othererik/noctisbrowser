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

// 7. Test EFF Cover Your Tracks (Panopticlick) Ad, Invisible Tracker, DNT & Behavioral Heuristics
console.log('7. Testing EFF Cover Your Tracks (Ad, Invisible Tracker, DNT & Behavioral 3-Origin Heuristics)...');
assert.strictEqual(
  privacyEngine.isTracker('https://trackersimulator.org/kcarting-tally?&ad_url=123456').isTracker,
  true,
  'EFF CoverYourTracks simulated tracking ad (trackersimulator.org) must be blocked'
);
assert.strictEqual(
  privacyEngine.isTracker('https://trackersimulator.org/kcarting-tally?&random=123456').isTracker,
  true,
  'EFF CoverYourTracks domain-level ad check on /results must be blocked'
);
assert.strictEqual(
  privacyEngine.isTracker('https://eviltracker.net/kcarting-tally?&trackingserver=123456').isTracker,
  true,
  'EFF CoverYourTracks simulated invisible tracker (eviltracker.net) must be blocked'
);
assert.strictEqual(
  privacyEngine.isTracker('https://eviltracker.net/kcarting-tally?&random=123456').isTracker,
  true,
  'EFF CoverYourTracks domain-level tracker check on /results must be blocked'
);
assert.strictEqual(
  privacyEngine.isTracker('https://unknown-ad-host.example/ tally?&ad_url=999').isTracker,
  true,
  'EasyList ad_url= query parameter signature must be blocked on any host'
);
assert.strictEqual(
  privacyEngine.isTracker('https://unknown-beacon-host.example/tally?&trackingserver=999').isTracker,
  true,
  'EasyPrivacy trackingserver= query parameter signature must be blocked on any host'
);
const dntCheck = privacyEngine.isTracker('https://do-not-tracker.org/kcarting-tally?&random=123456', 'https://coveryourtracks.eff.org');
assert.strictEqual(dntCheck.isTracker, false, 'EFF DNT-compliant domain (do-not-tracker.org) must remain unblocked');
assert.strictEqual(dntCheck.dntCompliant, true, 'do-not-tracker.org must be recognized as DNT-compliant');

// Test Privacy Badger 3-origin behavioral heuristic on an unlisted third-party domain
const novelTrackerUrl = 'https://novel-cross-site-observer.org/widget.js';
assert.strictEqual(
  privacyEngine.isTracker(novelTrackerUrl, 'https://firstparty-one.org/page').isTracker,
  false,
  '1st first-party origin should not yet trigger 3-origin behavioral block'
);
assert.strictEqual(
  privacyEngine.isTracker(novelTrackerUrl, 'https://firstparty-two.net/page').isTracker,
  false,
  '2nd first-party origin should not yet trigger 3-origin behavioral block'
);
const thirdOriginCheck = privacyEngine.isTracker(novelTrackerUrl, 'https://firstparty-three.com/page');
assert.strictEqual(
  thirdOriginCheck.isTracker,
  true,
  '3rd distinct first-party origin MUST trigger Privacy Badger behavioral cross-site tracker block'
);
assert.strictEqual(thirdOriginCheck.category, 'behavioral');
privacyEngine.resetToDefaults();
console.log('   ✅ EFF Cover Your Tracks ad, invisible tracker, DNT & behavioral heuristics verified!');

// 8. Test Default-Loaded Community Filter Feeds & Explicit Unload Option
console.log('8. Testing Default-Loaded Community Filter Feeds & Explicit Unload Option...');
const defaultStats = privacyEngine.getStats();
const defaultFeedStatus = feedManager.getFeedStatus();
assert.strictEqual(defaultStats.communityFeedsLoaded, true, 'Community filter feeds must be loaded by default');
assert.strictEqual(defaultFeedStatus.isLoaded, true, 'FeedManager must report default community feed loaded');
assert(defaultStats.feedDomainsCount > 3000, `Expected >3000 default community feed domains, got ${defaultStats.feedDomainsCount}`);
assert.strictEqual(
  privacyEngine.isTracker('https://101com.com/script.js').isTracker,
  true,
  'Domain from default-loaded Peter Lowe community feed (101com.com) must be blocked out of the box'
);

// Unload community feeds
feedManager.unloadFeed();
const unloadedStats = privacyEngine.unloadCommunityFeeds();
assert.strictEqual(unloadedStats.communityFeedsLoaded, false, 'communityFeedsLoaded must be false after unload');
assert.strictEqual(unloadedStats.feedDomainsCount, 0, 'feedDomainsCount must be 0 after unload');
assert.strictEqual(feedManager.getFeedStatus().isLoaded, false, 'FeedManager isLoaded must be false after unload');
assert.strictEqual(
  privacyEngine.isTracker('https://101com.com/script.js').isTracker,
  false,
  'Community feed domain (101com.com) must NOT be blocked when community feeds are unloaded'
);
assert.strictEqual(
  privacyEngine.isTracker('https://googleads.g.doubleclick.net/pagead/ads').isTracker,
  true,
  'Core built-in shield domains must still be blocked when community feeds are unloaded'
);

// Reload default community feed
feedManager.loadDefaultFeed();
const reloadedStats = privacyEngine.loadDefaultCommunityFeed();
assert.strictEqual(reloadedStats.communityFeedsLoaded, true, 'communityFeedsLoaded must be true after reload');
assert(reloadedStats.feedDomainsCount > 3000, 'feedDomainsCount must be restored after reload');
assert.strictEqual(
  privacyEngine.isTracker('https://101com.com/script.js').isTracker,
  true,
  'Community feed domain (101com.com) must be blocked again after reloading default feed'
);
console.log(`   ✅ Default-loaded community feed (${reloadedStats.feedDomainsCount} domains) & explicit unload/reload verified!`);

console.log('🎉 ALL AD, TRACKER & FEED BLOCKING TESTS PASSED!');

