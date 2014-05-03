var hpack = require('../lib/hpack');


var compressor = new hpack.Context();
var decompressor = new hpack.Context();

var headers, buffer;



var i = 1;
function runTest(headers){
  buffer = compressor.compress(headers);
  console.log(i++);
  console.log('>>', buffer);
  console.log('<<', JSON.stringify(decompressor.decompress(buffer)));

  // console.log(compressor.toString());
  // console.log(decompressor.toString());
}

runTest([
  [':method', 'GET'],
  [':scheme', 'http'],
  [':path', '/'],
  [':authority', 'www.example.com'],
]);

runTest([
  [':method', 'GET'],
  [':scheme', 'http'],
  [':path', '/'],
  [':authority', 'www.example.com'],
  ['cache-control', 'no-cache'],
]);

runTest([
  [':method', 'GET'],
  [':scheme', 'http'],
  [':path', '/index.html'],
  [':authority', 'www.example.com'],
  ['cache-control', 'no-cache'],
]);

runTest([
  [':method', 'GET'],
  [':scheme', 'http'],
  [':path', '/index.html'],
  [':authority', 'www.example.com'],
  ['cache-control', 'no-cache'],
]);

runTest([
  [':method', 'POST'],
  [':scheme', 'test'],
  [':path', '/test.html'],
  [':authority', 'www.example.com'],
  ['set-cookie', ''],
]);

runTest([
  [':method', 'POST'],
  [':scheme', 'test'],
  [':path', '/test.html'],
  [':authority', 'www.example.com'],
]);

runTest([
  [':method', 'GET'],
  [':scheme', 'http'],
  [':path', '/test.html'],
  [':authority', 'www.example.com'],
]);
