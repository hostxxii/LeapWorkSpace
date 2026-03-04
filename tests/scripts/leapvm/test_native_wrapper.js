// test_native_wrapper.js
// 测试 NativeWrapper 功能：包装任意对象并拦截属性访问

const leapvm = require(require('path').join(__dirname, '../../../leap-vm/build/Release/leapvm.node'));

// 1. 配置 Hook - 监控任意对象的访问
leapvm.setHookTargets(
    ['myObject', 'nested'],  // 监控这些标签的对象
    ['GET', 'SET', 'CALL'],  // 监控 GET、SET 和 CALL 操作
    true,  // log_name
    true,  // log_type
    true,  // log_value
    true,  // log_func_params
    true,  // log_call_args
    true   // log_call_return
);

// 2. 配置黑名单 - 过滤高频干扰属性
leapvm.setPropertyBlacklist(
    [],                                    // blocked_objects
    ['then', 'constructor', 'prototype'],  // blocked_properties
    ['Symbol(', '__']                      // blocked_prefixes
);

console.log('\n========================================');
console.log('测试 1: 包装普通对象并访问属性');
console.log('========================================\n');

const script1 = `
// 创建一个普通对象
const originalObj = {
    name: 'Alice',
    age: 30,
    greet: function(greeting) {
        return greeting + ', ' + this.name + '!';
    },
    nested: {
        deep: {
            value: 42
        }
    }
};

// 使用 NativeWrapper 包装这个对象（在 VM 内部通过 $native.wrapObject 调用）
const wrappedObj = $native.wrapObject(originalObj, 'myObject');

// 测试属性访问（应该被 Hook 拦截）
console.log('\\n--- 读取属性 ---');
const name = wrappedObj.name;
const age = wrappedObj.age;

console.log('\\n--- 读取函数 ---');
const greetFn = wrappedObj.greet;

console.log('\\n--- 调用函数 ---');
const result = wrappedObj.greet('Hello');
console.log('Function returned:', result);

console.log('\\n--- 设置属性 ---');
wrappedObj.age = 31;
console.log('New age:', wrappedObj.age);

console.log('\\n--- 访问嵌套对象 ---');
const nested = wrappedObj.nested;
console.log('Nested object:', nested);
`;

leapvm.runScript(script1);

console.log('\n========================================');
console.log('测试 2: 包装嵌套对象');
console.log('========================================\n');

const script2 = `
// 再次包装嵌套对象
const nestedWrapped = $native.wrapObject(wrappedObj.nested, 'nested');

console.log('\\n--- 访问深层嵌套属性 ---');
const deep = nestedWrapped.deep;
console.log('Deep object:', deep);
const value = nestedWrapped.deep.value;
console.log('Deep value:', value);
`;

leapvm.runScript(script2);

console.log('\n========================================');
console.log('测试 3: 包装数组对象');
console.log('========================================\n');

const script3 = `
const arr = [1, 2, 3, 4, 5];
const wrappedArr = $native.wrapObject(arr, 'myArray');

console.log('\\n--- 访问数组元素 ---');
const first = wrappedArr[0];
const second = wrappedArr[1];
console.log('First:', first, 'Second:', second);

console.log('\\n--- 访问数组方法 ---');
const mapFn = wrappedArr.map;

console.log('\\n--- 调用数组方法 ---');
const doubled = wrappedArr.map(x => x * 2);
console.log('Doubled:', doubled);
`;

leapvm.runScript(script3);

console.log('\n========================================');
console.log('测试 4: 黑名单过滤');
console.log('========================================\n');

const script4 = `
const obj = {
    normalProp: 'visible',
    then: 'should be filtered',
    __private: 'should be filtered',
    constructor: 'should be filtered'
};

const wrapped = $native.wrapObject(obj, 'blacklistTest');

console.log('\\n--- 访问正常属性（应显示日志）---');
const normal = wrapped.normalProp;

console.log('\\n--- 访问黑名单属性（不应显示日志）---');
const thenVal = wrapped.then;
const privateVal = wrapped.__private;
const constructorVal = wrapped.constructor;

console.log('Accessed blacklisted properties without logging');
`;

leapvm.runScript(script4);

console.log('\n========================================');
console.log('测试完成！');
console.log('========================================\n');

// 优雅关闭
leapvm.shutdown();
