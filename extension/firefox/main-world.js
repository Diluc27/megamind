(function() {
  var OrigES = window.EventSource;
  var _seenTypes = {};
  var _matchRe = /(message_limit|remaining|usage|percent|capacity)/i;

  window.EventSource = function() {
    var es = new OrigES(arguments[0], arguments[1]);
    var origAdd = es.addEventListener.bind(es);
    var _url = arguments[0];

    // Extract org UUID from SSE URL
    var uuidMatch = _url.match(/\/api\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch) {
      window.postMessage({ type: 'MEGAMIND_ORG_FROM_SSE', orgId: uuidMatch[1] }, '*');
    }

    es.addEventListener = function(type, handler, opts) {
      var wrapped = function(e) {
        if (!_seenTypes[type]) {
          _seenTypes[type] = true;
          console.log('[MegaMind-SSE] Event type: "' + type + '" url: ' + _url);
        }
        if (_matchRe.test(e.data || '')) {
          try {
            var parsed = JSON.parse(e.data);
            console.log('[MegaMind-SSE] "' + type + '" data:', parsed);
            window.postMessage({ type: 'MEGAMIND_SSE_EVENT', eventType: type, data: parsed }, '*');
          } catch(_) {
            console.log('[MegaMind-SSE] "' + type + '" raw:', (e.data || '').substring(0, 500));
          }
        }
        return handler.call(this, e);
      };
      return origAdd(type, wrapped, opts);
    };

    // Intercept onmessage setter (for page code using es.onmessage = fn)
    var _onmessage = null;
    Object.defineProperty(es, 'onmessage', {
      get: function() { return _onmessage; },
      set: function(fn) {
        _onmessage = fn;
        if (fn) {
          origAdd('message', fn);
        }
      },
      configurable: true,
      enumerable: true,
    });

    return es;
  };
  window.EventSource.prototype = OrigES.prototype;
})();
