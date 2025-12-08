const { mkPkt, writeWString } = require('./helpers');

const OP = {
  HANDSHAKE:          0x0064,
  ENCRYPT_INIT:       0x0424,
  ENCRYPTED:          0x042E,
  LOGIN:              0x044C,
  LOGIN_RESP:         0x03E8,
  PRIVATE_INFO:       0x03F2,
  CHAR_CHECK:         0x0406,
  SERVER_LIST:        0x0410,
  SERVER_REDIRECT:    0x041A,
  EXP_TABLE:          0x0438,
  RELATION_EXP_TABLE: 0x0442,
  MAIL_LIST:          0x04C4,
  LOBBY_INIT:         0x05FA,
  CLUB_LIST:          0x05E6,
  CLUB_CREATE_REQ:    0x05F0,
  ROOM_LIST:          0x07E4,
  CASH_POINT:         0x0C26,
  STAGE_INFO:         0x0596,
  UNKNOWN_C94:        0x0C94,
  EVENT_LIST:         0x0D48,
  CH_LIST:            0x07D0,
  CH_ENTER:           0x07DA,
  INVENTORY:          0x0BC2,
  CHAR_EQUIP:         0x0BE0,
  APPEARANCE_BROADCAST: 0x0C30,
  CHAR_INFO:          0x0546,
  ROOM_LIST_REQ:      0x0870,
  ROOM_LEAVE_BROADCAST: 0x088e,
  LEVEL_UP:           0x0FA6,
  ROOM_PING:          0x07EE,
  ROOM_CREATE:        0x0834,
  ROOM_CREATE_RESP:   0x083E,
  ROOM_ENTER_BROADCAST: 0x0852,
  ROOM_CHAR_LIST:     0x0866,
  SET_STAGE:          0x08B6,
  SET_MUSIC:          0x08C0,
  ROOM_SET_MODE_REQ:  0x08A2,
  ROOM_SET_MODE_RESP: 0x08A3,
  ROOM_SET_KEY_RESP:  0x08A4,
  ROOM_SET_DIFFICULTY_RESP: 0x08A5,
  ROOM_SET_SECRET:    0x08AC,
  LOBBY_CHAR_LIST:    0x07F8,
  ROOM_CHAT:          0x0816,
  PLAYER_MOVE:        0x08CA,
  GAME_STATE:         0x08FC,
  GAME_START:         0x0906,
  SERVER_TIME:        0x046A,
  GAME_LOAD_DONE:     0x0910,
  GAME_NOTE:          0x0992,
  GAME_LOAD_NOTIFY:   0x099C,
  GAME_END:           0x091A,
  GAME_SCORE:         0x0924,
  GAME_BOOSTER:       0x0988,
  BUY_ITEM:           0x0BCC,
  PREMIUM_ITEM_EQUIP: 0x0C4E,
};

const EVENTS = {
  NONE: 0,
  VALENTINE: 3,
  HALLOWEEN: 4,
  CHRISTMAS: 5,
};

const EVENT_NAMES = {
  [EVENTS.NONE]: 'None (Normal)',
  [EVENTS.VALENTINE]: 'Valentine\'s Day',
  [EVENTS.HALLOWEEN]: 'Halloween',
  [EVENTS.CHRISTMAS]: 'Christmas',
};

function buildCharacterInfoPacket(session) {
  const pkt = Buffer.alloc(184, 0);
  
  pkt.writeUInt16LE(184, 0);
  pkt.writeUInt16LE(OP.PRIVATE_INFO, 2);
  pkt.writeUInt16LE(0, 4);
  pkt.writeUInt16LE(0, 6);
  
  pkt.writeUInt32LE(session.characterId, 0x08);
  pkt.writeUInt8(0, 0x0C);
  pkt.writeUInt8(session.gender, 0x0D);
  pkt.writeUInt16LE(0, 0x0E);
  
  writeWString(pkt, 0x10, session.characterName, 16);
  
  pkt.writeUInt32LE(0, 0x30);
  pkt.writeUInt16LE(session.characterLevel, 0x34);
  pkt.writeUInt16LE(0, 0x36);
  pkt.writeUInt16LE(0, 0x38);
  pkt.writeUInt16LE(0, 0x3A);
  
  const resourceID = session.gender;
  
  pkt.writeUInt16LE(1, 0x3C);
  pkt.writeUInt16LE(resourceID, 0x3E);
  pkt.writeUInt16LE(2, 0x40);
  pkt.writeUInt16LE(resourceID, 0x42);
  pkt.writeUInt16LE(3, 0x44);
  pkt.writeUInt16LE(resourceID, 0x46);
  pkt.writeUInt16LE(4, 0x48);
  pkt.writeUInt16LE(resourceID, 0x4A);
  pkt.writeUInt16LE(5, 0x4C);
  pkt.writeUInt16LE(resourceID, 0x4E);
  pkt.writeUInt16LE(6, 0x50);
  pkt.writeUInt16LE(resourceID, 0x52);
  
  pkt.writeUInt32LE(0, 0x54);
  
  if (session.honeyName && session.honeyName.length > 0) {
    pkt.writeUInt32LE(session.honeyName.length, 0x58);
    writeWString(pkt, 0x5C, session.honeyName, 16);
  } else {
    pkt.writeUInt32LE(0, 0x58);
  }
  
  const accessorySlots = [
    { name: 'bracelet',  offset: 0x7C, category: 0x1F },
    { name: 'bag',       offset: 0x80, category: 0x20 },
    { name: 'glasses',   offset: 0x84, category: 0x21 },
    { name: 'earring',   offset: 0x88, category: 0x22 },
    { name: 'particle',  offset: 0x8C, category: 0x23 },
    { name: 'title',     offset: 0x90, category: 0x24 },
    { name: 'pet',       offset: 0x94, category: 0x25 },
    { name: 'nickColor', offset: 0x98, category: 0x26 },
    { name: 'chatColor', offset: 0x9C, category: 0x27 },
    { name: 'setItem',   offset: 0xA0, category: 0x28 },
  ];

  for (const slot of accessorySlots) {
    let equippedItem = null;
    for (const [key, item] of session.inventory) {
      if (item.category === slot.category && item.equipped === 1) {
        equippedItem = item;
        break;
      }
    }
    
    if (equippedItem) {
      if (slot.name === 'title') {
        const titleData = (equippedItem.itemTypeId << 16) | 0;
        pkt.writeUInt32LE(titleData, slot.offset);
      } else {
        const resourceId = (equippedItem.variantId << 16) | (equippedItem.uniqueId & 0xFFFF);
        pkt.writeUInt32LE(resourceId, slot.offset);
      }
    } else {
      pkt.writeUInt32LE(0, slot.offset);
    }
  }
  
  pkt.writeUInt32LE(0, 0xA4);
  pkt.writeUInt32LE(0, 0xA8);
  pkt.writeUInt8(0, 0xAC);
  
  return pkt;
}

function buildExpTable() {
  const p = mkPkt(0xF8, OP.EXP_TABLE, 0);
  for (let i = 0; i < 60; i++) {
    const expRequired = Math.floor(100 * Math.pow(1.1, i));
    p.writeUInt32LE(expRequired, 8 + (i * 4));
  }
  return p;
}

function buildRelationExpTable() {
  const p = mkPkt(0x1C, OP.RELATION_EXP_TABLE, 0);
  const relationExp = [0, 100, 300, 600, 1000];
  for (let i = 0; i < 5; i++) {
    p.writeUInt32LE(relationExp[i], 8 + (i * 4));
  }
  return p;
}

function buildCharacterCheck() {
  const p = mkPkt(0x20, OP.CHAR_CHECK, 0);
  p.writeUInt32LE(0, 8);
  p.writeInt32LE(-1, 12);
  return p;
}

function buildServerList(mainPort) {
  const serverCount = 1;
  const SERVER_ENTRY_SIZE = 0x38;
  const bodyLen = 0x10 + (serverCount * SERVER_ENTRY_SIZE);
  const totalSize = 0x08 + bodyLen;
  const p = mkPkt(totalSize, OP.SERVER_LIST, 0);
  p.writeUInt32LE(bodyLen, 0x08);
  p.writeUInt32LE(serverCount, 0x0C);
  p.writeUInt32LE(1, 0x10);
  p.writeUInt32LE(0, 0x14);
  let off = 0x18;
  p.writeUInt32LE(1, off + 0x00);
  p.writeUInt32LE(0, off + 0x04);
  p.writeUInt16LE(50, off + 0x08);
  p.writeUInt16LE(500, off + 0x0A);
  p.writeUInt32LE(1, off + 0x0C);
  p.writeUInt32LE(0, off + 0x10);
  p.writeUInt8(127, off + 0x14);
  p.writeUInt8(0, off + 0x15);
  p.writeUInt8(0, off + 0x16);
  p.writeUInt8(1, off + 0x17);
  p.writeUInt16LE(mainPort, off + 0x18);
  p.writeUInt16LE(0, off + 0x1A);
  const name = 'Main Server';
  writeWString(p, off + 0x1C, name, 15);
  return p;
}

function buildChannelList(mainPort) {
  const channelCount = 5;
  const CHANNEL_ENTRY_SIZE = 0x38;
  const totalSize = 8 + (channelCount * CHANNEL_ENTRY_SIZE);
  const p = mkPkt(totalSize, OP.CH_LIST, 0);
  let off = 8;
  for (let i = 0; i < channelCount; i++) {
    p.writeUInt32LE(i + 1, off + 0x00);
    p.writeUInt32LE(0, off + 0x04);
    p.writeUInt16LE(10 + (i * 5), off + 0x08);
    p.writeUInt16LE(100, off + 0x0A);
    p.writeUInt32LE(1, off + 0x0C);
    p.writeUInt32LE(0, off + 0x10);
    p.writeUInt8(127, off + 0x14);
    p.writeUInt8(0, off + 0x15);
    p.writeUInt8(0, off + 0x16);
    p.writeUInt8(1, off + 0x17);
    p.writeUInt16LE(mainPort, off + 0x18);
    p.writeUInt16LE(0, off + 0x1A);
    const channelName = `Channel-${i + 1}`;
    writeWString(p, off + 0x1C, channelName, 13);
    off += CHANNEL_ENTRY_SIZE;
  }
  return p;
}

function buildClubEnterResult(session) {
  const p = Buffer.alloc(0x60, 0);
  
  p.writeUInt16LE(0x60, 0);
  p.writeUInt16LE(0x5FA, 2);
  p.writeUInt16LE(0, 4);
  p.writeUInt16LE(0, 6);
  
  p.writeUInt32LE(session.characterId, 0x08);
  p.writeUInt8(0, 0x0C);
  p.writeUInt8(session.gender, 0x0D);
  p.writeUInt16LE(0, 0x0E);
  
  writeWString(p, 0x10, session.characterName, 16);
  
  p.writeUInt32LE(0, 0x30);
  p.writeUInt16LE(session.characterLevel, 0x34);
  p.writeUInt16LE(0, 0x36);
  p.writeUInt16LE(0, 0x38);
  p.writeUInt16LE(0, 0x3A);
  
  const defaultVar = session.gender;
  
  p.writeUInt16LE(1, 0x3C); p.writeUInt16LE(defaultVar, 0x3E);
  p.writeUInt16LE(2, 0x40); p.writeUInt16LE(defaultVar, 0x42);
  p.writeUInt16LE(3, 0x44); p.writeUInt16LE(defaultVar, 0x46);
  
  p.writeUInt32LE(0, 0x48);
  p.writeUInt32LE(0, 0x4C);
  
  p.writeUInt16LE(0, 0x50);
  p.writeUInt16LE(0, 0x52);
  p.writeUInt32LE(0, 0x54);
  p.writeUInt32LE(0, 0x58);
  p.writeUInt32LE(0, 0x5C);
  
  return p;
}

function buildClubSelfSpawn(session) {
  const packetSize = 0xD4;
  const p = Buffer.alloc(packetSize, 0);
  
  p.writeUInt16LE(packetSize, 0);
  p.writeUInt16LE(OP.LOBBY_CHAR_LIST, 2);
  p.writeUInt16LE(0, 4);
  p.writeUInt16LE(0, 6);
  
  let offset = 8;
  
  p.writeUInt32LE(session.characterId, offset + 0x00);
  p.writeUInt8(0, offset + 0x04);
  p.writeUInt8(session.gender, offset + 0x05);
  p.writeUInt8(0, offset + 0x06);
  p.writeUInt8(0, offset + 0x07);
  
  writeWString(p, offset + 0x08, session.characterName, 16);
  
  p.writeUInt32LE(0, offset + 0x28);
  p.writeUInt32LE(0, offset + 0x2C);
  p.writeUInt16LE(session.characterLevel, offset + 0x48);
  p.writeUInt32LE(0, offset + 0x8C);
  
  const posOffset = 0xB8;
  p.writeUInt32LE(0, posOffset + 0x00);
  p.writeFloatLE(550.0, posOffset + 0x04);
  p.writeFloatLE(-700.0, posOffset + 0x08);
  p.writeFloatLE(0.0, posOffset + 0x0C);
  
  return p;
}

function buildClubPositionSync(session) {
  const posPacket = Buffer.alloc(0x24, 0);
  posPacket.writeUInt16LE(0x24, 0);
  posPacket.writeUInt16LE(OP.PLAYER_MOVE, 2);
  posPacket.writeUInt16LE(0, 4);
  posPacket.writeUInt16LE(0, 6);
  
  posPacket.writeUInt32LE(session.characterId, 0x08);
  posPacket.writeFloatLE(0.0, 0x0C);
  posPacket.writeFloatLE(-15.0, 0x10);
  posPacket.writeFloatLE(1.0, 0x14);
  posPacket.writeUInt32LE(0, 0x18);
  posPacket.writeUInt16LE(0, 0x1C);
  
  return posPacket;
}

function buildRoomEnterBroadcast(room, session) {
  const packetSize = 0xD4;
  const p = Buffer.alloc(packetSize, 0);
  
  p.writeUInt16LE(packetSize, 0);
  p.writeUInt16LE(OP.ROOM_ENTER_BROADCAST, 2);
  p.writeUInt16LE(0, 4);
  p.writeUInt16LE(0, 6);
  
  let offset = 8;
  const player = room.players.get(session.characterId);
  
  p.writeUInt32LE(session.characterId, offset + 0x00);
  p.writeUInt8(0, offset + 0x04);
  p.writeUInt8(session.gender, offset + 0x05);
  p.writeUInt8(0, offset + 0x06);
  p.writeUInt8(player.isMaster ? 1 : 0, offset + 0x07);
  writeWString(p, offset + 0x08, session.characterName, 16);
  
  let petItem = null;
  for (const [key, item] of session.inventory) {
    if (item.category === 0x25 && item.equipped === 1) {
      petItem = item;
      break;
    }
  }
  
  p.writeUInt32LE(petItem ? petItem.itemTypeId : 0, offset + 0x28);
  p.writeUInt32LE(petItem ? petItem.variantId : 0, offset + 0x2C);
  p.writeUInt16LE(session.characterLevel, offset + 0x48);
  p.writeUInt32LE(petItem ? 1 : 0, offset + 0x8C);
  
  const posOffset = 0xB8;
  p.writeUInt32LE(0, posOffset + 0x00);
  p.writeFloatLE(600.0, posOffset + 0x04);
  p.writeFloatLE(-700.0, posOffset + 0x08);
  p.writeFloatLE(0.0, posOffset + 0x0C);
  
  return p;
}

function buildEventList(eventId) {
  if (eventId === EVENTS.NONE || eventId === 0 || eventId === null || eventId === undefined) {
    const pkt = Buffer.alloc(8, 0);
    pkt.writeUInt16LE(8, 0);
    pkt.writeUInt16LE(0x0D48, 2);
    pkt.writeUInt16LE(0, 4);
    pkt.writeUInt16LE(0, 6);
    return pkt;
  }
  
  const EVENT_SIZE = 0x24;
  const eventCount = 1;
  const packetSize = 8 + (eventCount * EVENT_SIZE);
  
  const pkt = Buffer.alloc(packetSize, 0);
  
  pkt.writeUInt16LE(packetSize, 0);
  pkt.writeUInt16LE(0x0D48, 2);
  pkt.writeUInt16LE(0, 4);
  pkt.writeUInt16LE(0, 6);
  
  const eventOffset = 8;
  pkt.writeUInt32LE(1, eventOffset + 0x00);
  pkt.writeUInt8(eventId, eventOffset + 0x04);
  pkt.writeUInt8(1, eventOffset + 0x05);
  pkt.writeUInt8(2, eventOffset + 0x06);
  pkt.writeUInt8(0, eventOffset + 0x07);
  
  return pkt;
}

function sendChatMessage(session, message) {
  const MAX_CHARS = 60;
  const lines = message.split('\n');
  const messages = [];
  let currentMsg = '';
  
  for (const line of lines) {
    if (currentMsg.length + line.length + 1 > MAX_CHARS && currentMsg.length > 0) {
      messages.push(currentMsg);
      currentMsg = line;
    } else {
      if (currentMsg.length > 0) {
        currentMsg += '\n' + line;
      } else {
        currentMsg = line;
      }
    }
  }
  
  if (currentMsg.length > 0) {
    messages.push(currentMsg);
  }
  
  messages.forEach((msg, index) => {
    setTimeout(() => {
      sendSingleChatMessage(session, msg);
    }, index * 100);
  });
}

function sendSingleChatMessage(session, message) {
  if (message.length > 100) {
    message = message.substring(0, 97) + '...';
  }
  
  const messageBytes = Buffer.byteLength(message, 'utf16le');
  const packetSize = 16 + messageBytes + 2;
  
  if (packetSize > 272) return;
  
  const packet = Buffer.alloc(packetSize, 0);
  packet.writeUInt16LE(packetSize, 0);
  packet.writeUInt16LE(OP.ROOM_CHAT, 2);
  packet.writeUInt16LE(0, 4);
  packet.writeUInt16LE(0, 6);
  packet.writeUInt32LE(session.characterId, 8);
  packet.writeUInt32LE(0, 12);
  writeWString(packet, 16, message, 128);
  
  session.socket.write(packet);
}

module.exports = {
  OP,
  EVENTS,
  EVENT_NAMES,
  buildCharacterInfoPacket,
  buildExpTable,
  buildRelationExpTable,
  buildCharacterCheck,
  buildServerList,
  buildChannelList,
  buildClubEnterResult,
  buildClubSelfSpawn,
  buildClubPositionSync,
  buildRoomEnterBroadcast,
  buildEventList,
  sendChatMessage,
  sendSingleChatMessage
};