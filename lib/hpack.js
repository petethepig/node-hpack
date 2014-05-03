// http://tools.ietf.org/id/draft-ietf-httpbis-http2-12.txt
// http://tools.ietf.org/id/draft-ietf-httpbis-header-compression-07.txt

var buffertools = require('buffertools');

var SETTINGS_HEADER_TABLE_SIZE = 4096;
var DELIMITER = new Buffer('\0');

var DEFAULT_INDEX_BLACKLIST = [
  new Buffer('set-cookie'),
  new Buffer('content-length'),
  new Buffer('location'),
  new Buffer('etag'),
  new Buffer(':path'),
];


var FLAGS = {
  INDEX: {value: 0x80 , mask: 0x7f},             // index                     1xxxxxxx
  LIT_WITH_INDEX: {value: 0x40 , mask: 0x3f},    // literal with indexing     01xxxxxx
  LIT_WITHOUT_INDEX: {value: 0x00 , mask: 0x0f}, // literal without indexing  0000xxxx
  LIT_NEVER_INDEX: {value: 0x10 , mask: 0x0f},   // literal never indexed     0001xxxx
  // Context update:
  EMPTY_SET: {value: 0x30 , mask: 0x0f},         // ref set empty             00110000
  SET_MAX_SIZE: {value: 0x20 , mask: 0x0f},      // set max size              0010xxxx
};

var DEFAULT_HUFFMAN_TABLE = [
  '11111111111111111110111010',
  '11111111111111111110111011',
  '11111111111111111110111100',
  '11111111111111111110111101',
  '11111111111111111110111110',
  '11111111111111111110111111',
  '11111111111111111111000000',
  '11111111111111111111000001',
  '11111111111111111111000010',
  '11111111111111111111000011',
  '11111111111111111111000100',
  '11111111111111111111000101',
  '11111111111111111111000110',
  '11111111111111111111000111',
  '11111111111111111111001000',
  '11111111111111111111001001',
  '11111111111111111111001010',
  '11111111111111111111001011',
  '11111111111111111111001100',
  '11111111111111111111001101',
  '11111111111111111111001110',
  '11111111111111111111001111',
  '11111111111111111111010000',
  '11111111111111111111010001',
  '11111111111111111111010010',
  '11111111111111111111010011',
  '11111111111111111111010100',
  '11111111111111111111010101',
  '11111111111111111111010110',
  '11111111111111111111010111',
  '11111111111111111111011000',
  '11111111111111111111011001',
  '00110',
  '1111111111100',
  '111110000',
  '11111111111100',
  '111111111111100',
  '011110',
  '1100100',
  '1111111111101',
  '1111111010',
  '111110001',
  '1111111011',
  '1111111100',
  '1100101',
  '1100110',
  '011111',
  '00111',
  '0000',
  '0001',
  '0010',
  '01000',
  '100000',
  '100001',
  '100010',
  '100011',
  '100100',
  '100101',
  '100110',
  '11101100',
  '11111111111111100',
  '100111',
  '111111111111101',
  '1111111101',
  '111111111111110',
  '1100111',
  '11101101',
  '11101110',
  '1101000',
  '11101111',
  '1101001',
  '1101010',
  '111110010',
  '11110000',
  '111110011',
  '111110100',
  '111110101',
  '1101011',
  '1101100',
  '11110001',
  '11110010',
  '111110110',
  '111110111',
  '1101101',
  '101000',
  '11110011',
  '111111000',
  '111111001',
  '11110100',
  '111111010',
  '111111011',
  '11111111100',
  '11111111111111111111011010',
  '11111111101',
  '11111111111101',
  '1101110',
  '111111111111111110',
  '01001',
  '1101111',
  '01010',
  '101001',
  '01011',
  '1110000',
  '101010',
  '101011',
  '01100',
  '11110101',
  '11110110',
  '101100',
  '101101',
  '101110',
  '01101',
  '101111',
  '111111100',
  '110000',
  '110001',
  '01110',
  '1110001',
  '1110010',
  '1110011',
  '1110100',
  '1110101',
  '11110111',
  '11111111111111101',
  '111111111100',
  '11111111111111110',
  '111111111101',
  '11111111111111111111011011',
  '11111111111111111111011100',
  '11111111111111111111011101',
  '11111111111111111111011110',
  '11111111111111111111011111',
  '11111111111111111111100000',
  '11111111111111111111100001',
  '11111111111111111111100010',
  '11111111111111111111100011',
  '11111111111111111111100100',
  '11111111111111111111100101',
  '11111111111111111111100110',
  '11111111111111111111100111',
  '11111111111111111111101000',
  '11111111111111111111101001',
  '11111111111111111111101010',
  '11111111111111111111101011',
  '11111111111111111111101100',
  '11111111111111111111101101',
  '11111111111111111111101110',
  '11111111111111111111101111',
  '11111111111111111111110000',
  '11111111111111111111110001',
  '11111111111111111111110010',
  '11111111111111111111110011',
  '11111111111111111111110100',
  '11111111111111111111110101',
  '11111111111111111111110110',
  '11111111111111111111110111',
  '11111111111111111111111000',
  '11111111111111111111111001',
  '11111111111111111111111010',
  '11111111111111111111111011',
  '11111111111111111111111100',
  '11111111111111111111111101',
  '11111111111111111111111110',
  '11111111111111111111111111',
  '1111111111111111110000000',
  '1111111111111111110000001',
  '1111111111111111110000010',
  '1111111111111111110000011',
  '1111111111111111110000100',
  '1111111111111111110000101',
  '1111111111111111110000110',
  '1111111111111111110000111',
  '1111111111111111110001000',
  '1111111111111111110001001',
  '1111111111111111110001010',
  '1111111111111111110001011',
  '1111111111111111110001100',
  '1111111111111111110001101',
  '1111111111111111110001110',
  '1111111111111111110001111',
  '1111111111111111110010000',
  '1111111111111111110010001',
  '1111111111111111110010010',
  '1111111111111111110010011',
  '1111111111111111110010100',
  '1111111111111111110010101',
  '1111111111111111110010110',
  '1111111111111111110010111',
  '1111111111111111110011000',
  '1111111111111111110011001',
  '1111111111111111110011010',
  '1111111111111111110011011',
  '1111111111111111110011100',
  '1111111111111111110011101',
  '1111111111111111110011110',
  '1111111111111111110011111',
  '1111111111111111110100000',
  '1111111111111111110100001',
  '1111111111111111110100010',
  '1111111111111111110100011',
  '1111111111111111110100100',
  '1111111111111111110100101',
  '1111111111111111110100110',
  '1111111111111111110100111',
  '1111111111111111110101000',
  '1111111111111111110101001',
  '1111111111111111110101010',
  '1111111111111111110101011',
  '1111111111111111110101100',
  '1111111111111111110101101',
  '1111111111111111110101110',
  '1111111111111111110101111',
  '1111111111111111110110000',
  '1111111111111111110110001',
  '1111111111111111110110010',
  '1111111111111111110110011',
  '1111111111111111110110100',
  '1111111111111111110110101',
  '1111111111111111110110110',
  '1111111111111111110110111',
  '1111111111111111110111000',
  '1111111111111111110111001',
  '1111111111111111110111010',
  '1111111111111111110111011',
  '1111111111111111110111100',
  '1111111111111111110111101',
  '1111111111111111110111110',
  '1111111111111111110111111',
  '1111111111111111111000000',
  '1111111111111111111000001',
  '1111111111111111111000010',
  '1111111111111111111000011',
  '1111111111111111111000100',
  '1111111111111111111000101',
  '1111111111111111111000110',
  '1111111111111111111000111',
  '1111111111111111111001000',
  '1111111111111111111001001',
  '1111111111111111111001010',
  '1111111111111111111001011',
  '1111111111111111111001100',
  '1111111111111111111001101',
  '1111111111111111111001110',
  '1111111111111111111001111',
  '1111111111111111111010000',
  '1111111111111111111010001',
  '1111111111111111111010010',
  '1111111111111111111010011',
  '1111111111111111111010100',
  '1111111111111111111010101',
  '1111111111111111111010110',
  '1111111111111111111010111',
  '1111111111111111111011000',
  '1111111111111111111011001',
  '1111111111111111111011010',
  '1111111111111111111011011',
  '1111111111111111111011100'
];

var STATIC_TABLE = [
  [':authority'                  , ''             ],
  [':method'                     , 'GET'          ],
  [':method'                     , 'POST'         ],
  [':path'                       , '/'            ],
  [':path'                       , '/index.html'  ],
  [':scheme'                     , 'http'         ],
  [':scheme'                     , 'https'        ],
  [':status'                     , '200'          ],
  [':status'                     , '204'          ],
  [':status'                     , '206'          ],
  [':status'                     , '304'          ],
  [':status'                     , '400'          ],
  [':status'                     , '404'          ],
  [':status'                     , '500'          ],
  ['accept-charset'              , ''             ],
  ['accept-encoding'             , ''             ],
  ['accept-language'             , ''             ],
  ['accept-ranges'               , ''             ],
  ['accept'                      , ''             ],
  ['access-control-allow-origin' , ''             ],
  ['age'                         , ''             ],
  ['allow'                       , ''             ],
  ['authorization'               , ''             ],
  ['cache-control'               , ''             ],
  ['content-disposition'         , ''             ],
  ['content-encoding'            , ''             ],
  ['content-language'            , ''             ],
  ['content-length'              , ''             ],
  ['content-location'            , ''             ],
  ['content-range'               , ''             ],
  ['content-type'                , ''             ],
  ['cookie'                      , ''             ],
  ['date'                        , ''             ],
  ['etag'                        , ''             ],
  ['expect'                      , ''             ],
  ['expires'                     , ''             ],
  ['from'                        , ''             ],
  ['host'                        , ''             ],
  ['if-match'                    , ''             ],
  ['if-modified-since'           , ''             ],
  ['if-none-match'               , ''             ],
  ['if-range'                    , ''             ],
  ['if-unmodified-since'         , ''             ],
  ['last-modified'               , ''             ],
  ['link'                        , ''             ],
  ['location'                    , ''             ],
  ['max-forwards'                , ''             ],
  ['proxy-authenticate'          , ''             ],
  ['proxy-authorization'         , ''             ],
  ['range'                       , ''             ],
  ['referer'                     , ''             ],
  ['refresh'                     , ''             ],
  ['retry-after'                 , ''             ],
  ['server'                      , ''             ],
  ['set-cookie'                  , ''             ],
  ['strict-transport-security'   , ''             ],
  ['transfer-encoding'           , ''             ],
  ['user-agent'                  , ''             ],
  ['vary'                        , ''             ],
  ['via'                         , ''             ],
  ['www-authenticate'            , ''             ],
];

for(var i = 0; i < STATIC_TABLE.length; i++){
  var arr = STATIC_TABLE[i];
  STATIC_TABLE[i] = [new Buffer(arr[0]), new Buffer(arr[1])];
}

function Huffman(table){
  this.sortedTable = [];
  this.table = table || DEFAULT_HUFFMAN_TABLE;
  this.tree = {};
  for(var i = 0; i < this.table.length; i++){
    var val = this.table[i];
    var pattern = parseInt(val, 2);
    this.table[i] = [pattern, val.length, i];
    this.tree[pattern] = i;
  }
  // console.log(Object.keys(this.tree).length);
  // console.log(this.table.length);
  // console.log(this.tree);
  this.sortedTable = this.table.slice(0);
  this.sortedTable.sort(function(a,b){
    return a[1] > b[1] ? 1 : -1;
  });
}

Huffman.prototype.encode = function(buf){
  var _buf = [0];
  var octetIndex = 0;
  var bitIndex = 0;
  var arr, bal, len, width;
  for(var i = 0; i < buf.length; i++){
    arr = this.table[buf[i]];
    val = arr[0];
    len = arr[1];
    width = (8 - bitIndex);
    while(len > width){
      len -= width;
      _buf[octetIndex] |= (val >> len);
      octetIndex++;
      bitIndex = 0;
      width = 8;
      _buf.push(0);
    }
    _buf[octetIndex] |= (val << (width - len));
    bitIndex += len;
  }
  _buf[octetIndex] |= 0xff >> len;
  return new Buffer(_buf);
};

function toBin(n, l){
  var str = n.toString(2);
  while(str.length < l){
    str = '0' + str;
  }
  return str;
}

Huffman.prototype.decode = function(buf){
  var _buf = [];
  var octetIndex = 0;
  var bitIndex = 0;

  loop1:while(octetIndex < buf.length){
    var width = 8 - bitIndex % 8;
    var n = buf[octetIndex] & (Math.pow(2, width) - 1);
    // console.log('NEW', octetIndex, bitIndex, width, toBin(n, width));
    if(!true){
      for(var len = 4; len < 32; len++){
        var i = octetIndex;
        while(width < len){
          i++;
          if(i >= buf.length){
            break loop1;
          }
          n = n << 8;
          n |= buf[i];
          width += 8;
        }
        var val;
        if(val = this.tree[n >> (width - len)]){
          _buf.push(val);
          bitIndex += len;
          octetIndex = Math.floor(bitIndex / 8);
          break;
        }
      }
    }else{
      for(var j = 0; j < this.sortedTable.length; j++){
        var arr = this.sortedTable[j];
        var pattern = arr[0];
        var len = arr[1];
        var val = arr[2];
        // console.log('---tart', len, n.toString(2), pattern.toString(2));
        // console.log(' --', width, len, octetIndex, toBin(n,width), toBin(pattern, len));
        var i = octetIndex;
        while(width < len){
          i++;
          if(i >= buf.length){
            break loop1;
          }
          n = n << 8;
          n |= buf[i];
          width += 8;
        }
        // console.log('---', width, len, octetIndex, toBin(n,width), toBin(pattern, len));
        if((n >> (width - len)) == pattern){
          _buf.push(val);
          bitIndex += len;
          octetIndex = Math.floor(bitIndex / 8);
          break;
        }
      }
    }
  }
  return new Buffer(_buf);
};

var Huffman = new Huffman();







function ReferenceSet(){
  this._set = [];
}

ReferenceSet.prototype.add = function(pair){
  this._set.push(pair);
};

ReferenceSet.prototype._comparePairs = function(pair1, pair2){
  return buffertools.equals(pair1[0], pair2[0]) && buffertools.equals(pair1[1], pair2[1]);
};

ReferenceSet.prototype.contains = function(pair){
  for(var i = 0; i < this._set.length; i++){
    if(this._comparePairs(pair, this._set[i])){
      return true;
    }
  }
  return false;
};

ReferenceSet.prototype.remove = function(pair){
  for(var i = 0; i < this._set.length; i++){
    if(this._comparePairs(pair, this._set[i])){
      this._set.splice(i, 1);
      return true;
    }
  }
  return false;
};

ReferenceSet.prototype.empty = function(){
  this._set = [];
};

ReferenceSet.prototype.clone = function(){
  var s = new ReferenceSet();
  s._set = this._set.slice(0);
  return s;
};

ReferenceSet.prototype.each = function(a){
  return this._set.forEach(a);
};





// ReferenceSet.prototype.compare = function(headers){
//   // returns:
//   //   a set of new headers
//   //   a set of headers to be removed from reference set

//   var set1 = [];
//   var set2 = [];

//   for(var j = 0; j < this._set.length; j++){
//     this._set[j][2] = false;
//   }

//   var pair1, pair2;

//   loop1: for(var i = 0; i < headers.length; i++){
//     pair1 = headers[i];
//     for(j = 0; j < this._set.length; j++){
//       pair2 = this._set[j];
//       if(this._comparePairs(pair1, pair2)){
//         pair2[2] = true;
//         continue loop1;
//       }
//     }
//     set1.push(pair1); // new header
//   }
//   for(j = 0; j < this._set.length; j++){
//     pair1 = this._set[j];
//     if(!pair1[2]){
//       set2.push(pair1);
//     }
//   }
//   return [set1, set2];
// };

// ReferenceSet.prototype.compare = function(headers){
//   var set1 = headers.slice(0);
//   var set2 = this._set.slice(0);

//   for(var i = 0; i < set1.length; i++){
//     for(var j = 0; j < set2.length; j++){
//       var pair1 = set1[i];
//       var pair2 = set2[i];
//     }
//   }

//   // not implemented

//   return set1, set2;
// };








function HeaderTable(referenceSet, options){
  this.options = options || {};
  this.referenceSet = referenceSet;
  this._table = [];

  this.maxSize = this.options.maxSize || SETTINGS_HEADER_TABLE_SIZE;
  // this._nameIndex = {};
  // this._nameValueIndex = {};
  this.length = 0;
  this.size = 0;
}

HeaderTable.prototype.lookup = function(pair, pairOnly){
  var name = pair[0];
  var value = pair[1];
  // returns index >  0 if found a pair
  //         index <  0 if found a name but not value
  //         index == 0 if nothing found

  var index = 0;
  // if(typeof value === 'undefined'){
  //   index = this._nameIndex[name.toString('base64')];
  // }else{
  //   index = this._nameValueIndex[name.toString('base64') + '-' + value.toString('base64')];
  // }
  var field;
  for(var i = 0; i < this._table.length; i++){
    field = this._table[i];
    if(buffertools.equals(field[0], name)){
      if(buffertools.equals(field[1], value)){
        return i + 1;
      }else if(index === 0){
        index = i + 1;
      }
    }
  }
  for(var j = 0; j < this.staticTable.length; j++){
    field = this.staticTable[j];
    if(buffertools.equals(field[0], name)){
      if(buffertools.equals(field[1], value)){
        return this._table.length + j + 1;
      }else if(index === 0){
        index = this._table.length + j + 1;
      }
    }
  }
  return pairOnly ? 0 : -index;
};

HeaderTable.prototype.get = function(index){
  index -= 1;
  var l = this._table.length;
  return index < l ? this._table[index] : this.staticTable[index - l];
};

HeaderTable.prototype._countSize = function(pair){
  return 32 + pair[0].length + pair[1].length;
};

HeaderTable.prototype.pop = function(){
  var pair = this._table.pop();
  this.size -= this._countSize(pair);
  this.length -= 1;
  return pair;
};

// HeaderTable.prototype.evict = function(index){
//   return this._table.shift();
// };

HeaderTable.prototype.add = function(pair){
  // for(var i in this._nameIndex){
  //   this._nameIndex[i] += 1;
  // }
  // for(i in this._nameValueIndex){
  //   this._nameValueIndex[i] += 1;
  // }
  var size = this._countSize(pair);
  while(this.size + size > this.maxSize && this.length > 0){
    var p = this.pop();
    p && this.referenceSet.remove(p);
  }
  if(this.size + size > this.maxSize && this.length === 0){
    return false;
  }else{
    this.size += size;
    this.length++;
    this._table.unshift(pair);
    return true;
  }

  // this._nameIndex[name.toString('base64')] = index;
  // this._nameValueIndex[name.toString('base64') + '-' + value.toString('base64')] = index;
};

HeaderTable.prototype.each = function(a){
  return this._table.forEach(a);
};

HeaderTable.prototype.staticTable = STATIC_TABLE;




function HeaderBlockEncoder(){
  this._block = [];
}

HeaderBlockEncoder.prototype.encodeInteger = function(integer, mask, flag){
  var buf = [];
  var max = mask; // Math.pow(2, length) - 1;
  if(integer < max){
    buf.push(flag | integer);
  }else{
    buf.push(flag | max);
    integer = integer - max;
    while(integer >= 128){
      buf.push(integer % 128 + 128);
      integer = Math.floor(integer / 128);
    }
    buf.push(integer);
  }

  this._block.push(new Buffer(buf));
};

HeaderBlockEncoder.prototype.encodeLiteral = function(literal, huffman){
  if(huffman){
    literal = Huffman.encode(literal);
  }
  this.encodeInteger(literal.length, 0x7f, huffman ? 0x80 : 0x00);
  this._block.push(literal);
};

HeaderBlockEncoder.prototype.toBuffer = function(){
  var buf = Buffer.concat(this._block);
  return buf;
};


function HeaderBlockDecoder(buffer, offset){
  this.buffer = buffer;
  this.offset = offset || 0;
}

HeaderBlockDecoder.prototype.decodeInteger = function(mask){
  var max = mask; // Math.pow(2, length) - 1;
  var octet = this.buffer[this.offset];
  var integer = octet & max;
  if(integer >= max){
    var M = 0;
    do{
      this.offset++;
      octet = this.buffer[this.offset];
      integer = integer + ((octet & max) << M);
      M += 7;
    }while(octet & 0x80);
  }
  this.offset++;
  return integer;
};

HeaderBlockDecoder.prototype.decodeLiteral = function(){
  var huffman = !!(this.buffer[this.offset] & 0x80); // 1000 0000

  var len = this.decodeInteger(0x7f);

  var literal = this.buffer.slice(this.offset, this.offset + len);
  this.offset += len;

  if(huffman){
    literal = Huffman.decode(literal);
  }

  return literal;
};


function Context(options){
  options = options || {};
  this.referenceSet = new ReferenceSet();
  this.headerTable = new HeaderTable(this.referenceSet);
  this.useHuffman = options.huffman || true;
  this.encoding = options.encoding || 'utf8';
}

Context.prototype._updateState = function(flag, index, pair){
  if(flag === FLAGS.INDEX){ // index representation
    if(this.referenceSet.contains(pair)){
      this.referenceSet.remove(pair);
    }else{
      if(index > this.headerTable.length){ // this index is from the static table
        if(this.headerTable.add(pair)){
          this.referenceSet.add(pair);
        }
      }else{
        this.referenceSet.add(pair);
      }
    }
  }else if(flag === FLAGS.LIT_WITH_INDEX){
    if(this.headerTable.add(pair)){
      this.referenceSet.add(pair);
    }
  }else if(flag === FLAGS.EMPTY_SET){
    this.referenceSet.empty();
  }else if(flag === FLAGS.SET_MAX_SIZE){
    this.maxTableSize = Math.min(SETTINGS_HEADER_TABLE_SIZE, index);
  }
};

Context.prototype._encodeHeaderField = function(block, pair, indexing){
  var index = this.headerTable.lookup(pair);

  if(index > 0){ // index representation
    flag = FLAGS.INDEX;
  }else{
    index = -index;
    if(indexing === 1){
      flag = FLAGS.LIT_WITH_INDEX;
    }else if(indexing === 2){
      flag = FLAGS.LIT_WITHOUT_INDEX;
    }else if(indexing === 3){
      flag = FLAGS.LIT_NEVER_INDEX;
    }
  }

  this._updateState(flag, index, pair);

  block.encodeInteger(index, flag.mask, flag.value);

  if(flag !== FLAGS.INDEX){
    if(index === 0){
      block.encodeLiteral(pair[0], this.useHuffman);
    }
    block.encodeLiteral(pair[1], this.useHuffman);
  }

};

Context.prototype._emptySet = function(block){
  var flag = FLAGS.EMPTY_SET;
  this._updateState(flag, 0);
  block.encodeInteger(0, flag.mask, flag.value);
};

Context.prototype._setMaxSize = function(block, size){
  var flag = FLAGS.SET_MAX_SIZE;
  this._updateState(flag, size);
  block.encodeInteger(size, flag.mask, flag.value);
};


// converts strings to buffers + concantenates duplicates
Context.prototype.normalizeHeaders = function(headers){
  var nameIndex = {};
  var pair, name, value, i, j;
  for(i = 0; i < headers.length; i++){
    pair = headers[i];
    name = pair[0];
    value = pair[1];
    name = Buffer.isBuffer(name) ? name : new Buffer(name, this.encoding);
    value = Buffer.isBuffer(value) ? value : new Buffer(value, this.encoding);

    if(j = nameIndex[name]){
      headers[j][1] = Buffer.concat([headers[j][1], DELIMITER, value]);
      headers[i] = null;
    }else{
      nameIndex[name] = i;
      headers[i] = [name, value];
    }
  }
  return headers;
};

Context.prototype.denormalizeHeaders = function(headers){
  for(var i = 0; i < headers.length; i++){
    pair = headers[i];
    name = pair[0];
    value = pair[1];
    var pos = buffertools.indexOf(value, DELIMITER);
    if(pos >= 0){
      headers.push([name, value.slice(pos + 1)]);
      value = value.slice(0, pos);
    }
    pair[0] = name.toString(this.encoding);
    pair[1] = value.toString(this.encoding);
  }
  return headers;
};

Context.prototype.compress = function(headers){
  var block = new HeaderBlockEncoder();
  var headerSet = this.referenceSet.clone();

  headers = this.normalizeHeaders(headers);

  for(i = 0; i < headers.length; i++){
    pair = headers[i];
    if(pair && !headerSet.remove(pair)){
      this._encodeHeaderField(block, pair, 1);
    }
  }

  headerSet.each(function(pair){
    this._encodeHeaderField(block, pair, 1);
  }.bind(this));

  return block.toBuffer();
};

Context.prototype.decompress = function(chunk){
  var msg, index, pair, name, value;

  var block = new HeaderBlockDecoder(chunk, 0);
  while(block.offset < chunk.length){
    var octet = chunk[block.offset];
    for(var f in FLAGS){
      flag = FLAGS[f];
      if((octet & (~flag.mask)) === flag.value){
        break;
      }
    }
    index = block.decodeInteger(flag.mask);

    if(flag === FLAGS.INDEX){
      pair = this.headerTable.get(index);
    }else if(flag === FLAGS.LIT_WITH_INDEX ||
             flag === FLAGS.LIT_WITHOUT_INDEX ||
             flag === FLAGS.LIT_NEVER_INDEX){
      name = index === 0 ? block.decodeLiteral(chunk) : this.headerTable.get(index)[0];
      value = block.decodeLiteral(chunk);
      pair = [name, value];
    }
    this._updateState(flag, index, pair);
  }

  var headers = [];
  this.referenceSet.each(function(a){
    headers.push([a[0], a[1]]);
  });

  return this.denormalizeHeaders(headers);
};

Context.prototype.toString = function(){
  var str = '\n\nHeader table:\n\n';

  this.headerTable.each(function(pair, i){
    i = '' + (i + 1);
    while(i.length < 3){
      i = ' ' + i;
    }
    str += '[' + i + '] ' + pair[0] + ': ' + pair[1] + '\n';
  });
  str += '-------\n';
  str += this.headerTable.size + '\n';

  str += '\nReference set:\n\n';
  this.referenceSet.each(function(pair, i){
    i = '' + (i+1);
    while(i.length < 3){
      i = ' ' + i;
    }
    str += '[' + i + '] ' + pair[0] + ': ' + pair[1] + '\n';
  });
  return str;
};


module.exports.Context = Context;
module.exports.Huffman = Huffman;
module.exports.HeaderTable = HeaderTable;
module.exports.HeaderBlockEncoder = HeaderBlockEncoder;
module.exports.HeaderBlockDecoder = HeaderBlockDecoder;




