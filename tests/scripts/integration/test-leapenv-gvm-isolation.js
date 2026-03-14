const { Worker, isMainThread, threadId, parentPort } = require('worker_threads');
const path = require('path');
const fs = require('fs');

const logFile = require('path').join(__dirname, 'test-leapenv-gvm-isolation.log');

function log(s) {
  const msg = `[${Date.now()}] [${isMainThread ? 'Main' : 'W' + threadId}] ${s}\n`;
  fs.appendFileSync(logFile, msg);
}

if (isMainThread) {
  fs.writeFileSync(logFile, '=== g_vm 隔离性验证测试 ===\n\n');
  log('启动 2 个 worker 测试隔离性...');

  const results = [];
  let worker2Started = false;

  const w1 = new Worker(__filename, { env: { WORKER_ROLE: 'writer' } });
  const w2 = new Worker(__filename, { env: { WORKER_ROLE: 'reader' } });

  w1.on('message', (msg) => {
    log(`收到 W1 消息: ${JSON.stringify(msg)}`);
    results.push({ from: 'w1', ...msg });
    
    if (msg.phase === 'written' && !worker2Started) {
      worker2Started = true;
      log('W1 写入完成，通知 W2 开始读取...');
      w2.postMessage({ type: 'start' });
    }
  });

  w2.on('message', (msg) => {
    log(`收到 W2 消息: ${JSON.stringify(msg)}`);
    results.push({ from: 'w2', ...msg });
    
    if (results.length >= 2) {
      log('\n=== 测试结果 ===');
      log(JSON.stringify(results, null, 2));
      
      const w2Read = results.find(r => r.from === 'w2' && r.phase === 'read');
      const leaked = w2Read && w2Read.probeValue !== undefined && w2Read.probeValue !== 'undefined';
      if (leaked) {
        log('\n❌ 隔离性失败: W2 读到了 W1 写入的值!');
        log(`   W2 读到: ${w2Read.probeValue}`);
      } else {
        log('\n✅ 隔离性通过: W2 没有读到 W1 的值');
      }
      
      process.exit(0);
    }
  });

  setTimeout(() => {
    log('超时，强制退出');
    process.exit(1);
  }, 10000);

} else {
  const role = process.env.WORKER_ROLE;
  log(`Worker ${threadId} 启动，角色: ${role}`);

  const leapvm = require(path.resolve(__dirname, '../../../leap-vm'));

  if (role === 'writer') {
    log('W1: 写入 globalThis.__threadProbe');
    leapvm.runScript("globalThis.__threadProbe = 'from-w1'");
    
    log('W1: 验证写入');
    const result = leapvm.runScript("globalThis.__threadProbe");
    log(`W1: 读回值 = ${result}`);
    
    parentPort.postMessage({ phase: 'written', probeValue: result });

  } else {
    log('W2: 等待启动信号...');
    
    parentPort.on('message', (msg) => {
      if (msg.type === 'start') {
        log('W2: 尝试读取 globalThis.__threadProbe (不应该存在)');
        
        const probeValue = leapvm.runScript("typeof globalThis.__threadProbe === 'undefined' ? undefined : globalThis.__threadProbe");
        log(`W2: 读到值 = ${probeValue}`);
        
        parentPort.postMessage({ phase: 'read', probeValue });
        
        log('W2: shutdown');
        leapvm.shutdown();
      }
    });
  }
}
