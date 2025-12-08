const hx = (n, w = 4) => '0x' + n.toString(16).toUpperCase().padStart(w, '0');

function mkPkt(size, op, res = 0) {
  const b = Buffer.alloc(size, 0);
  b.writeUInt16LE(size, 0);
  b.writeUInt16LE(op, 2);
  b.writeUInt16LE(res, 4);
  b.writeUInt16LE(0, 6);
  return b;
}

function logPkt(dir, b, note = '', prefix = '') {
  if (b.length >= 8) {
    const size = b.readUInt16LE(0);
    const op = b.readUInt16LE(2);
    const res = b.readUInt16LE(4);
    console.log(`${prefix}${dir} size=${size} op=${hx(op)} res=${hx(res)} ${note}`);
  } else {
    console.log(`${prefix}${dir} size=${b.length} ${note}`);
  }
}

function readWString(buf, offset, maxChars) {
  let s = '';
  for (let i = 0; i < maxChars; i++) {
    const ch = buf.readUInt16LE(offset + i * 2);
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
}

function writeWString(buf, offset, str, maxChars) {
  let i = 0;
  for (; i < str.length && i < maxChars; i++) {
    buf.writeUInt16LE(str.charCodeAt(i), offset + (i * 2));
  }
  if (i < maxChars) {
    buf.writeUInt16LE(0, offset + (i * 2));
  }
}

function calculateJudgment(noteData) {
  let perfectCount = 0;
  let greatCount = 0;
  let goodCount = 0;
  let badCount = 0;
  let totalNotesHit = 0;
  
  for (let i = 0; i < 16; i++) {
    const acc = noteData.readUInt8(i);
    
    if (acc >= 100) {
      perfectCount++;
      totalNotesHit++;
    } else if (acc >= 80) {
      greatCount++;
      totalNotesHit++;
    } else if (acc >= 50) {
      goodCount++;
      totalNotesHit++;
    } else if (acc > 0) {
      badCount++;
      totalNotesHit++;
    }
  }
  
  if (totalNotesHit === 0) return 0;
  if (perfectCount === totalNotesHit && totalNotesHit >= 4) return 100;
  if (perfectCount + greatCount === totalNotesHit && totalNotesHit >= 2) return 80;
  if (badCount <= 2 && totalNotesHit >= 2) return 50;
  if (totalNotesHit >= 2) return 30;
  return 10;
}

function getBoosterMultiplier(gauge) {
  if (gauge < 100) return 1;
  if (gauge < 200) return 2;
  if (gauge < 300) return 3;
  if (gauge < 400) return 4;
  if (gauge < 500) return 5;
  if (gauge < 600) return 6;
  if (gauge < 700) return 7;
  return 8;
}

function getMaxBoosterMultiplier(keyMode) {
  return keyMode === 0 ? 4 : 8;
}

function getMaxBoosterGauge(keyMode) {
  return keyMode === 0 ? 300 : 700;
}

module.exports = {
  hx,
  mkPkt,
  logPkt,
  readWString,
  writeWString,
  calculateJudgment,
  getBoosterMultiplier,
  getMaxBoosterMultiplier,
  getMaxBoosterGauge
};