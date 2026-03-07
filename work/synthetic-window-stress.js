(function () {
  function safeValue(read, fallback) {
    try {
      return read();
    } catch (_) {
      return fallback;
    }
  }

  function stringifyApply(value, replacer, space) {
    return Reflect.apply(JSON.stringify, JSON, arguments);
  }

  function utf8Parse(input) {
    var encoded = encodeURIComponent(String(input == null ? '' : input));
    var out = [];
    for (var i = 0; i < encoded.length; i++) {
      var ch = encoded.charCodeAt(i);
      if (ch === 37 && i + 2 < encoded.length) {
        out.push(parseInt(encoded.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        out.push(ch & 255);
      }
    }
    return out;
  }

  function latin1Parse(input) {
    var str = String(input == null ? '' : input);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      out.push(str.charCodeAt(i) & 255);
    }
    return out;
  }

  function hexStringify(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      var hex = (bytes[i] & 255).toString(16);
      out += hex.length === 1 ? '0' + hex : hex;
    }
    return out;
  }

  function base64Encode(bytes) {
    var map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i] || 0;
      var b = bytes[i + 1] || 0;
      var c = bytes[i + 2] || 0;
      var triplet = (a << 16) | (b << 8) | c;
      out += map[(triplet >> 18) & 63];
      out += map[(triplet >> 12) & 63];
      out += i + 1 < bytes.length ? map[(triplet >> 6) & 63] : '=';
      out += i + 2 < bytes.length ? map[triplet & 63] : '=';
    }
    return out;
  }

  function mixDigest(input) {
    var str = String(input);
    var h1 = 0x811c9dc5;
    var h2 = 0x01000193;
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      h1 ^= code;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= code + ((i & 15) << 8);
      h2 = Math.imul(h2, 0x45d9f3b);
      h1 ^= h2 >>> 13;
      h2 ^= h1 >>> 11;
    }
    return ('00000000' + (h1 >>> 0).toString(16)).slice(-8) +
      ('00000000' + (h2 >>> 0).toString(16)).slice(-8);
  }

  function collectWindowSnapshot(round, seed) {
    var nav = typeof navigator === 'object' && navigator ? navigator : {};
    var doc = typeof document === 'object' && document ? document : {};
    var loc = typeof location === 'object' && location ? location : {};
    return {
      round: round,
      href: safeValue(function () { return String(loc.href || ''); }, ''),
      host: safeValue(function () { return String(loc.host || ''); }, ''),
      ua: safeValue(function () { return String(nav.userAgent || ''); }, ''),
      lang: safeValue(function () { return String(nav.language || ''); }, ''),
      languages: safeValue(function () {
        return Array.isArray(nav.languages) ? nav.languages.slice(0, 8) : [];
      }, []),
      webdriver: safeValue(function () { return !!nav.webdriver; }, false),
      pluginCount: safeValue(function () { return Number(nav.plugins && nav.plugins.length || 0); }, 0),
      cookie: safeValue(function () { return String(doc.cookie || ''); }, ''),
      title: safeValue(function () { return String(doc.title || ''); }, ''),
      bodyChildCount: safeValue(function () {
        return Number(doc.body && doc.body.childNodes && doc.body.childNodes.length || 0);
      }, 0),
      docHtmlLength: safeValue(function () {
        return String(doc.documentElement && doc.documentElement.outerHTML || '').length;
      }, 0),
      seed: String(seed || '').slice(0, 64)
    };
  }

  function buildPayload(round, seed) {
    var snapshot = collectWindowSnapshot(round, seed);
    var matrix = [];
    for (var row = 0; row < 12; row++) {
      var cells = [];
      for (var col = 0; col < 12; col++) {
        cells.push({
          idx: row * 12 + col,
          value: ((row + 1) * (col + 3) + round) ^ seed.length,
          token: seed.slice((row + col) % 8, ((row + col) % 8) + 16)
        });
      }
      matrix.push(cells);
    }
    return {
      meta: snapshot,
      matrix: matrix,
      tags: [
        'window',
        'stress',
        'round-' + round,
        snapshot.host,
        snapshot.lang
      ],
      nested: {
        a: snapshot,
        b: matrix.slice(0, 4),
        c: {
          seedTail: seed.slice(-32),
          checksum: mixDigest(snapshot.ua + ':' + snapshot.host + ':' + round)
        }
      }
    };
  }

  var rounds = 36;
  var seed = 'seed:' + safeValue(function () { return String(Date.now()); }, '0');
  var trace = [];

  for (var round = 0; round < rounds; round++) {
    var payload = buildPayload(round, seed);
    var json = stringifyApply(payload, null, 0);
    var utf8 = utf8Parse(json);
    var base64 = base64Encode(utf8);
    var latin1 = latin1Parse(base64);
    var hex = hexStringify(latin1);
    seed = mixDigest(seed + '|' + base64 + '|' + hex.slice(0, 128));
    trace.push({
      round: round,
      jsonLength: json.length,
      utf8Length: utf8.length,
      base64Length: base64.length,
      hexLength: hex.length,
      digest: seed
    });
  }

  return {
    ok: true,
    script: 'synthetic-window-stress',
    rounds: rounds,
    finalDigest: seed,
    trace: trace.slice(-4)
  };
})();
