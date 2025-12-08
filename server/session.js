// server/session.js
const { itemDB } = require('./itemDatabase');
const { getStarterItems } = require('./starterItems');

class SessionCrypto {
  constructor() {
    this.key = null;
  }

  init(keyBuffer) {
    this.key = keyBuffer;
  }

  decrypt(buf) {
    return buf;
  }

  encrypt(buf) {
    return buf;
  }
}

class GameSession {
  /**
   * @param {net.Socket} socket
   * @param {Object} config { characterName, gender, honeyName, eventId }
   */
  constructor(socket, config = {}) {
    this.socket = socket;
    this.state = 'INIT';
    this.crypto = new SessionCrypto();
    this.userId = 0;
    this.characterId = 1001;

    const defaults = {
      characterName: '[DEV]Kijuwoo~',
      gender: 2,
      honeyName: '',
      eventId: 5,
    };
    const cfg = { ...defaults, ...config };

    this.characterName = cfg.characterName || '[DEV]Kijuwoo~';
    this.gender = cfg.gender === 1 || cfg.gender === 2 ? cfg.gender : 2;
    this.honeyName = (cfg.honeyName || '').trim();
    this.activeEvent =
      typeof cfg.eventId === 'number' ? cfg.eventId : defaults.eventId;

    this.characterLevel = 17;
    this.honeyPoints = 500;
    this.selectedServer = 0;
    this.selectedChannel = 0;
    this.currentRoomId = null;
    this.channelListSent = false;
    this.encryptInitSent = false;
    this.inventorySent = false;
    this.nextUniqueId = 1000;
    this.timeSyncCount = 0;

    this.cumulativeScore = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.boosterGauge = 0;
    this.boosterActive = false;
    this.boosterActivationTime = 0;
    this.boosterDuration = 0;
    this.boosterBeatsLeft = 0;
    this.perfectGauge = 0;
    this.boosterMultiplier = 1;

    this.cash = 1000;
    this.points = 9000;
    this.inventory = new Map();

    const genderName = this.gender === 2 ? 'Female' : 'Male';
    console.log(
      `[SESSION] New session for ${genderName} "${this.characterName}" (event=${this.activeEvent})`
    );

    this.initializeDefaultItems();
  }

  initializeDefaultItems() {
    const genderName = this.gender === 2 ? 'Female' : 'Male';
    console.log(`[INVENTORY] Initializing for ${genderName} character`);

    const defaultSlots = [
      { slot: 0x0b, name: 'Hair' },
      { slot: 0x0c, name: 'Face' },
      { slot: 0x0d, name: 'Jacket' },
      { slot: 0x0e, name: 'Gloves' },
      { slot: 0x0f, name: 'Pants' },
      { slot: 0x10, name: 'Shoes' },
    ];

    for (const { slot, name } of defaultSlots) {
      const defaultItem = itemDB.findDefaultItem(slot, this.gender);

      if (defaultItem) {
        const key = (slot << 16) | defaultItem.itemTypeId;

        if (this.inventory.has(key)) continue;

        this.inventory.set(key, {
          uniqueId: this.getNextUniqueId(),
          slot: slot,
          category: defaultItem.category,
          itemTypeId: defaultItem.itemTypeId,
          variantId: defaultItem.variantId,
          typeFlag: defaultItem.typeFlag || 0,
          quantity: 1,
          equipped: 1,
          duration: 10000,
        });
      } else {
        console.warn(`[INVENTORY] Default ${name} not found`);
      }
    }

    const starterItems = getStarterItems(this.gender);

    for (const itemDef of starterItems) {
      const {
        category,
        itemTypeId,
        variantId = 0,
        equipped = 0,
        duration = 10000,
        quantity = 1,
      } = itemDef;

      const dbItem = itemDB.get(category, itemTypeId, variantId);
      if (!dbItem) continue;

      const key = (category << 16) | itemTypeId;
      if (this.inventory.has(key)) continue;

      this.inventory.set(key, {
        uniqueId: this.getNextUniqueId(),
        slot: category,
        category: dbItem.category,
        itemTypeId: dbItem.itemTypeId,
        variantId: dbItem.variantId,
        typeFlag: dbItem.typeFlag || 0,
        quantity: quantity,
        equipped: equipped,
        duration: duration,
      });
    }

    console.log(`[INVENTORY] Total items: ${this.inventory.size}`);
  }

  addInventoryItem(slot, itemType, itemId, quantity = 1) {
    this.inventory.set(slot, {
      uniqueId: this.getNextUniqueId(),
      slot: slot,
      type: itemType,
      itemId: itemId,
      quantity: quantity,
      equipped: 0,
    });
  }

  getInventoryItem(slot) {
    return this.inventory.get(slot);
  }

  removeInventoryItem(slot) {
    this.inventory.delete(slot);
  }

  getInventoryItemByKey(key) {
    return this.inventory.get(key);
  }

  getInventoryItemsBySlot(slot) {
    const items = [];
    for (const [key, item] of this.inventory) {
      if (item.slot === slot) {
        items.push(item);
      }
    }
    return items;
  }

  hasItem(slot, itemId) {
    const key = (slot << 16) | itemId;
    return this.inventory.has(key);
  }

  setState(newState) {
    console.log(`[SESSION] State: ${this.state} -> ${newState}`);
    this.state = newState;
  }

  reset() {
    this.encryptInitSent = false;
  }

  getCurrentRoom() {
    if (!this.currentRoomId) return null;
    return global.rooms.get(this.currentRoomId);
  }

  getNextUniqueId() {
    return this.nextUniqueId++;
  }
}

class Room {
  constructor(id, title, creatorSession) {
    this.id = id;
    this.title = title;
    this.masterId = creatorSession.characterId;
    this.stageId = 2;
    this.musicId = 1;
    this.gameMode = 10;
    this.keyMode = 0;
    this.isPrivate = 0;
    this.players = new Map();
    this.gameInProgress = false;
    this.addPlayer(creatorSession);
  }

 addPlayer(session) {
   this.players.set(session.characterId, {
     id: session.characterId,
     name: session.characterName,
     level: session.characterLevel,
     isMaster: session.characterId === this.masterId,
     socket: session.socket,
   });
 }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  broadcast(packet, excludeId = null) {
    for (const [id, player] of this.players) {
      if (id !== excludeId && player.socket) {
        player.socket.write(packet);
      }
    }
  }

  broadcastToAll(packet) {
    this.broadcast(packet, null);
  }
}

module.exports = { GameSession, Room, SessionCrypto };
