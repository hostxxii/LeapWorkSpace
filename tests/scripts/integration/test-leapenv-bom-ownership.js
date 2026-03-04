/**
 * 检查各 BOM 对象的属性归属：原型上 vs 实例上
 */
const { initializeEnvironment, executeSignatureTask, shutdownEnvironment } = require('../../../leap-env/runner');

const SCRIPT = `
(function() {
  function checkOwnership(ctorName, getInstance) {
    var ctor = window[ctorName];
    if (!ctor || !ctor.prototype) {
      console.log('[' + ctorName + '] ctor not found');
      return;
    }

    var protoProps = Object.getOwnPropertyNames(ctor.prototype)
      .filter(function(k) { return k !== 'constructor'; });
    console.log('[' + ctorName + '.prototype]', protoProps.length + ' props:', JSON.stringify(protoProps.slice(0, 8)));

    try {
      var inst = getInstance();
      if (inst && typeof inst === 'object') {
        var instOwn = Object.getOwnPropertyNames(inst);
        console.log('[' + ctorName + ' instance own]', instOwn.length + ' props:', JSON.stringify(instOwn.slice(0, 10)));
      }
    } catch(e) {
      console.log('[' + ctorName + ' instance]', 'error: ' + e.message);
    }
  }

  checkOwnership('Navigator', function() { return window.navigator; });
  checkOwnership('Screen',    function() { return window.screen; });
  checkOwnership('History',   function() { return window.history; });
})();
`;

var ctx = initializeEnvironment({ debug: false });
executeSignatureTask(ctx.leapvm, { targetScript: SCRIPT });
shutdownEnvironment(ctx.leapvm);
