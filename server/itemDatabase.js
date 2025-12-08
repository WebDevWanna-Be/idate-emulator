const fs = require('fs');

const RECORD_SIZE = 0x1C8;

class ItemDatabase {
    constructor() {
        this.items = [];
        this.db = new Map();
    }
    
    load(filePath) {
        const data = fs.readFileSync(filePath);
        const itemCount = Math.floor(data.length / RECORD_SIZE);
        
        console.log(`[ItemDB] Loading ${itemCount} items from ${filePath}`);
        
        for (let i = 0; i < itemCount; i++) {
            const offset = i * RECORD_SIZE;
            const record = data.slice(offset, offset + RECORD_SIZE);
            
            const nameBuffer = record.slice(0x64, 0xC8);
            let name = '';
            for (let j = 0; j < nameBuffer.length; j += 2) {
                const charCode = nameBuffer.readUInt16LE(j);
                if (charCode === 0) break;  
                if (charCode >= 0x20 && charCode < 0xFFFE) {
                    name += String.fromCharCode(charCode);
                }
            }
            
            const item = {
                category: record.readUInt16LE(0x00),
                itemTypeId: record.readUInt16LE(0x02),
                variantId: record.readInt16LE(0x04),
                validity: record.readInt16LE(0x06),
                typeFlag: record.readUInt8(0x0C),        
                setItemId: record.readInt32LE(0x38),
                name: name.trim(),  // ⭐ 
            };
            
            this.items.push(item);
            
            const key = `${item.category}:${item.itemTypeId}:${item.variantId}`;
            this.db.set(key, item);
            
            if (i < 5) {
                console.log(`  Item ${i}: cat=${item.category}, type=${item.itemTypeId}, var=${item.variantId}, flag=${item.typeFlag}, name="${item.name}"`);
            }
        }
        
        console.log(`[ItemDB] Loaded ${this.items.length} items\n`);
    }
    
    exists(category, typeId, variantId) {
        const key = `${category}:${typeId}:${variantId}`;
        return this.db.has(key);
    }
    
    get(category, typeId, variantId) {
        const key = `${category}:${typeId}:${variantId}`;
        return this.db.get(key);
    }
    
    findDefaultItem(category, gender = 1) {
        
        const defaultTypeId = gender; 
        
        let item = this.items.find(item => 
            item.category === category && 
            item.itemTypeId === defaultTypeId
        );
        
        if (item) {
            console.log(`[ItemDB] Found default for cat=0x${category.toString(16)}, gender=${gender}: "${item.name}" (type=${item.itemTypeId}, var=${item.variantId})`);
            return item;
        }

        item = this.items.find(item => 
            item.category === category && 
            item.itemTypeId % 2 === gender % 2  
        );
        
        if (item) {
            console.log(`[ItemDB] Found fallback for cat=0x${category.toString(16)}, gender=${gender}: "${item.name}" (type=${item.itemTypeId})`);
            return item;
        }
        
        console.log(`[ItemDB] No default found for cat=0x${category.toString(16)}, gender=${gender}`);
        return null;
    }
    
    getByCategory(category) {
        return this.items.filter(item => item.category === category);
    }

    getBySetId(setItemId) {
    return this.items.filter(item => item.setItemId === setItemId);
    }

    findByTypeId(category, typeId) {
    return this.items.find(item => 
        item.category === category && 
        item.itemTypeId === typeId
    );
    }
}

const itemDB = new ItemDatabase();

module.exports = { itemDB };