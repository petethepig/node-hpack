// Reference:
// http://tools.ietf.org/id/draft-ietf-httpbis-http2-12.txt
// http://tools.ietf.org/id/draft-ietf-httpbis-header-compression-07.txt

var buffertools = require('buffertools');
var EventEmitter = require('events').EventEmitter;
var Transform = require('stream').Transform;
var inherits = require('util').inherits;

var SETTINGS_HEADER_TABLE_SIZE = 4096;
var DELIMITER = new Buffer('\0');
var FLAGS = {
  INDEX: {value: 0x80 , mask: 0x7f},             // index                     1xxxxxxx
  LIT_WITH_INDEX: {value: 0x40 , mask: 0x3f},    // literal with indexing     01xxxxxx
  LIT_WITHOUT_INDEX: {value: 0x00 , mask: 0x0f}, // literal without indexing  0000xxxx
  LIT_NEVER_INDEX: {value: 0x10 , mask: 0x0f},   // literal never indexed     0001xxxx
  // Context update:
  EMPTY_SET: {value: 0x30 , mask: 0x0f},         // ref set empty             00110000
  SET_MAX_SIZE: {value: 0x20 , mask: 0x0f},      // set max size              0010xxxx
};


var DEFAULT_INDEX_BLACKLIST = [
  new Buffer('set-cookie'),
  new Buffer('content-length'),
  new Buffer('location'),
  new Buffer('etag'),
  new Buffer(':path'),
];

var DEFAULT_HUFFMAN_TABLE = [
  '11111111111111111110111010',  //       (  0)  3ffffba  [26]
  '11111111111111111110111011',  //       (  1)  3ffffbb  [26]
  '11111111111111111110111100',  //       (  2)  3ffffbc  [26]
  '11111111111111111110111101',  //       (  3)  3ffffbd  [26]
  '11111111111111111110111110',  //       (  4)  3ffffbe  [26]
  '11111111111111111110111111',  //       (  5)  3ffffbf  [26]
  '11111111111111111111000000',  //       (  6)  3ffffc0  [26]
  '11111111111111111111000001',  //       (  7)  3ffffc1  [26]
  '11111111111111111111000010',  //       (  8)  3ffffc2  [26]
  '11111111111111111111000011',  //       (  9)  3ffffc3  [26]
  '11111111111111111111000100',  //       ( 10)  3ffffc4  [26]
  '11111111111111111111000101',  //       ( 11)  3ffffc5  [26]
  '11111111111111111111000110',  //       ( 12)  3ffffc6  [26]
  '11111111111111111111000111',  //       ( 13)  3ffffc7  [26]
  '11111111111111111111001000',  //       ( 14)  3ffffc8  [26]
  '11111111111111111111001001',  //       ( 15)  3ffffc9  [26]
  '11111111111111111111001010',  //       ( 16)  3ffffca  [26]
  '11111111111111111111001011',  //       ( 17)  3ffffcb  [26]
  '11111111111111111111001100',  //       ( 18)  3ffffcc  [26]
  '11111111111111111111001101',  //       ( 19)  3ffffcd  [26]
  '11111111111111111111001110',  //       ( 20)  3ffffce  [26]
  '11111111111111111111001111',  //       ( 21)  3ffffcf  [26]
  '11111111111111111111010000',  //       ( 22)  3ffffd0  [26]
  '11111111111111111111010001',  //       ( 23)  3ffffd1  [26]
  '11111111111111111111010010',  //       ( 24)  3ffffd2  [26]
  '11111111111111111111010011',  //       ( 25)  3ffffd3  [26]
  '11111111111111111111010100',  //       ( 26)  3ffffd4  [26]
  '11111111111111111111010101',  //       ( 27)  3ffffd5  [26]
  '11111111111111111111010110',  //       ( 28)  3ffffd6  [26]
  '11111111111111111111010111',  //       ( 29)  3ffffd7  [26]
  '11111111111111111111011000',  //       ( 30)  3ffffd8  [26]
  '11111111111111111111011001',  //       ( 31)  3ffffd9  [26]
  '00110',                       //   ' ' ( 32)        6  [ 5]
  '1111111111100',               //   '!' ( 33)     1ffc  [13]
  '111110000',                   //   '"' ( 34)      1f0  [ 9]
  '11111111111100',              //   '#' ( 35)     3ffc  [14]
  '111111111111100',             //   '$' ( 36)     7ffc  [15]
  '011110',                      //   '%' ( 37)       1e  [ 6]
  '1100100',                     //   '&' ( 38)       64  [ 7]
  '1111111111101',               //   ''' ( 39)     1ffd  [13]
  '1111111010',                  //   '(' ( 40)      3fa  [10]
  '111110001',                   //   ')' ( 41)      1f1  [ 9]
  '1111111011',                  //   '*' ( 42)      3fb  [10]
  '1111111100',                  //   '+' ( 43)      3fc  [10]
  '1100101',                     //   ',' ( 44)       65  [ 7]
  '1100110',                     //   '-' ( 45)       66  [ 7]
  '011111',                      //   '.' ( 46)       1f  [ 6]
  '00111',                       //   '/' ( 47)        7  [ 5]
  '0000',                        //   '0' ( 48)        0  [ 4]
  '0001',                        //   '1' ( 49)        1  [ 4]
  '0010',                        //   '2' ( 50)        2  [ 4]
  '01000',                       //   '3' ( 51)        8  [ 5]
  '100000',                      //   '4' ( 52)       20  [ 6]
  '100001',                      //   '5' ( 53)       21  [ 6]
  '100010',                      //   '6' ( 54)       22  [ 6]
  '100011',                      //   '7' ( 55)       23  [ 6]
  '100100',                      //   '8' ( 56)       24  [ 6]
  '100101',                      //   '9' ( 57)       25  [ 6]
  '100110',                      //   ':' ( 58)       26  [ 6]
  '11101100',                    //   ';' ( 59)       ec  [ 8]
  '11111111111111100',           //   '<' ( 60)    1fffc  [17]
  '100111',                      //   '=' ( 61)       27  [ 6]
  '111111111111101',             //   '>' ( 62)     7ffd  [15]
  '1111111101',                  //   '?' ( 63)      3fd  [10]
  '111111111111110',             //   '@' ( 64)     7ffe  [15]
  '1100111',                     //   'A' ( 65)       67  [ 7]
  '11101101',                    //   'B' ( 66)       ed  [ 8]
  '11101110',                    //   'C' ( 67)       ee  [ 8]
  '1101000',                     //   'D' ( 68)       68  [ 7]
  '11101111',                    //   'E' ( 69)       ef  [ 8]
  '1101001',                     //   'F' ( 70)       69  [ 7]
  '1101010',                     //   'G' ( 71)       6a  [ 7]
  '111110010',                   //   'H' ( 72)      1f2  [ 9]
  '11110000',                    //   'I' ( 73)       f0  [ 8]
  '111110011',                   //   'J' ( 74)      1f3  [ 9]
  '111110100',                   //   'K' ( 75)      1f4  [ 9]
  '111110101',                   //   'L' ( 76)      1f5  [ 9]
  '1101011',                     //   'M' ( 77)       6b  [ 7]
  '1101100',                     //   'N' ( 78)       6c  [ 7]
  '11110001',                    //   'O' ( 79)       f1  [ 8]
  '11110010',                    //   'P' ( 80)       f2  [ 8]
  '111110110',                   //   'Q' ( 81)      1f6  [ 9]
  '111110111',                   //   'R' ( 82)      1f7  [ 9]
  '1101101',                     //   'S' ( 83)       6d  [ 7]
  '101000',                      //   'T' ( 84)       28  [ 6]
  '11110011',                    //   'U' ( 85)       f3  [ 8]
  '111111000',                   //   'V' ( 86)      1f8  [ 9]
  '111111001',                   //   'W' ( 87)      1f9  [ 9]
  '11110100',                    //   'X' ( 88)       f4  [ 8]
  '111111010',                   //   'Y' ( 89)      1fa  [ 9]
  '111111011',                   //   'Z' ( 90)      1fb  [ 9]
  '11111111100',                 //   '[' ( 91)      7fc  [11]
  '11111111111111111111011010',  //   '\' ( 92)  3ffffda  [26]
  '11111111101',                 //   ']' ( 93)      7fd  [11]
  '11111111111101',              //   '^' ( 94)     3ffd  [14]
  '1101110',                     //   '_' ( 95)       6e  [ 7]
  '111111111111111110',          //   '`' ( 96)    3fffe  [18]
  '01001',                       //   'a' ( 97)        9  [ 5]
  '1101111',                     //   'b' ( 98)       6f  [ 7]
  '01010',                       //   'c' ( 99)        a  [ 5]
  '101001',                      //   'd' (100)       29  [ 6]
  '01011',                       //   'e' (101)        b  [ 5]
  '1110000',                     //   'f' (102)       70  [ 7]
  '101010',                      //   'g' (103)       2a  [ 6]
  '101011',                      //   'h' (104)       2b  [ 6]
  '01100',                       //   'i' (105)        c  [ 5]
  '11110101',                    //   'j' (106)       f5  [ 8]
  '11110110',                    //   'k' (107)       f6  [ 8]
  '101100',                      //   'l' (108)       2c  [ 6]
  '101101',                      //   'm' (109)       2d  [ 6]
  '101110',                      //   'n' (110)       2e  [ 6]
  '01101',                       //   'o' (111)        d  [ 5]
  '101111',                      //   'p' (112)       2f  [ 6]
  '111111100',                   //   'q' (113)      1fc  [ 9]
  '110000',                      //   'r' (114)       30  [ 6]
  '110001',                      //   's' (115)       31  [ 6]
  '01110',                       //   't' (116)        e  [ 5]
  '1110001',                     //   'u' (117)       71  [ 7]
  '1110010',                     //   'v' (118)       72  [ 7]
  '1110011',                     //   'w' (119)       73  [ 7]
  '1110100',                     //   'x' (120)       74  [ 7]
  '1110101',                     //   'y' (121)       75  [ 7]
  '11110111',                    //   'z' (122)       f7  [ 8]
  '11111111111111101',           //   '{' (123)    1fffd  [17]
  '111111111100',                //   '|' (124)      ffc  [12]
  '11111111111111110',           //   '}' (125)    1fffe  [17]
  '111111111101',                //   '~' (126)      ffd  [12]
  '11111111111111111111011011',  //       (127)  3ffffdb  [26]
  '11111111111111111111011100',  //       (128)  3ffffdc  [26]
  '11111111111111111111011101',  //       (129)  3ffffdd  [26]
  '11111111111111111111011110',  //       (130)  3ffffde  [26]
  '11111111111111111111011111',  //       (131)  3ffffdf  [26]
  '11111111111111111111100000',  //       (132)  3ffffe0  [26]
  '11111111111111111111100001',  //       (133)  3ffffe1  [26]
  '11111111111111111111100010',  //       (134)  3ffffe2  [26]
  '11111111111111111111100011',  //       (135)  3ffffe3  [26]
  '11111111111111111111100100',  //       (136)  3ffffe4  [26]
  '11111111111111111111100101',  //       (137)  3ffffe5  [26]
  '11111111111111111111100110',  //       (138)  3ffffe6  [26]
  '11111111111111111111100111',  //       (139)  3ffffe7  [26]
  '11111111111111111111101000',  //       (140)  3ffffe8  [26]
  '11111111111111111111101001',  //       (141)  3ffffe9  [26]
  '11111111111111111111101010',  //       (142)  3ffffea  [26]
  '11111111111111111111101011',  //       (143)  3ffffeb  [26]
  '11111111111111111111101100',  //       (144)  3ffffec  [26]
  '11111111111111111111101101',  //       (145)  3ffffed  [26]
  '11111111111111111111101110',  //       (146)  3ffffee  [26]
  '11111111111111111111101111',  //       (147)  3ffffef  [26]
  '11111111111111111111110000',  //       (148)  3fffff0  [26]
  '11111111111111111111110001',  //       (149)  3fffff1  [26]
  '11111111111111111111110010',  //       (150)  3fffff2  [26]
  '11111111111111111111110011',  //       (151)  3fffff3  [26]
  '11111111111111111111110100',  //       (152)  3fffff4  [26]
  '11111111111111111111110101',  //       (153)  3fffff5  [26]
  '11111111111111111111110110',  //       (154)  3fffff6  [26]
  '11111111111111111111110111',  //       (155)  3fffff7  [26]
  '11111111111111111111111000',  //       (156)  3fffff8  [26]
  '11111111111111111111111001',  //       (157)  3fffff9  [26]
  '11111111111111111111111010',  //       (158)  3fffffa  [26]
  '11111111111111111111111011',  //       (159)  3fffffb  [26]
  '11111111111111111111111100',  //       (160)  3fffffc  [26]
  '11111111111111111111111101',  //       (161)  3fffffd  [26]
  '11111111111111111111111110',  //       (162)  3fffffe  [26]
  '11111111111111111111111111',  //       (163)  3ffffff  [26]
  '1111111111111111110000000',   //       (164)  1ffff80  [25]
  '1111111111111111110000001',   //       (165)  1ffff81  [25]
  '1111111111111111110000010',   //       (166)  1ffff82  [25]
  '1111111111111111110000011',   //       (167)  1ffff83  [25]
  '1111111111111111110000100',   //       (168)  1ffff84  [25]
  '1111111111111111110000101',   //       (169)  1ffff85  [25]
  '1111111111111111110000110',   //       (170)  1ffff86  [25]
  '1111111111111111110000111',   //       (171)  1ffff87  [25]
  '1111111111111111110001000',   //       (172)  1ffff88  [25]
  '1111111111111111110001001',   //       (173)  1ffff89  [25]
  '1111111111111111110001010',   //       (174)  1ffff8a  [25]
  '1111111111111111110001011',   //       (175)  1ffff8b  [25]
  '1111111111111111110001100',   //       (176)  1ffff8c  [25]
  '1111111111111111110001101',   //       (177)  1ffff8d  [25]
  '1111111111111111110001110',   //       (178)  1ffff8e  [25]
  '1111111111111111110001111',   //       (179)  1ffff8f  [25]
  '1111111111111111110010000',   //       (180)  1ffff90  [25]
  '1111111111111111110010001',   //       (181)  1ffff91  [25]
  '1111111111111111110010010',   //       (182)  1ffff92  [25]
  '1111111111111111110010011',   //       (183)  1ffff93  [25]
  '1111111111111111110010100',   //       (184)  1ffff94  [25]
  '1111111111111111110010101',   //       (185)  1ffff95  [25]
  '1111111111111111110010110',   //       (186)  1ffff96  [25]
  '1111111111111111110010111',   //       (187)  1ffff97  [25]
  '1111111111111111110011000',   //       (188)  1ffff98  [25]
  '1111111111111111110011001',   //       (189)  1ffff99  [25]
  '1111111111111111110011010',   //       (190)  1ffff9a  [25]
  '1111111111111111110011011',   //       (191)  1ffff9b  [25]
  '1111111111111111110011100',   //       (192)  1ffff9c  [25]
  '1111111111111111110011101',   //       (193)  1ffff9d  [25]
  '1111111111111111110011110',   //       (194)  1ffff9e  [25]
  '1111111111111111110011111',   //       (195)  1ffff9f  [25]
  '1111111111111111110100000',   //       (196)  1ffffa0  [25]
  '1111111111111111110100001',   //       (197)  1ffffa1  [25]
  '1111111111111111110100010',   //       (198)  1ffffa2  [25]
  '1111111111111111110100011',   //       (199)  1ffffa3  [25]
  '1111111111111111110100100',   //       (200)  1ffffa4  [25]
  '1111111111111111110100101',   //       (201)  1ffffa5  [25]
  '1111111111111111110100110',   //       (202)  1ffffa6  [25]
  '1111111111111111110100111',   //       (203)  1ffffa7  [25]
  '1111111111111111110101000',   //       (204)  1ffffa8  [25]
  '1111111111111111110101001',   //       (205)  1ffffa9  [25]
  '1111111111111111110101010',   //       (206)  1ffffaa  [25]
  '1111111111111111110101011',   //       (207)  1ffffab  [25]
  '1111111111111111110101100',   //       (208)  1ffffac  [25]
  '1111111111111111110101101',   //       (209)  1ffffad  [25]
  '1111111111111111110101110',   //       (210)  1ffffae  [25]
  '1111111111111111110101111',   //       (211)  1ffffaf  [25]
  '1111111111111111110110000',   //       (212)  1ffffb0  [25]
  '1111111111111111110110001',   //       (213)  1ffffb1  [25]
  '1111111111111111110110010',   //       (214)  1ffffb2  [25]
  '1111111111111111110110011',   //       (215)  1ffffb3  [25]
  '1111111111111111110110100',   //       (216)  1ffffb4  [25]
  '1111111111111111110110101',   //       (217)  1ffffb5  [25]
  '1111111111111111110110110',   //       (218)  1ffffb6  [25]
  '1111111111111111110110111',   //       (219)  1ffffb7  [25]
  '1111111111111111110111000',   //       (220)  1ffffb8  [25]
  '1111111111111111110111001',   //       (221)  1ffffb9  [25]
  '1111111111111111110111010',   //       (222)  1ffffba  [25]
  '1111111111111111110111011',   //       (223)  1ffffbb  [25]
  '1111111111111111110111100',   //       (224)  1ffffbc  [25]
  '1111111111111111110111101',   //       (225)  1ffffbd  [25]
  '1111111111111111110111110',   //       (226)  1ffffbe  [25]
  '1111111111111111110111111',   //       (227)  1ffffbf  [25]
  '1111111111111111111000000',   //       (228)  1ffffc0  [25]
  '1111111111111111111000001',   //       (229)  1ffffc1  [25]
  '1111111111111111111000010',   //       (230)  1ffffc2  [25]
  '1111111111111111111000011',   //       (231)  1ffffc3  [25]
  '1111111111111111111000100',   //       (232)  1ffffc4  [25]
  '1111111111111111111000101',   //       (233)  1ffffc5  [25]
  '1111111111111111111000110',   //       (234)  1ffffc6  [25]
  '1111111111111111111000111',   //       (235)  1ffffc7  [25]
  '1111111111111111111001000',   //       (236)  1ffffc8  [25]
  '1111111111111111111001001',   //       (237)  1ffffc9  [25]
  '1111111111111111111001010',   //       (238)  1ffffca  [25]
  '1111111111111111111001011',   //       (239)  1ffffcb  [25]
  '1111111111111111111001100',   //       (240)  1ffffcc  [25]
  '1111111111111111111001101',   //       (241)  1ffffcd  [25]
  '1111111111111111111001110',   //       (242)  1ffffce  [25]
  '1111111111111111111001111',   //       (243)  1ffffcf  [25]
  '1111111111111111111010000',   //       (244)  1ffffd0  [25]
  '1111111111111111111010001',   //       (245)  1ffffd1  [25]
  '1111111111111111111010010',   //       (246)  1ffffd2  [25]
  '1111111111111111111010011',   //       (247)  1ffffd3  [25]
  '1111111111111111111010100',   //       (248)  1ffffd4  [25]
  '1111111111111111111010101',   //       (249)  1ffffd5  [25]
  '1111111111111111111010110',   //       (250)  1ffffd6  [25]
  '1111111111111111111010111',   //       (251)  1ffffd7  [25]
  '1111111111111111111011000',   //       (252)  1ffffd8  [25]
  '1111111111111111111011001',   //       (253)  1ffffd9  [25]
  '1111111111111111111011010',   //       (254)  1ffffda  [25]
  '1111111111111111111011011',   //       (255)  1ffffdb  [25]
  '1111111111111111111011100',   //   EOS (256)  1ffffdc  [25]
];

var DEFAULT_STATIC_TABLE = [
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

for(var i = 0; i < DEFAULT_STATIC_TABLE.length; i++){
  DEFAULT_STATIC_TABLE[i] = [new Buffer(DEFAULT_STATIC_TABLE[i][0]), new Buffer(DEFAULT_STATIC_TABLE[i][1])];
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
  this.sortedTable = this.table.slice(0);
  this.sortedTable.sort(function(a,b){
    return a[1] > b[1] ? 1 : -1;
  });
}

Huffman.prototype.toBin = function(n, l){
  var str = n.toString(2);
  while(str.length < l){
    str = '0' + str;
  }
  return str;
};

Huffman.prototype.bufferToBin = function(buf){
  var str = '';
  for(var i = 0; i < buf.length; i++){
    str += this.toBin(buf[i], 8) + ' ';
  }
  return str;
};

Huffman.prototype.encode = function(buf){
  if(buf.length === 0){
    return new Buffer(0);
  }
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
    _buf[octetIndex] |= (val << (width - len)) & 0xff;
    bitIndex += len;
  }
  _buf[octetIndex] |= 0xff >> bitIndex;
  return new Buffer(_buf);
};

Huffman.prototype.decode = function(buf){
  if(buf.length === 0){
    return new Buffer(0);
  }
  var _buf = [];
  var octetIndex = 0;
  var bitIndex = 0;

  loop1:while(octetIndex < buf.length){
    var width = 8 - bitIndex % 8;
    var n = buf[octetIndex] & (Math.pow(2, width) - 1);
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
      var i = octetIndex;
      for(var j = 0; j < this.sortedTable.length; j++){
        var arr = this.sortedTable[j];
        var pattern = arr[0];
        var len = arr[1];
        var val = arr[2];

        while(width < len){
          i++;
          if(i >= buf.length){
            break loop1;
          }
          n = n << 8;
          n |= buf[i];
          width += 8;
        }
        var m = (n >>> (width - len));
        if(m == pattern){
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

Huffman = new Huffman();



function HeaderTable(options){
  options = options || {};
  this._table = [];
  this.length = 0;
  this.size = 0;

  this.setMaxSize(options.maxSize);
  this.staticTable = options.staticTable || DEFAULT_STATIC_TABLE;
}

HeaderTable.prototype.lookup = function(field, pairOnly){
  var name = field[0];
  var value = field[1];
  // returns index >  0 if both name and value was found
  //         index <  0 if only name was found
  //         index == 0 if nothing found

  var index = 0;
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

HeaderTable.prototype._sizeOf = function(field){
  return 32 + field[0].length + field[1].length;
};

HeaderTable.prototype.isReferenced = function(index, seqno){
  var field = this._table[index - 1];
  return field && field[2] === seqno;
};

HeaderTable.prototype.ref = function(index, seqno){
  this._table[index - 1][2] = seqno;
};

HeaderTable.prototype.unref = function(index){
  this._table[index - 1][2] = -1;
};

HeaderTable.prototype.unrefAll = function(index){
  for(var i = 0; i < this._table.length; i++){
    this._table[i][2] = -1;
  }
};

HeaderTable.prototype.pop = function(){
  var field = this._table.pop();
  this.size -= this._sizeOf(field);
  this.length -= 1;
  return field;
};

HeaderTable.prototype.add = function(field){
  var size = this._sizeOf(field);
  while(this.size + size > this.maxSize && this.length > 0){
    var p = this.pop();
  }
  if(this.size + size > this.maxSize && this.length === 0){
    return false;
  }else{
    this.size += size;
    this.length++;
    this._table.unshift(field.concat([-1]));
    return true;
  }
};

HeaderTable.prototype.each = function(a){
  return this._table.forEach(a);
};

HeaderTable.prototype.setMaxSize = function(val){
  this.maxSize = Math.min(val || SETTINGS_HEADER_TABLE_SIZE, SETTINGS_HEADER_TABLE_SIZE);
  while(this.size < this.maxSize && this.length > 0){
    this.pop();
  }
};

HeaderTable.prototype.staticTable = DEFAULT_STATIC_TABLE;




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

inherits(Context, EventEmitter);
function Context(options){
  options = options || {};
  this.headerTable = new HeaderTable();
  this.useHuffman = typeof options.huffman === undefined ? false : options.huffman;
  this.encoding = options.encoding || 'utf8';
  this.seqno = 0;
}

// converts strings to buffers + concantenates duplicates
Context.prototype._normalizeHeaders = function(headers){
  headers = headers.slice(0);
  var nameIndex = {};
  var field, name, value, i, j;
  for(i = 0; i < headers.length; i++){
    field = headers[i];
    name = Buffer.isBuffer(field.name) ? field.name : new Buffer(field.name, this.encoding);
    value = Buffer.isBuffer(field.value) ? field.value : new Buffer(field.value, this.encoding);

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

Context.prototype._denormalizeHeaders = function(headers){
  for(var i = 0; i < headers.length; i++){
    field = headers[i];
    name = field[0];
    value = field[1];
    var pos = buffertools.indexOf(value, DELIMITER);
    if(pos >= 0){
      headers.push([name, value.slice(pos + 1)]);
      value = value.slice(0, pos);
    }
    name = name.toString(this.encoding);
    value = value.toString(this.encoding);
    headers[i] = {name: name, value: value};
  }
  return headers;
};

Context.prototype._updateHeaderTable = function(flag, index, field){
  if(flag === FLAGS.INDEX){ // index representation
    if(this.headerTable.isReferenced(index, this.seqno - 1)){
      this.headerTable.unref(index);
    }else{
      if(index > this.headerTable.length){ // this index is from the static table
        if(this.headerTable.add(field)){
          index = 1;
          this.headerTable.ref(index, this.seqno);
        }
      }else{
        this.headerTable.ref(index, this.seqno);
      }
      return field;
    }
  }else if(flag === FLAGS.LIT_WITH_INDEX){
    if(this.headerTable.add(field)){
      index = 1;
      this.headerTable.ref(index, this.seqno);
    }
    return field;
  }else if(flag === FLAGS.EMPTY_SET){
    this.headerTable.unrefAll();
  }else if(flag === FLAGS.SET_MAX_SIZE){
    this.headerTable.setMaxSize(index);
  }
};

Context.prototype._emptySet = function(block){
  var flag = FLAGS.EMPTY_SET;
  this._updateHeaderTable(flag, 0);
  block.encodeInteger(0, flag.mask, flag.value);
};

Context.prototype._setMaxSize = function(block, size){
  var flag = FLAGS.SET_MAX_SIZE;
  this._updateHeaderTable(flag, size);
  block.encodeInteger(size, flag.mask, flag.value);
};

Context.prototype._encodeMessage = function(block, flag, index, field){
  this._updateHeaderTable(flag, index, field);
  block.encodeInteger(index, flag.mask, flag.value);
  if(flag === FLAGS.LIT_WITH_INDEX ||
     flag === FLAGS.LIT_WITHOUT_INDEX ||
     flag === FLAGS.LIT_NEVER_INDEX){
    if(index === 0){
      block.encodeLiteral(field[0], this.useHuffman);
    }
    block.encodeLiteral(field[1], this.useHuffman);
  }
};

Context.prototype.compress = function(headers, options){
  headers = this._normalizeHeaders(headers);
  var block = new HeaderBlockEncoder();
  for(i = 0; i < headers.length; i++){
    var field = headers[i];
    if(!field)continue;
    var index = this.headerTable.lookup(field);
    if(index > 0){
      if(this.headerTable.isReferenced(index, this.seqno - 1)){
        this.headerTable.ref(index, this.seqno, field); // bump the sequence number
      }else{
        this._encodeMessage(block, FLAGS.INDEX, index, field);
      }
    }else{
      // figure our indexing
      var flag;
      if(field.neverIndex){
        flag = FLAGS.LIT_NEVER_INDEX;
      }else if(field.noIndex){
        flag = FLAGS.LIT_WITHOUT_INDEX;
      }else{
        flag = FLAGS.LIT_WITH_INDEX;
      }
      this._encodeMessage(block, flag, -index, field);
    }
  }

  this.headerTable.each(function(field, index){
    if(field[2] === this.seqno - 1){
      this._encodeMessage(block, FLAGS.INDEX, index + 1, field);
    }
  }.bind(this));

  this.seqno++;
  return block.toBuffer();
};

Context.prototype._transform = function(chunk, encoding, callback){
  this.currentBlock = this.currentBlock || new HeaderBlockDecoder(chunk, 0);
  var msg, index, field, name, value, headers = [];

  while(this.currentBlock.offset < chunk.length){
    var octet = chunk[this.currentBlock.offset];
    for(var f in FLAGS){
      flag = FLAGS[f];
      if((octet & (~flag.mask)) === flag.value){
        break;
      }
    }
    index = this.currentBlock.decodeInteger(flag.mask);

    if(flag === FLAGS.INDEX){
      field = this.headerTable.get(index);
    }else if(flag === FLAGS.LIT_WITH_INDEX ||
             flag === FLAGS.LIT_WITHOUT_INDEX ||
             flag === FLAGS.LIT_NEVER_INDEX){
      name = index === 0 ? this.currentBlock.decodeLiteral(chunk) : this.headerTable.get(index)[0];
      value = this.currentBlock.decodeLiteral(chunk);
      field = [name, value];
    }

    field = this._updateHeaderTable(flag, index, field);
    field && this.emit('headers', field);
  }
  callback && callback();
};

Context.prototype._end = function(){
  this.headerTable.each(function(a){
    if(a[2] === this.seqno - 1){
      a[2] = this.seqno; // bump the sequence number
      this.emit('headers', [a[0], a[1]]);
    }
  }.bind(this));
  this.currentBlock = null;
  this.seqno++;
};

Context.prototype.decompress = function(buf){
  var self = this, headers = [];
  function addHeader(header){
    headers = headers.concat(self._denormalizeHeaders([header]));
  }
  this.on('headers', addHeader);
  this._transform(buf);
  this._end();
  this.removeListener('headers', addHeader);
  return headers;
};


Context.prototype.toString = function(){
  var str = '\n\nHeader table:\n\n';

  this.headerTable.each(function(field, i){
    i += 1;
    while(i.length < 3){
      i = ' ' + i;
    }
    str += '[' + i + '] ' + field[0] + ': ' + field[1] + '\n';
  });
  str += '-------\n';
  str += this.headerTable.size + '\n';
  str += '\nReference set:\n\n';
  var i = 0;
  this.headerTable.each(function(field){
    if(field[3]){
      i += 1;
      while(i.length < 3){
        i = ' ' + i;
      }
      str += '[' + i + '] ' + field[0] + ': ' + field[1] + '\n';
    }
  });
  return str;
};


module.exports.Context = Context;
module.exports.Huffman = Huffman;
module.exports.HeaderTable = HeaderTable;
module.exports.HeaderBlockEncoder = HeaderBlockEncoder;
module.exports.HeaderBlockDecoder = HeaderBlockDecoder;
