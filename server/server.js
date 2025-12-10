let running = false;

let emuSettings = {
  characterName: '[DEV]Kijuwoo~',
  gender: 2,
  honeyName: '',
  eventId: 5,
};

let mainServer = null;
let rl = null;
const sockets = new Set();

function setEmuSettings(newSettings) {
  emuSettings = { ...emuSettings, ...newSettings };
  console.log('[SETTINGS] Updated emulator settings:', emuSettings);
}

function startServer() {
  if (running) {
    console.log('[SERVER] Already running');
    return;
  }
  running = true;
  console.log('[SERVER] Starting...');


const net = require('net');
const path = require('path');
const { itemDB } = require('./itemDatabase');
const { getStarterItems, getStarterItemsSummary, CATEGORIES } = require('./starterItems');
const { hx, mkPkt, logPkt, readWString, writeWString, calculateJudgment, getBoosterMultiplier, getMaxBoosterMultiplier, getMaxBoosterGauge } = require('./helpers');
const { OP, EVENTS, EVENT_NAMES, buildCharacterInfoPacket, buildExpTable, buildRelationExpTable, buildCharacterCheck, buildServerList, buildChannelList, buildClubEnterResult, buildClubSelfSpawn, buildClubPositionSync, buildRoomEnterBroadcast, buildEventList, sendChatMessage, sendSingleChatMessage } = require('./packets');
const { GameSession, Room } = require('./session');
const readline = require('readline');
const { executeCommand } = require('./commands');
const { cmdSaveInventory } = require('./commands');

const HOST = '127.0.0.1';
const MAIN_PORT = 8132;

const HANDSHAKE = Buffer.from('0800640000000000', 'hex');

global.rooms = new Map();
global.activeSession = null;

let connectionCount = 0;
let nextRoomId = 1000;

try {
  const idoPath = path.join(__dirname, 'ShopItem.ido');
  itemDB.load(idoPath);
  console.log(
    `[ITEMDB] Loaded ShopItem.ido from ${idoPath} (items=${itemDB.items?.length || 0})`
  );
} catch (err) {
  console.error('[ITEMDB] Failed to load ShopItem.ido:', err.message);
  console.error('[ITEMDB] Commands like \\additem / \\addset will NOT work without it.');
}

function getActiveSession() {
  return global.activeSession;
}

const mainServer = net.createServer(sock => {
  connectionCount++;
  const connId = connectionCount;
  console.log(`[MAIN #${connId}] New connection from ${sock.remoteAddress}:${sock.remotePort}`);
  sock.setNoDelay(true);

  sockets.add(sock);
  sock.on('close', () => sockets.delete(sock));
  sock.on('error', () => sockets.delete(sock));
  
  const session = new GameSession(sock, emuSettings);
  global.activeSession = session;
  //MODIFICATION TO LOAD AUTOMATICALLY
  // Auto-load inventory
try {
    const { cmdLoadInventory } = require('./commands');
    const result = cmdLoadInventory([], session);
    console.log("[AUTOLOAD] " + result);
} catch (e) {
    console.log("[AUTOLOAD] Failed:", e.message);
}
  //END MODIFICATION
  sock.write(HANDSHAKE);
  logPkt('>', HANDSHAKE, 'HANDSHAKE', `[MAIN #${connId}] `);
  
  let rx = Buffer.alloc(0);
  let handshakeCount = 0;

  sock.on('data', chunk => {
    rx = Buffer.concat([rx, chunk]);
    
    if (!session.encryptInitSent) {
      session.encryptInitSent = true;
      const p = mkPkt(0x18, OP.ENCRYPT_INIT, 0);
      const key = Buffer.alloc(16, 0);
      key.copy(p, 8);
      session.crypto.init(key);
      sock.write(p);
      logPkt('>', p, 'ENCRYPT_INIT', `[MAIN #${connId}] `);
    }
    
    while (rx.length >= 8) {
      const size = rx.readUInt16LE(0);
      if (size < 8 || rx.length < size) break;
      const pkt = rx.slice(0, size);
      rx = rx.slice(size);
      let op = pkt.readUInt16LE(2);
      
      logPkt('<', pkt, `State: ${session.state}`, `[MAIN #${connId}] `);

      if (op === OP.ENCRYPTED) {
        if (session.state === 'INIT' || session.state === 'LOGIN') {
          session.setState('LOGIN');
          const loginResp = mkPkt(0x18, OP.LOGIN_RESP, 0);
          sock.write(loginResp);
          logPkt('>', loginResp, 'LOGIN_RESP', `[MAIN #${connId}] `);
          
        } else if (session.state === 'WORLD') {
          session.setState('CHAR_LOGGED_IN');

          const eventList = buildEventList(session.activeEvent);
          sock.write(eventList);
          logPkt('>', eventList, `EVENT_LIST`, `[MAIN #${connId}] `);
          
          const charInfo = buildCharacterInfoPacket(session);
          sock.write(charInfo);
          logPkt('>', charInfo, `CHARACTER_INFO`, `[MAIN #${connId}] `);
          
          const levelUpPkt = mkPkt(12, OP.LEVEL_UP, 0);
          levelUpPkt.writeUInt32LE(500, 8);
          sock.write(levelUpPkt);
          logPkt('>', levelUpPkt, 'LEVEL_UP_TRIGGER', `[MAIN #${connId}] `);
          
        } else if (session.state === 'CHANNEL') {
          session.setState('IN_CLUB');
          
          const packets = [
            { op: OP.CLUB_LIST, size: 8, name: 'CLUB_LIST' },
            { op: OP.ROOM_LIST, size: 16, name: 'ROOM_LIST' },
            { op: OP.MAIL_LIST, size: 12, name: 'MAIL_LIST' },
            { op: OP.UNKNOWN_C94, size: 8, name: 'UNKNOWN_C94' },
          ];
          
          for (const pktInfo of packets) {
            const p = mkPkt(pktInfo.size, pktInfo.op, 0);
            if (pktInfo.size >= 12) p.writeUInt32LE(0, 8);
            if (pktInfo.size >= 16) p.writeUInt32LE(0, 12);
            sock.write(p);
          }

          session.clubSpawnComplete = false;

          const clubEnter = Buffer.alloc(0x14, 0);
          clubEnter.writeUInt16LE(0x14, 0);
          clubEnter.writeUInt16LE(0x5FA, 2);
          clubEnter.writeUInt16LE(0, 4);
          clubEnter.writeUInt16LE(0, 6);
          clubEnter.writeInt32LE(1, 8);
          clubEnter.writeInt32LE(0, 12);
          clubEnter.writeInt32LE(0, 16);
          
          sock.write(clubEnter);
          logPkt('>', clubEnter, 'CLUB_ENTER', `[MAIN #${connId}] `);
          
          const clubResult = buildClubEnterResult(session);
          sock.write(clubResult);
          
          setTimeout(() => {
            const selfSpawn = buildClubSelfSpawn(session);
            sock.write(selfSpawn);
            
            setTimeout(() => {
              const posSync = buildClubPositionSync(session);
              sock.write(posSync);
              console.log(`[MAIN #${connId}] Club entry complete`);
            }, 200);
          }, 100);
        }
        continue;
      }

      switch (op) {
        case OP.HANDSHAKE:
          handshakeCount++;

          if (session.state === 'REDIRECTED') {
            session.setState('WORLD');
            session.reset();
          } else if (session.state === 'LOBBY_WAITING') {
            session.setState('CHANNEL');
            session.reset();
          }

          sock.write(pkt);
          logPkt('>', pkt, `HANDSHAKE echo #${handshakeCount}`, `[MAIN #${connId}] `);
          break;

        case OP.PRIVATE_INFO:
          const charInfo = buildCharacterInfoPacket(session);
          sock.write(charInfo);
          logPkt('>', charInfo, 'CHARACTER_INFO', `[MAIN #${connId}] `);
          break;

        case OP.EXP_TABLE:
          sock.write(buildExpTable());
          break;

        case OP.RELATION_EXP_TABLE:
          sock.write(buildRelationExpTable());
          sock.write(buildCharacterCheck());
          break;

        case OP.CHAR_CHECK:
          if (pkt.length === 12) {
            session.userId = pkt.readUInt32LE(8);
            
            if (session.state === 'LOGIN') {
              session.setState('CHAR_SELECT');
            } else if (session.state === 'CHAR_LOGGED_IN') {
              session.setState('LOBBY_WAITING');
            }
          }
          break;

        case OP.SERVER_LIST:
          sock.write(buildServerList(MAIN_PORT));
          break;

        case OP.SERVER_REDIRECT:
          session.setState('REDIRECTED');
          break;

        case OP.CH_LIST:
          if (session.state === 'CHAR_SELECT') {
            if (pkt.length >= 12) {
              session.selectedServer = pkt.readUInt32LE(8);
            }
            const redirect = mkPkt(16, OP.SERVER_REDIRECT, 0);
            redirect.writeUInt8(127, 8);
            redirect.writeUInt8(0, 9);
            redirect.writeUInt8(0, 10);
            redirect.writeUInt8(1, 11);
            redirect.writeUInt16LE(MAIN_PORT, 12);
            redirect.writeUInt16LE(0, 14);
            sock.write(redirect);
            logPkt('>', redirect, 'REDIRECT', `[MAIN #${connId}] `);
          } else {
            if (pkt.length === 8) {
              sock.write(buildChannelList(MAIN_PORT));
              session.setState('CHANNEL_SELECT');
            } else if (pkt.length >= 12) {
              session.selectedChannel = pkt.readUInt32LE(8);
              const ack = mkPkt(12, OP.CH_LIST, 0);
              ack.writeUInt32LE(session.selectedChannel, 8);
              sock.write(ack);
              session.setState('JOINING_CHANNEL');
            }
          }
          break;

        case OP.LOBBY_INIT:
          console.log(`[MAIN #${connId}] Club enter request`);
          
          const clubPackets = [
            { op: OP.CLUB_LIST, size: 16, name: 'CLUB_LIST' },
            { op: OP.ROOM_LIST, size: 16, name: 'ROOM_LIST' },
            { op: OP.MAIL_LIST, size: 12, name: 'MAIL_LIST' },
            { op: OP.UNKNOWN_C94, size: 8, name: 'UNKNOWN_C94' },
          ];
          
          for (const pktInfo of clubPackets) {
            const p = mkPkt(pktInfo.size, pktInfo.op, 0);
            if (pktInfo.size >= 12) p.writeUInt32LE(0, 8);
            if (pktInfo.size >= 16) p.writeUInt32LE(0, 12);
            sock.write(p);
          }
          
          session.setState('IN_CLUB');
          
          setTimeout(() => {
            const clubResult = buildClubEnterResult(session);
            sock.write(clubResult);
            
            setTimeout(() => {
              const fakeRoom = {
                players: new Map([[session.characterId, {
                  id: session.characterId,
                  name: session.characterName,
                  level: session.characterLevel,
                  isMaster: false,
                }]]),
              };
              
              const clubSpawn = buildRoomEnterBroadcast(fakeRoom, session);
              clubSpawn.writeUInt16LE(0x7F8, 2);
              sock.write(clubSpawn);
              
              setTimeout(() => {
                const posSync = Buffer.alloc(0x24, 0);
                posSync.writeUInt16LE(0x24, 0);
                posSync.writeUInt16LE(0x08CA, 2);
                posSync.writeUInt16LE(0, 4);
                posSync.writeUInt16LE(0, 6);
                
                posSync.writeUInt32LE(session.characterId, 0x08);
                posSync.writeFloatLE(550.0, 0x0C);
                posSync.writeFloatLE(-700.0, 0x10);
                posSync.writeFloatLE(0.0, 0x14);
                posSync.writeUInt32LE(0, 0x18);
                posSync.writeUInt16LE(0, 0x1C);
                
                sock.write(posSync);
                console.log(`[MAIN #${connId}] Club entry complete`);
              }, 150);
            }, 100);
          }, 50);
          break;

        case OP.CHAR_EQUIP:
        {
          if (pkt.length < 32) break;
          
          const uniqueIds = {
            hair: pkt.readUInt32LE(8),
            face: pkt.readUInt32LE(12),
            jacket: pkt.readUInt32LE(16),
            gloves: pkt.readUInt32LE(20),
            pants: pkt.readUInt32LE(24),
            shoes: pkt.readUInt32LE(28),
          };
          
          const slotMap = {
            hair: 0x0B,
            face: 0x0C,
            jacket: 0x0D,
            gloves: 0x0E,
            pants: 0x0F,
            shoes: 0x10,
          };
          
          for (const [key, item] of session.inventory) {
            if ([0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10].includes(item.slot)) {
              item.equipped = 0;
            }
          }
          
          for (const [slotName, slotId] of Object.entries(slotMap)) {
            const uniqueId = uniqueIds[slotName];
            if (uniqueId === 0 || uniqueId === 0xFFFFFFFF) continue;
            
            for (const [key, item] of session.inventory) {
              if (item.uniqueId === uniqueId && item.slot === slotId) {
                item.equipped = 1;
                break;
              }
            }
          }
          
          const resp = Buffer.alloc(8, 0);
          resp.writeUInt16LE(8, 0);
          resp.writeUInt16LE(0x0BE0, 2);
          resp.writeUInt16LE(0, 4);
          resp.writeUInt16LE(0, 6);
          sock.write(resp);
          logPkt('>', resp, 'CHAR_EQUIP SUCCESS', `[MAIN #${connId}] `);
          // AUTOSAVE EQUIP
          try {
         cmdSaveInventory([], session);
         console.log("[AUTOSAVE] Inventory saved after CHAR_EQUIP");
              } catch (e) {
          console.log("[AUTOSAVE] Failed:", e.message);
              }
          break;
        }

        case OP.APPEARANCE_BROADCAST:
        {
          if (pkt.length < 48) break;
          
          const accessoryData = {
            bracelet:  pkt.readUInt32LE(8),
            bag:       pkt.readUInt32LE(12),
            glasses:   pkt.readUInt32LE(16),
            earring:   pkt.readUInt32LE(20),
            particle:  pkt.readUInt32LE(24),
            title:     pkt.readUInt32LE(28),
            pet:       pkt.readUInt32LE(32),
            nickColor: pkt.readUInt32LE(36),
            chatColor: pkt.readUInt32LE(40),
            setItem:   pkt.readUInt32LE(44),
          };
          
          const accessorySlotMap = {
            bracelet:  0x1F,
            bag:       0x20,
            glasses:   0x21,
            earring:   0x22,
            particle:  0x23,
            title:     0x24,
            pet:       0x25,
            nickColor: 0x26,
            chatColor: 0x27,
            setItem:   0x28,
          };
          
          for (const [key, item] of session.inventory) {
            if ([0x1F, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28].includes(item.category)) {
              item.equipped = 0;
            }
          }
          
          for (const [slotName, category] of Object.entries(accessorySlotMap)) {
            const uniqueId = accessoryData[slotName];
            if (uniqueId !== 0 && uniqueId !== 0xFFFFFFFF) {
              for (const [key, item] of session.inventory) {
                if (item.uniqueId === uniqueId && item.category === category) {
                  item.equipped = 1;
                  break;
                }
              }
            }
          }
          
          const resp = Buffer.alloc(8, 0);
          resp.writeUInt16LE(8, 0);
          resp.writeUInt16LE(0x0C30, 2);
          resp.writeUInt16LE(0, 4);
          resp.writeUInt16LE(0, 6);
          sock.write(resp);
          logPkt('>', resp, 'ACCESSORY_EQUIP SUCCESS', `[MAIN #${connId}] `);
          // Auto-save inventory after accessory equip
try {
    const { cmdSaveInventory } = require('./commands');
    const result = cmdSaveInventory([], session);
    console.log("[AUTOSAVE] " + result);
} catch (e) {
    console.log("[AUTOSAVE] Failed:", e.message);
}
          break;
        }
        
        case OP.INVENTORY:
        {
          if (pkt.length < 12) break;
          
          const requestedSlot = pkt.readUInt32LE(8);
          console.log(`[MAIN #${connId}] Inventory request for slot 0x${requestedSlot.toString(16)}`);
          
          const itemsInSlot = [];
          const MAX_ITEMS_PER_RESPONSE = 50;
          
          for (const [key, item] of session.inventory) {
            let shouldInclude = false;
            
            switch (requestedSlot) {
              case 0x28:
                if (item.category === 0x28) shouldInclude = true;
                break;
              case 0x01:
                if (item.category === 0x01) shouldInclude = true;
                break;
              case 0x02:
                if (item.category === 0x02) shouldInclude = true;
                break;
              case 0x25:
                if (item.category === 0x25) shouldInclude = true;
                break;
              default:
                if (item.category === requestedSlot) shouldInclude = true;
                break;
            }
            
            if (shouldInclude) {
              itemsInSlot.push(item);
              if (itemsInSlot.length >= MAX_ITEMS_PER_RESPONSE) break;
            }
          }
          
          if (itemsInSlot.length === 0) {
            const empty = Buffer.alloc(16, 0);
            empty.writeUInt16LE(16, 0);
            empty.writeUInt16LE(0x0BC2, 2);
            empty.writeUInt16LE(0, 4);
            empty.writeUInt16LE(requestedSlot, 6);
            empty.writeUInt32LE(0, 8);
            empty.writeUInt32LE(0, 12);
            sock.write(empty);
          } else {
            const ITEM_SIZE = 0x24;
            const headerSize = 8;
            let actualSize = headerSize + (itemsInSlot.length * ITEM_SIZE);
            
            if (actualSize > 2048) {
              const maxItems = Math.floor((2048 - headerSize) / ITEM_SIZE);
              itemsInSlot.splice(maxItems);
              actualSize = headerSize + (itemsInSlot.length * ITEM_SIZE);
            }
            
            const resp = Buffer.alloc(actualSize, 0);
            resp.writeUInt16LE(actualSize, 0);
            resp.writeUInt16LE(0x0BC2, 2);
            resp.writeUInt16LE(0, 4);
            resp.writeUInt16LE(requestedSlot, 6);
            
            let offset = headerSize;
            for (const item of itemsInSlot) {
              resp.writeUInt32LE(item.uniqueId, offset + 0x00);
              resp.writeUInt32LE(0, offset + 0x04);
              resp.writeUInt32LE(0, offset + 0x08);
              resp.writeUInt16LE(item.category, offset + 0x0C);
              resp.writeUInt16LE(item.itemTypeId, offset + 0x0E);
              resp.writeInt16LE(item.variantId, offset + 0x10);
              resp.writeUInt32LE(0, offset + 0x12);
              resp.writeUInt8(item.equipped ? 1 : 0, offset + 0x16);
              resp.writeUInt8(0, offset + 0x17);
              resp.writeInt16LE(item.duration, offset + 0x18);
              resp.writeUInt32LE(0, offset + 0x1C);
              resp.writeUInt32LE(0, offset + 0x20);
              offset += ITEM_SIZE;
            }
            
            sock.write(resp);
            console.log(`[MAIN #${connId}] Sent ${itemsInSlot.length} items`);
          }
          break;
        }
        
        case OP.CH_ENTER:
          if (pkt.length >= 12) {
            const channelId = pkt.readUInt32LE(8);
            const chEnterAck = mkPkt(8, OP.CH_ENTER, 0);
            sock.write(chEnterAck);
            session.setState('CHANNEL');
          }
          break;

        case OP.CASH_POINT:
          const cashResp = mkPkt(16, OP.CASH_POINT, 0); 
          cashResp.writeUInt32LE(session.cash, 8);
          cashResp.writeUInt32LE(session.points, 12);
          sock.write(cashResp);
          break;

        case OP.STAGE_INFO:
          sock.write(mkPkt(8, OP.STAGE_INFO, 0));
          break;

        case OP.EVENT_LIST:
          const evtResp = mkPkt(8, OP.EVENT_LIST, 0);
          sock.write(evtResp);
          break;

        case OP.ROOM_CHAT: {
          if (pkt.length >= 14) {
            const senderId = pkt.readUInt32LE(0x04);
            const message = readWString(pkt, 0x0C, 128);

            console.log(`[MAIN #${connId}] Chat from ${senderId}: "${message}"`);

            if (message.startsWith('\\')) {
              const result = executeCommand(message, session);

              if (Array.isArray(result)) {
                for (const line of result) {
                  if (line && line.trim()) {
                    sendChatMessage(session, line);
                  }
                }
              } else if (result) {
                sendChatMessage(session, result);
              }
            } else {
              sendChatMessage(session, message);
            }
          }
          break;
        }
        
        case OP.PLAYER_MOVE:
        {
          if (pkt.length !== 0x24) break;
          
          const playerId = pkt.readUInt32LE(0x08);
          const x = pkt.readFloatLE(0x0C);
          const y = pkt.readFloatLE(0x10);
          const z = pkt.readFloatLE(0x14);
          const animId = pkt.readUInt16LE(0x1C);
          
          const response = Buffer.alloc(0x24, 0);
          response.writeUInt16LE(0x24, 0);
          response.writeUInt16LE(0x08CA, 2);
          response.writeUInt16LE(0, 4);
          response.writeUInt16LE(0, 6);
          response.writeUInt32LE(playerId, 0x08);
          response.writeFloatLE(x, 0x0C);
          response.writeFloatLE(y, 0x10);
          response.writeFloatLE(z || 1.0, 0x14);
          response.writeUInt32LE(0, 0x18);
          response.writeUInt16LE(animId, 0x1C);
          response.writeUInt16LE(0, 0x1E);
          response.writeUInt32LE(0, 0x20);
          
          sock.write(response);
          break;
        }
        
        case OP.GAME_STATE:
        {
          if (pkt.length === 12) {
            const gameState = pkt.readUInt32LE(0x08);
            const room = session.getCurrentRoom();
            if (!room) break;
            
            if (gameState === 1) {
              session.perfectGauge = 0;
              session.boosterGauge = 0;
              session.boosterActive = false;
              session.boosterMultiplier = 1;
              session.boosterBeatsLeft = 0;
              session.boosterDuration = 0;
              session.cumulativeScore = 0;
              session.combo = 0;
              session.maxCombo = 0;
              
              const resp = mkPkt(12, OP.GAME_STATE, 0);
              resp.writeUInt32LE(gameState, 8);
              sock.write(resp);
              
              setTimeout(() => {
                const gameInit = mkPkt(24, OP.GAME_START, 0);
                gameInit.writeUInt32LE(room.stageId, 8);
                gameInit.writeUInt32LE(room.musicId, 12);
                gameInit.writeUInt32LE(room.gameMode, 16);
                gameInit.writeUInt32LE(room.keyMode, 20);
                sock.write(gameInit);
                room.gameInProgress = true;
              }, 100);
            }
          }
          break;
        }

        case OP.SERVER_TIME:
        {
          session.timeSyncCount++;
          const resp = mkPkt(12, OP.SERVER_TIME, 0);
          const serverTime = (Date.now() >>> 0);
          resp.writeUInt32LE(serverTime, 8);
          sock.write(resp);
          break;
        }

        case OP.GAME_LOAD_DONE:
        {
          const room = session.getCurrentRoom();
          if (!room) break;
          
          const now = Date.now() >>> 0;
          const loadWait = 2000;
          const gameDelay = 1000;
          const activationTime = (now + loadWait) >>> 0;
          const gameStartTime = (now + loadWait + gameDelay) >>> 0;
          
          const resp = mkPkt(12, OP.GAME_LOAD_DONE, 0);
          resp.writeUInt32LE(activationTime, 8);
          sock.write(resp);
          
          setTimeout(() => {
            const startPacket = Buffer.alloc(28, 0);
            startPacket.writeUInt16LE(28, 0);
            startPacket.writeUInt16LE(OP.GAME_NOTE, 2);
            startPacket.writeUInt16LE(0, 4);
            startPacket.writeUInt16LE(0, 6);
            startPacket.writeUInt32LE(session.characterId, 8);
            startPacket.writeUInt32LE(session.characterId, 12);
            startPacket.writeUInt16LE(1, 16);
            startPacket.writeUInt8(1, 18);
            startPacket.writeUInt8(0, 19);
            startPacket.writeUInt32LE(gameStartTime, 20);
            startPacket.writeUInt32LE(0, 24);
            sock.write(startPacket);
            room.gameInProgress = true;
          }, loadWait - 500);
          break;
        }

        case OP.GAME_SCORE:
        {
          if (pkt.length !== 28) break;

          const noteData = Buffer.alloc(16);
          pkt.copy(noteData, 0, 12, 28);

          let perfectHits = 0;
          let totalNotesHit = 0;
          
          for (let i = 0; i < 16; i++) {
            const acc = noteData.readUInt8(i);
            if (acc >= 100) {
              perfectHits++;
              totalNotesHit++;
            } else if (acc > 0) {
              totalNotesHit++;
            }
          }

          let rowScore = perfectHits * 150;
          
          if (session.boosterActive && session.boosterMultiplier > 1) {
            rowScore = rowScore * session.boosterMultiplier;
          }
          
          session.cumulativeScore += rowScore;
          
          const judgment = calculateJudgment(noteData);
          
          const room = session.getCurrentRoom();
          const keyMode = room ? room.keyMode : 1;
          const maxGauge = getMaxBoosterGauge(keyMode);
          
          let boosterGauge = 0;
          
          if (session.boosterActive) {
            const depletePerBeat = session.boosterGauge / session.boosterDuration;
            boosterGauge = Math.floor(depletePerBeat * session.boosterBeatsLeft);
            session.boosterBeatsLeft--;
            
            if (session.boosterBeatsLeft <= 0) {
              session.boosterActive = false;
              session.boosterMultiplier = 1;
              session.perfectGauge = 0;
              boosterGauge = 0;
            }
          } else {
            if (judgment === 100) {
              session.perfectGauge += 20;
            } else {
              session.perfectGauge = 0;
            }
            session.perfectGauge = Math.min(session.perfectGauge, maxGauge);
            boosterGauge = session.perfectGauge;
          }

          const response = Buffer.alloc(32, 0);
          response.writeUInt16LE(32, 0);
          response.writeUInt16LE(0x924, 2);
          response.writeUInt16LE(0, 4);
          response.writeUInt16LE(0, 6);
          response.writeUInt32LE(session.characterId, 8);
          response.writeUInt32LE(session.cumulativeScore, 12);
          response.writeUInt32LE(0, 16);
          response.writeUInt16LE(judgment, 20);
          response.writeUInt16LE(boosterGauge, 22);
          response.writeUInt32LE(0, 24);
          response.writeUInt32LE(0, 28);
          sock.write(response);
          break;
        }

        case OP.GAME_BOOSTER:
        {
          const room = session.getCurrentRoom();
          const keyMode = room ? room.keyMode : 1;
          const maxGauge = getMaxBoosterGauge(keyMode);
          const maxMultiplier = getMaxBoosterMultiplier(keyMode);
          const currentGauge = session.perfectGauge;
          
          const rawMultiplier = getBoosterMultiplier(currentGauge);
          const multiplier = Math.min(maxMultiplier, rawMultiplier);
          
          if (currentGauge >= 100 && !session.boosterActive) {
            session.boosterGauge = currentGauge;
            session.boosterActive = true;
            session.boosterMultiplier = multiplier;
            session.boosterDuration = multiplier - 1;
            if (session.boosterDuration < 1) session.boosterDuration = 1;
            session.boosterBeatsLeft = session.boosterDuration;
            
            const response = Buffer.alloc(16, 0);
            response.writeUInt16LE(16, 0);
            response.writeUInt16LE(0x988, 2);
            response.writeUInt16LE(0, 4);
            response.writeUInt16LE(0, 6);
            response.writeUInt32LE(session.characterId, 8);
            response.writeUInt16LE(currentGauge, 12);
            response.writeUInt16LE(0, 14);
            sock.write(response);
          } else {
            const response = Buffer.alloc(16, 0);
            response.writeUInt16LE(16, 0);
            response.writeUInt16LE(0x988, 2);
            response.writeUInt16LE(1, 4);
            response.writeUInt16LE(0, 6);
            response.writeUInt32LE(session.characterId, 8);
            response.writeUInt16LE(currentGauge, 12);
            response.writeUInt16LE(0, 14);
            sock.write(response);
          }
          break;
        }

        case OP.GAME_END:
        {
          const room = session.getCurrentRoom();
          if (!room) break;
          
          const players = Array.from(room.players.values()).map(p => ({
            ...p,
            score: (p.id === session.characterId) ? session.cumulativeScore : 0,
            maxCombo: (p.id === session.characterId) ? (session.maxCombo || 0) : 0
          }));
          
          players.sort((a, b) => b.score - a.score);
          const playerCount = players.length;
          
          const packetSize = 8 + (playerCount * 24);
          const response = Buffer.alloc(packetSize, 0);
          
          response.writeUInt16LE(packetSize, 0);
          response.writeUInt16LE(0x091A, 2);
          response.writeUInt16LE(0, 4);
          response.writeUInt16LE(0, 6);
          
          let offset = 8;
          players.forEach((player, index) => {
            response.writeUInt32LE(player.id, offset + 0);
            response.writeUInt32LE(player.score, offset + 4);
            response.writeUInt32LE(index, offset + 8);
            response.writeUInt32LE(player.maxCombo, offset + 12);
            response.writeUInt32LE(0, offset + 16);
            response.writeUInt32LE(0, offset + 20);
            offset += 24;
          });
          
          sock.write(response);
          
          setTimeout(() => {
            room.gameInProgress = false;
          }, 15000);
          
          session.cumulativeScore = 0;
          session.combo = 0;
          session.maxCombo = 0;
          session.boosterActive = false;
          session.boosterGauge = 0;
          break;
        }

        case OP.CHAR_INFO:
          const friendList = mkPkt(8, OP.CHAR_INFO, 0);
          sock.write(friendList);
          break;

        case OP.LOBBY_CHAR_LIST:
        {
          const CHAR_SIZE = 0x2C;
          const NUM_CHARS = 1;
          const packetSize = 8 + (NUM_CHARS * CHAR_SIZE);
          
          const lobbyPkt = Buffer.alloc(packetSize, 0);
          lobbyPkt.writeUInt16LE(packetSize, 0);
          lobbyPkt.writeUInt16LE(0x7F8, 2);
          lobbyPkt.writeUInt16LE(0, 4);
          lobbyPkt.writeUInt16LE(0, 6);
          
          let offset = 8;
          writeWString(lobbyPkt, offset + 0x00, session.characterName, 16);
          lobbyPkt.writeUInt32LE(session.characterId, offset + 0x20);
          lobbyPkt.writeUInt32LE(session.characterLevel, offset + 0x24);
          lobbyPkt.writeUInt32LE(0, offset + 0x28);
          
          sock.write(lobbyPkt);
          break;
        }

        case OP.ROOM_LIST_REQ:
        {
          const isInRoom = session.state === 'IN_WAIT_ROOM' || 
                          session.state === 'IN_GAME' || 
                          session.currentRoomId !== null;
          
          if (isInRoom && session.currentRoomId !== null) {
            console.log(`[MAIN #${connId}] Room leave request`);
            
            const room = global.rooms.get(session.currentRoomId);
            const playerId = session.characterId;
            
            const leaveResult = Buffer.alloc(8, 0);
            leaveResult.writeUInt16LE(8, 0);
            leaveResult.writeUInt16LE(0x0870, 2);
            leaveResult.writeUInt16LE(0, 4);
            leaveResult.writeUInt16LE(0, 6);
            sock.write(leaveResult);
            
            const leaveBroadcast = Buffer.alloc(16, 0);
            leaveBroadcast.writeUInt16LE(16, 0);
            leaveBroadcast.writeUInt16LE(0x088e, 2);
            leaveBroadcast.writeUInt16LE(0, 4);
            leaveBroadcast.writeUInt16LE(0, 6);
            leaveBroadcast.writeUInt32LE(playerId, 8);
            leaveBroadcast.writeUInt32LE(0, 12);
            sock.write(leaveBroadcast);
            
            if (room) {
              room.removePlayer(playerId);
              if (room.players.size === 0) {
                global.rooms.delete(session.currentRoomId);
              }
            }
            
            session.currentRoomId = null;
            session.setState('IN_CLUB');
            session.cumulativeScore = 0;
            session.combo = 0;
            session.maxCombo = 0;
            session.boosterActive = false;
            session.boosterGauge = 0;
          } else {
            const roomListResp = mkPkt(16, OP.ROOM_LIST_REQ, 0);
            roomListResp.writeUInt32LE(0, 8);
            roomListResp.writeUInt32LE(0, 12);
            sock.write(roomListResp);
          }
          break;
        }

        case OP.CLUB_LIST:
        {
          const resp = Buffer.alloc(8, 0);
          resp.writeUInt16LE(8, 0);
          resp.writeUInt16LE(0x05E6, 2);
          resp.writeUInt16LE(0, 4);
          resp.writeUInt16LE(0, 6);
          sock.write(resp);
          break;
        }

        case 0x05F0:
        {
          if (pkt.length < 0x50) break;
          
          const clubId = pkt.readUInt32LE(8);
          const clubName = readWString(pkt, 0x0C, 28);
          
          const resp = Buffer.alloc(0x60, 0);
          resp.writeUInt16LE(0x60, 0);
          resp.writeUInt16LE(0x05F0, 2);
          resp.writeUInt16LE(0, 4);
          resp.writeUInt16LE(0, 6);
          resp.writeFloatLE(0.0, 0x08);
          resp.writeFloatLE(0.0, 0x0C);
          resp.writeFloatLE(0.0, 0x10);
          resp.writeUInt32LE(session.characterId, 0x14);
          resp.writeUInt8(session.gender, 0x18);
          writeWString(resp, 0x20, clubName || 'New Club', 16);
          resp.writeUInt32LE(1, 0x4C);
          resp.writeUInt16LE(clubId, 0x50);
          resp.writeUInt16LE(0xFFFF, 0x52);
          
          sock.write(resp);
          session.setState('IN_CLUB');
          
          setTimeout(() => {
            const selfSpawn = buildClubSelfSpawn(session);
            sock.write(selfSpawn);
            
            setTimeout(() => {
              const posSync = buildClubPositionSync(session);
              sock.write(posSync);
            }, 200);
          }, 100);
          break;
        }

        case OP.ROOM_PING:
          break;

        case OP.ROOM_CREATE:
        {
          const title = readWString(pkt, 0x08, 30);
          console.log(`[MAIN #${connId}] Create room: "${title}"`);
          
          const roomId = nextRoomId++;
          const room = new Room(roomId, title, session);
          global.rooms.set(roomId, room);
          session.currentRoomId = roomId;
          session.setState('IN_WAIT_ROOM');
          
          const p = mkPkt(96, OP.ROOM_CREATE_RESP, 0);
          writeWString(p, 0x08, title, 16);
          p.writeUInt32LE(roomId, 0x48);
          p.writeUInt32LE(room.stageId, 0x4C);
          p.writeUInt8(room.isPrivate, 0x56);
          p.writeUInt8(room.keyMode, 0x58);
          p.writeUInt32LE(room.musicId, 0x5C);
          sock.write(p);
          
          setTimeout(() => {
            const stateTransition = Buffer.alloc(0x14, 0);
            stateTransition.writeUInt16LE(0x14, 0);
            stateTransition.writeUInt16LE(0x5FA, 2);
            stateTransition.writeUInt16LE(0, 4);
            stateTransition.writeUInt16LE(0, 6);
            stateTransition.writeInt32LE(roomId, 8);
            stateTransition.writeInt32LE(0, 12);
            stateTransition.writeInt32LE(1, 16);
            sock.write(stateTransition);
            
            setTimeout(() => {
              const enterBroadcast = buildRoomEnterBroadcast(room, session);
              sock.write(enterBroadcast);
              
              setTimeout(() => {
                const stageP = mkPkt(12, OP.SET_STAGE, 0);
                stageP.writeUInt32LE(room.stageId, 8);
                sock.write(stageP);
                
                const musicP = mkPkt(12, OP.SET_MUSIC, 0);
                musicP.writeUInt32LE(room.musicId, 8);
                sock.write(musicP);
                
                const modePacket = Buffer.alloc(16, 0);
                modePacket.writeUInt16LE(16, 0);
                modePacket.writeUInt16LE(0x08A2, 2);
                modePacket.writeUInt16LE(0, 4);
                modePacket.writeUInt32LE(room.gameMode, 8);
                modePacket.writeUInt8(room.keyMode, 12);
                sock.write(modePacket);
                
                const diffPacket = mkPkt(12, 0x08A5, 0);
                diffPacket.writeUInt32LE(0, 8);
                sock.write(diffPacket);
                
                setTimeout(() => {
                  const posSync = Buffer.alloc(0x24, 0);
                  posSync.writeUInt16LE(0x24, 0);
                  posSync.writeUInt16LE(0x08CA, 2);
                  posSync.writeUInt16LE(0, 4);
                  posSync.writeUInt16LE(0, 6);
                  posSync.writeUInt32LE(session.characterId, 0x08);
                  posSync.writeFloatLE(600.0, 0x0C);
                  posSync.writeFloatLE(-700.0, 0x10);
                  posSync.writeFloatLE(1.0, 0x14);
                  posSync.writeUInt32LE(0, 0x18);
                  posSync.writeUInt16LE(0, 0x1C);
                  posSync.writeUInt16LE(0, 0x1E);
                  posSync.writeUInt32LE(0, 0x20);
                  sock.write(posSync);
                  console.log(`[MAIN #${connId}] Room init complete`);
                }, 200);
              }, 200);
            }, 100);
          }, 50);
          break;
        }

        case OP.SET_STAGE:
        {
          if (pkt.length >= 12) {
            const stageId = pkt.readUInt32LE(8);
            const room = session.getCurrentRoom();
            if (room) {
              room.stageId = stageId;
              const resp = mkPkt(12, OP.SET_STAGE, 0);
              resp.writeUInt32LE(stageId, 8);
              sock.write(resp);
            }
          }
          break;
        }

        case OP.SET_MUSIC:
        {
          if (pkt.length >= 12) {
            const musicId = pkt.readUInt32LE(8);
            const room = session.getCurrentRoom();
            if (room) {
              room.musicId = musicId;
              const resp = mkPkt(12, OP.SET_MUSIC, 0);
              resp.writeUInt32LE(musicId, 8);
              sock.write(resp);
            }
          }
          break;
        }

        case OP.ROOM_SET_MODE_REQ:
        {
          if (pkt.length >= 16) {
            const gameMode = pkt.readUInt32LE(8);
            const keyMode = pkt.readUInt8(12);
            
            const room = session.getCurrentRoom();
            if (room && session.characterId === room.masterId) {
              room.gameMode = gameMode;
              room.keyMode = keyMode;
              
              const resp = Buffer.alloc(16, 0);
              resp.writeUInt16LE(16, 0);
              resp.writeUInt16LE(0x08A2, 2);
              resp.writeUInt16LE(0, 4);
              resp.writeUInt16LE(0, 6);
              resp.writeUInt32LE(room.gameMode, 8);
              resp.writeUInt8(room.keyMode, 12);
              resp.writeUInt8(0, 13);
              resp.writeUInt16LE(0, 14);
              room.broadcastToAll(resp);
            } else {
              const errResp = Buffer.alloc(16, 0);
              errResp.writeUInt16LE(16, 0);
              errResp.writeUInt16LE(0x08A2, 2);
              errResp.writeUInt16LE(1, 4);
              sock.write(errResp);
            }
          }
          break;
        }

        case OP.ROOM_SET_SECRET:
        {
          const isPrivate = pkt.readUInt32LE(8);
          const room = session.getCurrentRoom();
          if (room && session.characterId === room.masterId) {
            room.isPrivate = isPrivate;
            const p = mkPkt(12, OP.ROOM_SET_SECRET, 0);
            p.writeUInt32LE(isPrivate, 8);
            room.broadcastToAll(p);
          }
          break;
        }

        case OP.BUY_ITEM:
        {
          if (pkt.length < 12) {
            const err = mkPkt(12, 0x0BCC, 0xBCA);
            sock.write(err);
            break;
          }
          
          const category = pkt.readUInt16LE(8);
          const itemTypeId = pkt.readUInt16LE(10);
          const isColorItem = (category === 0x26 || category === 0x27);
          
          let item = null;
          
          if (isColorItem) {
            item = itemDB.findByTypeId(category, itemTypeId);
          } else {
            item = itemDB.get(category, itemTypeId, 0);
            if (!item) {
              item = itemDB.get(category, itemTypeId, session.gender);
            }
          }
          
          if (!item) {
            const err = mkPkt(12, 0x0BCC, 0xBCD);
            sock.write(err);
            break;
          }
          
          const inventoryKey = (category << 16) | itemTypeId;
          
          if (!isColorItem && session.inventory.has(inventoryKey)) {
            const err = mkPkt(12, 0x0BCC, 0xBC4);
            sock.write(err);
            break;
          }
          
          const uniqueId = session.getNextUniqueId();
          
          session.inventory.set(inventoryKey, {
            uniqueId: uniqueId,
            slot: category,
            category: item.category,
            itemTypeId: item.itemTypeId,
            variantId: item.variantId,
            typeFlag: item.typeFlag || 0,
            quantity: 1,
            equipped: isColorItem ? 1 : 0,
            duration: isColorItem ? 10000 : 720,
          });
          
          console.log(`[MAIN #${connId}] Purchased: "${item.name}"`);
          
          const success = mkPkt(12, 0x0BCC, 0);
          success.writeUInt32LE(0, 8);
          sock.write(success);
          
          const cashUpdate = mkPkt(28, 0x0C26, 0);
          cashUpdate.writeUInt32LE(session.cash, 8);
          cashUpdate.writeUInt32LE(session.points, 12);
          cashUpdate.writeUInt32LE(0, 16);
          cashUpdate.writeUInt32LE(session.points, 20);
          cashUpdate.writeUInt32LE(0, 24);
          sock.write(cashUpdate);
          break;
        }

        case OP.PREMIUM_ITEM_EQUIP:
        {
          if (pkt.length < 16) break;
          
          const category = pkt.readUInt16LE(8);
          const itemTypeId = pkt.readUInt16LE(10);
          
          const inventoryKey = (category << 16) | itemTypeId;
          let foundItem = session.inventory.get(inventoryKey);
          
          if (!foundItem) {
            const err = mkPkt(16, 0x0C4E, 1);
            sock.write(err);
            break;
          }
          
          const dbItem = itemDB.get(foundItem.category, foundItem.itemTypeId, foundItem.variantId);
          
          if (!dbItem) {
            const err = mkPkt(16, 0x0C4E, 1);
            sock.write(err);
            break;
          }
          
          const typeFlag = dbItem.typeFlag;
          
          if (typeFlag === 2) {
            session.inventory.delete(inventoryKey);
            
            const prizeCategories = [0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10];
            const validPrizes = [];
            const prizeCount = 1 + Math.floor(Math.random() * 2);
            
            for (let i = 0; i < prizeCount; i++) {
              const randomCat = prizeCategories[Math.floor(Math.random() * prizeCategories.length)];
              const categoryItems = itemDB.getByCategory(randomCat);
              
              const validItems = categoryItems.filter(item => 
                item.typeFlag !== 3 && item.typeFlag !== 2 && item.variantId === 0
              );
              
              if (validItems.length > 0) {
                const randomItem = validItems[Math.floor(Math.random() * validItems.length)];
                const prizeKey = (randomCat << 16) | randomItem.itemTypeId;
                
                if (!session.inventory.has(prizeKey)) {
                  session.inventory.set(prizeKey, {
                    uniqueId: session.getNextUniqueId(),
                    slot: randomCat,
                    category: randomItem.category,
                    itemTypeId: randomItem.itemTypeId,
                    variantId: randomItem.variantId,
                    typeFlag: randomItem.typeFlag,
                    quantity: 1,
                    equipped: 0,
                    duration: 720,
                  });
                  validPrizes.push(randomItem);
                }
              }
            }
            
            const resp = Buffer.alloc(16, 0);
            resp.writeUInt16LE(16, 0);
            resp.writeUInt16LE(0x0C4E, 2);
            resp.writeUInt16LE(0, 4);
            resp.writeUInt16LE(0, 6);
            resp.writeUInt32LE(validPrizes.length, 8);
            resp.writeUInt8(category, 12);
            resp.writeUInt8(2, 13);
            resp.writeUInt16LE(0, 14);
            sock.write(resp);
            
          } else if (typeFlag === 3) {
            session.inventory.delete(inventoryKey);
            
            const boxValidity = dbItem.validity;
            const boxName = dbItem.name;
            const setItems = [];
            
            for (const item of itemDB.items) {
              if (item.validity === boxValidity && 
                  item.validity !== 0 &&
                  item.itemTypeId !== itemTypeId &&
                  item.typeFlag !== 3) {
                setItems.push(item);
              }
            }
            
            if (setItems.length === 0 && boxName) {
              for (const item of itemDB.items) {
                if (item.name === boxName &&
                    item.itemTypeId !== itemTypeId &&
                    item.typeFlag !== 3) {
                  setItems.push(item);
                }
              }
            }
            
            const addedItems = [];
            
            for (const piece of setItems) {
              const pieceKey = (piece.category << 16) | piece.itemTypeId;
              
              if (session.inventory.has(pieceKey)) continue;
              
              session.inventory.set(pieceKey, {
                uniqueId: session.getNextUniqueId(),
                slot: piece.category,
                category: piece.category,
                itemTypeId: piece.itemTypeId,
                variantId: piece.variantId,
                typeFlag: piece.typeFlag,
                quantity: 1,
                equipped: 0,
                duration: 10000,
              });
              
              addedItems.push(piece);
            }
            
            const resp = Buffer.alloc(16, 0);
            resp.writeUInt16LE(16, 0);
            resp.writeUInt16LE(0x0C4E, 2);
            resp.writeUInt16LE(0, 4);
            resp.writeUInt16LE(0, 6);
            resp.writeUInt32LE(addedItems.length, 8);
            resp.writeUInt8(category, 12);
            resp.writeUInt8(3, 13);
            resp.writeUInt16LE(0, 14);
            sock.write(resp);
          } else {
            const err = mkPkt(16, 0x0C4E, 1);
            sock.write(err);
          }
          break;
        }

        default:
          console.log(`[MAIN #${connId}] Unknown opcode ${hx(op)}`);
          break;
      }
    }
  });

  sock.on('close', () => {
    if (session.currentRoomId) {
      const room = global.rooms.get(session.currentRoomId);
      if (room) {
        room.removePlayer(session.characterId);
        if (room.players.size === 0) {
          global.rooms.delete(session.currentRoomId);
        }
      }
    }
    console.log(`[MAIN #${connId}] Connection closed. State: ${session.state}`);
  });
  
  sock.on('error', err => {
    if (err.code !== 'ECONNRESET' && err.code !== 'EPIPE') {
      console.error(`[MAIN #${connId}] Error:`, err.message);
    }
  });
});

console.log('=============================================');
console.log(' Hello! I hope you will enjoy this project!');
console.log(' I made this hoping it will bring you back');
console.log('      to those simple times we had.');
console.log('              Please Enjoy!');
console.log('                                             ');
console.log('               ❤️  Kijuwoo.');
console.log('=============================================');
console.log('');

mainServer.listen(MAIN_PORT, HOST, () => {
  console.log(`[MAIN] Listening on ${HOST}:${MAIN_PORT}`);
});

process.on('SIGINT', () => {
  console.log('Shutting down (SIGINT)...');
  if (mainServer) {
    mainServer.close(() => {
      console.log('[SERVER] mainServer closed.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'iDate> '
});

rl.on('line', (line) => {
    line = line.trim();
    
    if (!line || (!line.startsWith('/') && !line.startsWith('\\'))) {
        rl.prompt();
        return;
    }
    
    if (line.startsWith('/')) {
        line = '\\' + line.slice(1);
    }
    
    const session = global.activeSession;
    const result = executeCommand(line, session);
    
    if (result) {
        if (Array.isArray(result)) {
            result.forEach(msg => console.log(msg));
        } else {
            console.log(result);
        }
    }
    
    rl.prompt();
});

console.log('Type \\help for available commands (use \\ in-game, / or \\ in console)');
rl.prompt();

}

function stopServer() {
  return new Promise((resolve, reject) => {
    if (!running) {
      console.log('[SERVER] Not running.');
      return resolve();
    }

    console.log('[SERVER] Stopping...');
    running = false;

    try {
      sockets.forEach(sock => {
        try {
          sock.destroy();
        } catch (_) {}
      });
      sockets.clear();

      if (rl) {
        rl.close();
        rl = null;
      }

      if (mainServer) {
        mainServer.close(err => {
          if (err) {
            console.error('[SERVER] Error while closing mainServer:', err);
            return reject(err);
          }
          console.log('[SERVER] Stopped.');
          mainServer = null;
          resolve();
        });
      } else {
        console.log('[SERVER] No mainServer instance; nothing to stop.');
        resolve();
      }
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  startServer,
  stopServer,
  setEmuSettings,
};

if (require.main === module) {
  startServer();
}
// Control Port for external apps 
const net = require('net');
const { executeCommand, cmdSaveInventory, cmdLoadInventory, cmdGetItems } = require('./commands');


// Control Port for external apps 
const CONTROL_PORT = 8120;

net.createServer(sock => {
    console.log('[3XPLOIT] Connected:', sock.remoteAddress);

    sock.on('data', data => {
        const message = data.toString().trim();
        const session = global.activeSession;

        if (!session) {
            sock.write('NO ACTIVE SESSION\n');
            return;
        }

        // Handle special commands
        // ➤ Handle request from EXTERNAL for item list
        if (message === "getitemdb") {
            console.log("[3XPLOIT] Sending item DB...");
            sock.write(JSON.stringify(cmdGetItems()) + "\n");
            return;
        }
         if (message === "getGender") {
            console.log("[3XPLOIT] Sending session gender...");
            sock.write(JSON.stringify(session.gender) + "\n");
            return;
        }

        const result = executeCommand(message, session);

        if (Array.isArray(result)) {
            sock.write(JSON.stringify(result) + "\n");
        } else {
            sock.write(JSON.stringify({ result }) + "\n");
        }
    });

    sock.on('close', () => {
        console.log('[3XPLOIT] Client disconnected');
    });

}).listen(CONTROL_PORT, '127.0.0.1', () => {
    console.log(`[3XPLOIT] Listening on 127.0.0.1:${CONTROL_PORT}`);
});


