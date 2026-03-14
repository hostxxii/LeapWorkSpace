(function (global) {
  var leapenv = global.leapenv || (global.leapenv = {});

  function utf8Bytes(input) {
    var str = String(input == null ? '' : input);
    if (typeof global.TextEncoder === 'function') {
      try {
        var encoded = new global.TextEncoder().encode(str);
        return Array.prototype.slice.call(encoded);
      } catch (_) {}
    }
    var escaped = unescape(encodeURIComponent(str));
    var out = new Array(escaped.length);
    for (var i = 0; i < escaped.length; i++) {
      out[i] = escaped.charCodeAt(i) & 0xff;
    }
    return out;
  }

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  var SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function toHex32(x) {
    var hex = (x >>> 0).toString(16);
    while (hex.length < 8) hex = '0' + hex;
    return hex;
  }

  function sha256Hex(input) {
    var bytes = utf8Bytes(input);
    var bitLenHi = Math.floor((bytes.length * 8) / 0x100000000) >>> 0;
    var bitLenLo = (bytes.length * 8) >>> 0;

    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) {
      bytes.push(0);
    }

    bytes.push((bitLenHi >>> 24) & 0xff);
    bytes.push((bitLenHi >>> 16) & 0xff);
    bytes.push((bitLenHi >>> 8) & 0xff);
    bytes.push(bitLenHi & 0xff);
    bytes.push((bitLenLo >>> 24) & 0xff);
    bytes.push((bitLenLo >>> 16) & 0xff);
    bytes.push((bitLenLo >>> 8) & 0xff);
    bytes.push(bitLenLo & 0xff);

    var h0 = 0x6a09e667;
    var h1 = 0xbb67ae85;
    var h2 = 0x3c6ef372;
    var h3 = 0xa54ff53a;
    var h4 = 0x510e527f;
    var h5 = 0x9b05688c;
    var h6 = 0x1f83d9ab;
    var h7 = 0x5be0cd19;
    var w = new Array(64);

    for (var offset = 0; offset < bytes.length; offset += 64) {
      var i;
      for (i = 0; i < 16; i++) {
        var j = offset + (i * 4);
        w[i] = (
          ((bytes[j] & 0xff) << 24) |
          ((bytes[j + 1] & 0xff) << 16) |
          ((bytes[j + 2] & 0xff) << 8) |
          (bytes[j + 3] & 0xff)
        ) >>> 0;
      }
      for (i = 16; i < 64; i++) {
        var s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
        var s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }

      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

      for (i = 0; i < 64; i++) {
        var S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        var ch = ((e & f) ^ (~e & g)) >>> 0;
        var t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
        var S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        var maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        var t2 = (S0 + maj) >>> 0;

        h = g;
        g = f;
        f = e;
        e = (d + t1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (t1 + t2) >>> 0;
      }

      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
      h5 = (h5 + f) >>> 0;
      h6 = (h6 + g) >>> 0;
      h7 = (h7 + h) >>> 0;
    }

    return (
      toHex32(h0) + toHex32(h1) + toHex32(h2) + toHex32(h3) +
      toHex32(h4) + toHex32(h5) + toHex32(h6) + toHex32(h7)
    );
  }

  function parseHexWords(hex) {
    var words = [];
    for (var i = 0; i < hex.length; i += 8) {
      words.push(parseInt(hex.slice(i, i + 8), 16) >>> 0);
    }
    return words;
  }

  function createWordArray(hex) {
    return {
      _hex: hex,
      words: parseHexWords(hex),
      sigBytes: (hex.length / 2) >>> 0,
      toString: function (encoder) {
        if (encoder && typeof encoder.stringify === 'function') {
          try { return encoder.stringify(this); } catch (_) {}
        }
        return this._hex;
      },
      toJSON: function () {
        return this._hex;
      },
      valueOf: function () {
        return this._hex;
      }
    };
  }

  function createCryptoJSNamespace() {
    var ns = {};
    ns.enc = {
      Hex: {
        stringify: function (wordArray) {
          if (wordArray && typeof wordArray._hex === 'string') return wordArray._hex;
          if (wordArray && typeof wordArray.toString === 'function') return wordArray.toString();
          return String(wordArray == null ? '' : wordArray);
        }
      },
      Utf8: {
        stringify: function (wordArray) {
          if (wordArray && typeof wordArray._hex === 'string') {
            var hex = wordArray._hex;
            var str = '';
            for (var i = 0; i < hex.length; i += 2) {
              str += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
            }
            try {
              return decodeURIComponent(escape(str));
            } catch (_) {
              return str;
            }
          }
          return String(wordArray == null ? '' : wordArray);
        },
        parse: function (str) {
          var bytes = utf8Bytes(str);
          var hex = '';
          for (var i = 0; i < bytes.length; i++) {
            var v = (bytes[i] & 0xff).toString(16);
            if (v.length < 2) v = '0' + v;
            hex += v;
          }
          return createWordArray(hex);
        }
      }
    };
    ns.SHA256 = function SHA256(message) {
      return createWordArray(sha256Hex(message));
    };
    return ns;
  }

  var cryptoJS = createCryptoJSNamespace();

  try {
    if (typeof global.SHA256 !== 'function') {
      global.SHA256 = function SHA256Compat(message) {
        return cryptoJS.SHA256(message).toString();
      };
    }
  } catch (_) {}

})(globalThis);
