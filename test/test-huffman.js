var assert = require('assert');
var buffertools = require('buffertools');
var hpack = require('../lib/hpack');

var h = hpack.Huffman;

function testString(str){
  var buf = Buffer.isBuffer(str) ? str : new Buffer(str);
  var encoded = h.encode(buf);
  var decoded = h.decode(encoded).toString();
  assert.equal(str, decoded);
}

function testHex(str, bin){
  var buf = Buffer.isBuffer(str) ? str : new Buffer(str);
  buf = h.encode(buf);
  bin = new Buffer(bin.split(' ').map(function(a){ return parseInt(a, 16); }));
  assert(buffertools.equals(buf, bin), 'fail');
}


testString('');
testString('test');
testString('http');
testString('html');


for(var i = 0; i <= 0xff; i++){
  testString(new Buffer([i]));
}


// taken from the specs:
testHex('www.example.com', 'e7 cf 9b eb e8 9b 6f b1 6f a9 b6 ff');
testHex('no-cache', 'b9 b9 94 95 56 bf');
testHex('custom-key', '57 1c 5c db 73 7b 2f af');
testHex('custom-value', '57 1c 5c db 73 72 4d 9c 57');
testHex('302', '40 17');
testHex('private', 'bf 06 72 4b 97');
testHex('Mon, 21 Oct 2013 20:13:21 GMT', 'd6 db b2 98 84 de 2a 71 88 05 06 20 98 51 31 09 b5 6b a3');
testHex('https://www.example.com', 'ad ce bf 19 8e 7e 7c f9 be be 89 b6 fb 16 fa 9b 6f');
testHex('Mon, 21 Oct 2013 20:13:22 GMT', 'd6 db b2 98 84 de 2a 71 88 05 06 20 98 51 31 11 b5 6b a3');
testHex('gzip', 'ab dd 97 ff');
testHex('foo=ASDJKHQKBZXOQWEOPIUAXQWEOIU; max-age=3600; version=1', 'e0 d6 cf 9f 6e 8f 9f d3 e5 f6 fa 76 fe fd 3c 7e df 9e ff 1f 2f 0f 3c fe 9f 6f cf 7f 8f 87 9f 61 ad 4f 4c c9 a9 73 a2 20 0e c3 72 5e 18 b1 b7 4e 3f');
