const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Curated public feeds for advertising, tracking, and sponsored feeds.
 * All feeds are strictly opt-in; no network calls are ever made without
 * explicit user request.
 */
const CURATED_FEEDS = {
  peter_lowe: {
    id: 'peter_lowe',
    name: "Peter Lowe's Ad & Tracking Servers",
    description: "Lightweight, highly-vetted community list of ad servers and tracking nodes (pgl.yoyo.org).",
    url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext',
    format: 'hosts'
  },
  steven_black: {
    id: 'steven_black',
    name: "StevenBlack Unified Hosts",
    description: "Consolidated, reputable hosts file combining multiple vetted ad & malware feeds (GitHub).",
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
    format: 'hosts'
  },
  adguard_dns: {
    id: 'adguard_dns',
    name: "AdGuard DNS Filter",
    description: "Comprehensive DNS-level ad, tracker, and telemetry blocklist.",
    url: 'https://adguardteam.github.io/HostlistsRegistry/assets/filter_1.txt',
    format: 'mixed'
  }
};

class FeedManager {
  constructor() {
    this.currentFeed = null;
    this.lastUpdated = null;
    this.importedDomainsCount = 0;
    this.feedSourceUrl = null;
  }

  getCuratedFeeds() {
    return Object.values(CURATED_FEEDS);
  }

  getFeedStatus() {
    return {
      currentFeed: this.currentFeed,
      lastUpdated: this.lastUpdated,
      importedDomainsCount: this.importedDomainsCount,
      feedSourceUrl: this.feedSourceUrl
    };
  }

  /**
   * Fetch and parse an ad/tracker blocklist from a URL.
   * Strictly user opt-in. Uses anonymous headers with no cookies or referrer.
   */
  async fetchFeed(feedIdOrUrl, customUrl = null) {
    let targetUrl = '';
    let feedName = 'Custom Feed';

    if (CURATED_FEEDS[feedIdOrUrl]) {
      targetUrl = CURATED_FEEDS[feedIdOrUrl].url;
      feedName = CURATED_FEEDS[feedIdOrUrl].name;
    } else if (customUrl || feedIdOrUrl.startsWith('http://') || feedIdOrUrl.startsWith('https://')) {
      targetUrl = customUrl || feedIdOrUrl;
      feedName = 'Custom Community List';
    } else {
      throw new Error(`Unknown feed identifier: ${feedIdOrUrl}`);
    }

    const rawText = await this._downloadText(targetUrl);
    const domains = this.parseHostsText(rawText);

    if (domains.length === 0) {
      throw new Error('No valid domain names could be extracted from the feed.');
    }

    this.currentFeed = feedName;
    this.lastUpdated = Date.now();
    this.importedDomainsCount = domains.length;
    this.feedSourceUrl = targetUrl;

    return {
      feedName,
      sourceUrl: targetUrl,
      domainsCount: domains.length,
      domains
    };
  }

  /**
   * Parse hosts or plain domain text format into an array of lowercase domain strings.
   * Handles:
   *  - 127.0.0.1 domain.com
   *  - 0.0.0.0 domain.com
   *  - domain.com
   *  - ||domain.com^
   *  - Lines with comments (# or !)
   */
  parseHostsText(text) {
    const domainSet = new Set();
    const lines = text.split(/\r?\n/);
    const domainRegex = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

    for (let rawLine of lines) {
      let line = rawLine.trim();

      // Strip comments
      if (!line || line.startsWith('#') || line.startsWith('!') || line.startsWith('//')) {
        continue;
      }

      // Handle adblock syntax: ||example.com^ or ||example.com^$third-party
      if (line.startsWith('||')) {
        let match = line.slice(2).split('^')[0].trim().toLowerCase();
        if (domainRegex.test(match)) {
          domainSet.add(match);
          continue;
        }
      }

      // Handle hosts syntax: 0.0.0.0 domain.com or 127.0.0.1 domain.com
      const parts = line.split(/\s+/);
      let candidate = '';

      if (parts.length >= 2 && (parts[0] === '0.0.0.0' || parts[0] === '127.0.0.1' || parts[0] === '::1')) {
        candidate = parts[1].trim().toLowerCase();
      } else if (parts.length === 1) {
        candidate = parts[0].trim().toLowerCase();
      }

      // Strip leading/trailing dots or wildcards
      candidate = candidate.replace(/^\*\./, '').replace(/\.$/, '');

      // Exclude localhost/broadcast/invalid
      if (
        candidate &&
        candidate !== 'localhost' &&
        candidate !== 'local' &&
        candidate !== 'broadcasthost' &&
        candidate !== '0.0.0.0' &&
        candidate !== '127.0.0.1' &&
        domainRegex.test(candidate)
      ) {
        domainSet.add(candidate);
      }
    }

    return Array.from(domainSet);
  }

  reset() {
    this.currentFeed = null;
    this.lastUpdated = null;
    this.importedDomainsCount = 0;
    this.feedSourceUrl = null;
  }

  _downloadText(urlString) {
    return new Promise((resolve, reject) => {
      let parsedUrl;
      try {
        parsedUrl = new URL(urlString);
      } catch (e) {
        return reject(new Error(`Invalid URL: ${urlString}`));
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
          'Accept': 'text/plain, text/html, */*',
          'DNT': '1',
          'Sec-GPC': '1'
        },
        timeout: 15000
      };

      const req = client.request(options, (res) => {
        // Follow up to 3 redirects safely
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, urlString).toString();
          return this._downloadText(redirectUrl).then(resolve).catch(reject);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Server responded with HTTP ${res.statusCode} ${res.statusMessage}`));
        }

        let data = '';
        res.setEncoding('utf8');

        res.on('data', chunk => {
          data += chunk;
          // Safeguard: Limit max download size to 25MB
          if (data.length > 25 * 1024 * 1024) {
            req.destroy();
            reject(new Error('Feed content exceeded maximum limit of 25 MB'));
          }
        });

        res.on('end', () => resolve(data));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out after 15 seconds'));
      });

      req.on('error', (err) => reject(err));

      req.end();
    });
  }
}

module.exports = new FeedManager();
