var hpack = require('../lib/hpack');

var h = hpack.Huffman;
var buf = new Buffer('test string');
var a = h.encode(buf);
console.log(a);
console.log(h.decode(a).toString());


