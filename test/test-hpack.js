var assert = require('assert');
var hpack = require('../lib/hpack');


var compressor = new hpack.Context({huffman: true});
var decompressor = new hpack.Context();

var headers, buffer;

function stringify(headers){
  return JSON.stringify(headers.sort(function(a, b){ return a.name > b.name; }), false, 2);
}

function runTest(headers){
  buffer = compressor.compress(headers);
  var headers2 = decompressor.decompress(buffer);

  // console.log(compressor.seqno);
  console.log('>>', buffer);
  console.log('<<', stringify(headers2));

  // console.log(compressor.toString());
  // console.log(decompressor.toString());

  assert.equal(stringify(headers), stringify(headers2));
}







runTest([
  {name:':method', value:'GET'},
  {name:':scheme', value:'http'},
  {name:':path', value:'/'},
  {name:':authority', value:'www.example.com'},
]);

runTest([
  {name:':method', value:'GET'},
  {name:':scheme', value:'http'},
  {name:':path', value:'/'},
  {name:':authority', value:'www.example.com'},
  {name:'cache-control', value:'no-cache'},
]);

runTest([
  {name:':method', value:'GET'},
  {name:':scheme', value:'http'},
  {name:':path', value:'/index.html'},
  {name:':authority', value:'www.example.com'},
  {name:'cache-control', value:'no-cache'},
]);

runTest([
  {name:':method', value:'GET'},
  {name:':scheme', value:'http'},
  {name:':path', value:'/index.html'},
  {name:':authority', value:'www.example.com'},
  {name:'cache-control', value:'no-cache'},
]);

runTest([
  {name:':method', value:'POST'},
  {name:':scheme', value:'test'},
  {name:':path', value:'/test.html'},
  {name:':authority', value:'www.example.com'},
  {name:'set-cookie', value:''},
]);

runTest([
  {name:':method', value:'POST'},
  {name:':scheme', value:'test'},
  {name:':path', value:'/test.html'},
  {name:':authority', value:'www.example.com'},
  {name:':authority', value:'www.example.com'},
]);

runTest([
  {name:':method', value:'GET'},
  {name:':scheme', value:'http'},
  {name:':path', value:'/test.html'},
  {name:':authority', value:'www.example.com'},
]);

runTest([
  {name:':method', value:'GET'},
  {name:':scheme', value:'http'},
  {name:':path', value:'/test.html'},
  {name:':authority', value:'www.example.com'},
]);
