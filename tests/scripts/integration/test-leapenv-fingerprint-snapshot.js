const assert = require('assert');
const { runJsonWithPreloadedTarget } = require('./standalone-preload-helper');

function parseJson(raw, label) {
  try {
    return JSON.parse(String(raw));
  } catch (err) {
    err.message = `[${label}] JSON parse failed: ${err.message}\nraw=${raw}`;
    throw err;
  }
}

async function runProbe(taskId, fingerprintSnapshot, markerValue) {
  return runJsonWithPreloadedTarget(`
      (function () {
        localStorage.setItem('k', ${JSON.stringify(String(markerValue))});
        sessionStorage.setItem('k', ${JSON.stringify(String(markerValue))});
        history.pushState({ marker: ${JSON.stringify(String(markerValue))} }, '', location.href);
        return JSON.stringify({
          locationHref: String(location.href),
          locationOrigin: String(location.origin),
          documentURL: String(document.URL),
          cookie: String(document.cookie),
          navigator: {
            userAgent: String(navigator.userAgent),
            language: String(navigator.language),
            languages: Array.isArray(navigator.languages) ? navigator.languages.slice() : [],
            platform: String(navigator.platform),
            vendor: String(navigator.vendor),
            webdriver: !!navigator.webdriver,
            hardwareConcurrency: Number(navigator.hardwareConcurrency || 0),
            maxTouchPoints: Number(navigator.maxTouchPoints || 0),
            pdfViewerEnabled: !!navigator.pdfViewerEnabled,
            pluginsTag: navigator.plugins ? Object.prototype.toString.call(navigator.plugins) : '',
            pluginsLength: Number(navigator.plugins && navigator.plugins.length || 0),
            plugin0Tag: navigator.plugins && navigator.plugins[0] ? Object.prototype.toString.call(navigator.plugins[0]) : '',
            plugin0Name: navigator.plugins && navigator.plugins[0] ? String(navigator.plugins[0].name || '') : '',
            pluginByNameName: navigator.plugins && typeof navigator.plugins.namedItem === 'function' && navigator.plugins.namedItem('Chrome PDF Viewer')
              ? String(navigator.plugins.namedItem('Chrome PDF Viewer').name || '')
              : '',
            plugin0Mime0Tag: navigator.plugins && navigator.plugins[0] && navigator.plugins[0][0]
              ? Object.prototype.toString.call(navigator.plugins[0][0])
              : '',
            plugin0Mime0Type: navigator.plugins && navigator.plugins[0] && navigator.plugins[0][0]
              ? String(navigator.plugins[0][0].type || '')
              : '',
            mimeTypesTag: navigator.mimeTypes ? Object.prototype.toString.call(navigator.mimeTypes) : '',
            mimeTypesLength: Number(navigator.mimeTypes && navigator.mimeTypes.length || 0),
            mimeType0Tag: navigator.mimeTypes && navigator.mimeTypes[0] ? Object.prototype.toString.call(navigator.mimeTypes[0]) : '',
            mimeType0: navigator.mimeTypes && navigator.mimeTypes[0] ? String(navigator.mimeTypes[0].type || '') : '',
            mimeTypeByName: navigator.mimeTypes && typeof navigator.mimeTypes.namedItem === 'function' && navigator.mimeTypes.namedItem('application/pdf')
              ? String(navigator.mimeTypes.namedItem('application/pdf').type || '')
              : '',
            permissionsType: typeof navigator.permissions,
            permissionsQueryType: navigator.permissions ? typeof navigator.permissions.query : 'undefined',
            permissionsQueryThenable: !!(navigator.permissions && navigator.permissions.query && navigator.permissions.query({ name: 'geolocation' }) && typeof navigator.permissions.query({ name: 'geolocation' }).then === 'function'),
            permissionStatusFactoryTag: (function () {
              try {
                if (!leapenv || !leapenv.navigatorBrandObjects || typeof leapenv.navigatorBrandObjects.createPermissionStatusObject !== 'function') return '';
                return Object.prototype.toString.call(leapenv.navigatorBrandObjects.createPermissionStatusObject('prompt', 'geolocation'));
              } catch (_) {
                return '';
              }
            })(),
            permissionStatusFactoryName: (function () {
              try {
                if (!leapenv || !leapenv.navigatorBrandObjects || typeof leapenv.navigatorBrandObjects.createPermissionStatusObject !== 'function') return '';
                return String(leapenv.navigatorBrandObjects.createPermissionStatusObject('prompt', 'geolocation').name || '');
              } catch (_) {
                return '';
              }
            })(),
            permissionStatusFactoryState: (function () {
              try {
                if (!leapenv || !leapenv.navigatorBrandObjects || typeof leapenv.navigatorBrandObjects.createPermissionStatusObject !== 'function') return '';
                return String(leapenv.navigatorBrandObjects.createPermissionStatusObject('prompt', 'geolocation').state || '');
              } catch (_) {
                return '';
              }
            })()
          },
          screen: {
            width: Number(screen.width),
            height: Number(screen.height),
            availWidth: Number(screen.availWidth),
            availHeight: Number(screen.availHeight),
            colorDepth: Number(screen.colorDepth),
            pixelDepth: Number(screen.pixelDepth)
          },
          windowMetrics: {
            innerWidth: Number(window.innerWidth),
            innerHeight: Number(window.innerHeight),
            outerWidth: Number(window.outerWidth),
            outerHeight: Number(window.outerHeight),
            devicePixelRatio: Number(window.devicePixelRatio)
          },
          performance: {
            timeOrigin: Number(performance.timeOrigin),
            nowType: typeof performance.now()
          },
          history: {
            length: Number(history.length),
            stateMarker: history.state && history.state.marker || null
          },
          storage: {
            localLength: Number(localStorage.length),
            localK: localStorage.getItem('k'),
            sessionLength: Number(sessionStorage.length),
            sessionK: sessionStorage.getItem('k')
          }
        });
      })();
    `,
    {
    taskId,
    fingerprintSnapshot,
    },
    { debug: false },
    taskId
  );
}

async function runDefaultProbe(taskId) {
  return runJsonWithPreloadedTarget(`
      (function () {
        return JSON.stringify({
          locationHref: String(location.href),
          locationOrigin: String(location.origin),
          documentURL: String(document.URL),
          cookie: String(document.cookie),
          historyLength: Number(history.length),
          historyState: history.state,
          localLength: Number(localStorage.length),
          sessionLength: Number(sessionStorage.length),
          navigatorUA: String(navigator.userAgent),
          navigatorPluginsLength: Number(navigator.plugins && navigator.plugins.length || 0),
          navigatorMimeTypesLength: Number(navigator.mimeTypes && navigator.mimeTypes.length || 0),
          navigatorPdfViewerEnabled: !!navigator.pdfViewerEnabled,
          navigatorPermissionsType: typeof navigator.permissions,
          screenWidth: Number(screen.width),
          innerWidth: Number(window.innerWidth)
        });
      })();
    `,
    {
    taskId,
    },
    { debug: false },
    taskId
  );
}

async function main() {
  const snapshotA = {
      cookie: 'sid=A1; token=TKA',
      location: {
        href: 'https://a.example.test:8443/path-a?q=1#ha'
      },
      navigator: {
        userAgent: 'UA-A/1.0',
        platform: 'Linux x86_64',
        language: 'en-US',
        languages: ['en-US', 'en'],
        vendor: 'VendorA',
        webdriver: false,
        hardwareConcurrency: 16,
        maxTouchPoints: 2,
        pdfViewerEnabled: true,
        plugins: [
          {
            name: 'Chrome PDF Viewer',
            filename: 'internal-pdf-viewer',
            description: 'Portable Document Format',
            mimeTypes: [
              {
                type: 'application/pdf',
                suffixes: 'pdf',
                description: 'Portable Document Format'
              }
            ]
          }
        ],
        mimeTypes: [
          {
            type: 'application/pdf',
            suffixes: 'pdf',
            description: 'Portable Document Format'
          }
        ],
        permissions: {
          geolocation: 'granted'
        }
      },
      screen: {
        width: 1440,
        height: 900,
        availWidth: 1440,
        availHeight: 860,
        colorDepth: 24,
        pixelDepth: 24
      },
      windowMetrics: {
        innerWidth: 1200,
        innerHeight: 700,
        outerWidth: 1280,
        outerHeight: 800,
        devicePixelRatio: 2
      },
      performanceSeed: {
        timeOrigin: 1700000000000,
        startOffset: 12
      }
    };

    const snapshotB = {
      cookie: 'sid=B2',
      location: {
        protocol: 'https:',
        hostname: 'b.example.test',
        pathname: '/path-b',
        search: '?z=9',
        hash: '#hb'
      },
      navigator: {
        userAgent: 'UA-B/2.0',
        platform: 'Win32',
        language: 'zh-CN',
        languages: ['zh-CN', 'zh'],
        vendor: 'VendorB',
        webdriver: true,
        hardwareConcurrency: 4,
        maxTouchPoints: 0,
        pdfViewerEnabled: false,
        plugins: [],
        mimeTypes: [],
        permissions: {
          geolocation: 'denied'
        }
      },
      screen: {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1040,
        colorDepth: 30,
        pixelDepth: 30
      },
      windowMetrics: {
        innerWidth: 1600,
        innerHeight: 900,
        outerWidth: 1680,
        outerHeight: 980,
        devicePixelRatio: 1.25
      },
      performanceSeed: {
        timeOrigin: 1800000000000
      }
    };

    const a = await runProbe('fp-snapshot-a', snapshotA, 'A');
    assert.strictEqual(a.locationHref, 'https://a.example.test:8443/path-a?q=1#ha');
    assert.strictEqual(a.locationOrigin, 'https://a.example.test:8443');
    assert.strictEqual(a.documentURL, a.locationHref);
    assert.strictEqual(a.cookie, 'sid=A1; token=TKA');
    assert.strictEqual(a.navigator.userAgent, 'UA-A/1.0');
    assert.strictEqual(a.navigator.language, 'en-US');
    assert.deepStrictEqual(a.navigator.languages, ['en-US', 'en']);
    assert.strictEqual(a.navigator.platform, 'Linux x86_64');
    assert.strictEqual(a.navigator.vendor, 'VendorA');
    assert.strictEqual(a.navigator.webdriver, false);
    assert.strictEqual(a.navigator.hardwareConcurrency, 16);
    assert.strictEqual(a.navigator.maxTouchPoints, 2);
    assert.strictEqual(a.navigator.pdfViewerEnabled, true);
    assert.strictEqual(a.navigator.pluginsTag, '[object PluginArray]');
    assert.strictEqual(a.navigator.pluginsLength, 1);
    assert.strictEqual(a.navigator.plugin0Tag, '[object Plugin]');
    assert.strictEqual(a.navigator.plugin0Name, 'Chrome PDF Viewer');
    assert.strictEqual(a.navigator.pluginByNameName, 'Chrome PDF Viewer');
    assert.strictEqual(a.navigator.plugin0Mime0Tag, '[object MimeType]');
    assert.strictEqual(a.navigator.plugin0Mime0Type, 'application/pdf');
    assert.strictEqual(a.navigator.mimeTypesTag, '[object MimeTypeArray]');
    assert.strictEqual(a.navigator.mimeTypesLength, 1);
    assert.strictEqual(a.navigator.mimeType0Tag, '[object MimeType]');
    assert.strictEqual(a.navigator.mimeType0, 'application/pdf');
    assert.strictEqual(a.navigator.mimeTypeByName, 'application/pdf');
    assert.strictEqual(a.navigator.permissionsType, 'object');
    assert.strictEqual(a.navigator.permissionsQueryType, 'function');
    assert.strictEqual(a.navigator.permissionsQueryThenable, true);
    if (a.navigator.permissionStatusFactoryTag) {
      assert.strictEqual(a.navigator.permissionStatusFactoryTag, '[object PermissionStatus]');
      assert.strictEqual(a.navigator.permissionStatusFactoryName, 'geolocation');
      assert.strictEqual(a.navigator.permissionStatusFactoryState, 'prompt');
    }
    assert.strictEqual(a.screen.width, 1440);
    assert.strictEqual(a.windowMetrics.innerWidth, 1200);
    assert.strictEqual(a.windowMetrics.devicePixelRatio, 2);
    assert.strictEqual(a.performance.timeOrigin, 1700000000000);
    assert.strictEqual(a.performance.nowType, 'number');
    assert.strictEqual(a.history.length, 2);
    assert.strictEqual(a.history.stateMarker, 'A');
    assert.strictEqual(a.storage.localLength, 1);
    assert.strictEqual(a.storage.localK, 'A');
    assert.strictEqual(a.storage.sessionLength, 1);
    assert.strictEqual(a.storage.sessionK, 'A');

    const b = await runProbe('fp-snapshot-b', snapshotB, 'B');
    assert.strictEqual(b.locationHref, 'https://b.example.test/path-b?z=9#hb');
    assert.strictEqual(b.locationOrigin, 'https://b.example.test');
    assert.strictEqual(b.documentURL, b.locationHref);
    assert.strictEqual(b.cookie, 'sid=B2');
    assert.strictEqual(b.navigator.userAgent, 'UA-B/2.0');
    assert.strictEqual(b.navigator.language, 'zh-CN');
    assert.deepStrictEqual(b.navigator.languages, ['zh-CN', 'zh']);
    assert.strictEqual(b.navigator.vendor, 'VendorB');
    assert.strictEqual(b.navigator.webdriver, true);
    assert.strictEqual(b.navigator.hardwareConcurrency, 4);
    assert.strictEqual(b.navigator.pdfViewerEnabled, false);
    assert.strictEqual(b.navigator.pluginsTag, '[object PluginArray]');
    assert.strictEqual(b.navigator.pluginsLength, 0);
    assert.strictEqual(b.navigator.mimeTypesTag, '[object MimeTypeArray]');
    assert.strictEqual(b.navigator.mimeTypesLength, 0);
    assert.strictEqual(b.navigator.permissionsType, 'object');
    assert.strictEqual(b.navigator.permissionsQueryType, 'function');
    assert.strictEqual(b.navigator.permissionsQueryThenable, true);
    if (b.navigator.permissionStatusFactoryTag) {
      assert.strictEqual(b.navigator.permissionStatusFactoryTag, '[object PermissionStatus]');
    }
    assert.strictEqual(b.screen.width, 1920);
    assert.strictEqual(b.screen.colorDepth, 30);
    assert.strictEqual(b.windowMetrics.innerWidth, 1600);
    assert.strictEqual(b.windowMetrics.devicePixelRatio, 1.25);
    assert.strictEqual(b.performance.timeOrigin, 1800000000000);
    assert.strictEqual(b.history.length, 2);
    assert.strictEqual(b.history.stateMarker, 'B');
    assert.strictEqual(b.storage.localK, 'B');
    assert.strictEqual(b.storage.sessionK, 'B');

    const d = await runDefaultProbe('fp-snapshot-default');
    assert.strictEqual(d.locationHref, 'about:blank');
    assert.strictEqual(d.locationOrigin, 'null');
    assert.strictEqual(d.documentURL, 'about:blank');
    assert.strictEqual(d.cookie, '');
    assert.strictEqual(d.historyLength, 1);
    assert.strictEqual(d.historyState, null);
    assert.strictEqual(d.localLength, 0);
    assert.strictEqual(d.sessionLength, 0);
    assert.ok(d.navigatorUA.length > 0);
    assert.ok(d.navigatorPluginsLength >= 0);
    assert.ok(d.navigatorMimeTypesLength >= 0);
    assert.strictEqual(typeof d.navigatorPdfViewerEnabled, 'boolean');
    assert.strictEqual(d.navigatorPermissionsType, 'object');
    assert.strictEqual(d.screenWidth, 1920);
    assert.strictEqual(d.innerWidth, 1920);

  console.log('[fingerprint-snapshot] PASS');
}

main().catch((err) => {
  console.error('[fingerprint-snapshot] FAIL');
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
