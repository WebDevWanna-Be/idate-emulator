const { itemDB } = require('./itemDatabase');
const { OP } = require('./packets');
const { writeWString } = require('./helpers');

const fs = require('fs');
const path = require('path');
const CATEGORY_NAMES = {
    0x0B: "Hair",
    0x0C: "Face",
    0x0D: "Jacket",
    0x0E: "Gloves",
    0x0F: "Pants",
    0x10: "Shoes",
    0x1F: "Bracelet",
    0x20: "Bag",
    0x21: "Glasses",
    0x22: "Earring",
    0x23: "Particle",
    0x24: "Title",
    0x25: "Pet",
    0x26: "Nick Color",
    0x27: "Chat Color",
    0x28: "Set Item"
};

function cmdGetItems() {
    return itemDB.items.map(i => ({
        category: i.category,
        categoryName: CATEGORY_NAMES[i.category] || `Cat ${i.category}`,
        itemTypeId: i.itemTypeId,
        variantId: i.variantId,
        name: i.name
    }));
}



// Helper function to get the correct filename
function getInventoryFilename(session) {
    if (session && session.gender === 1) {
        return 'MaleSettings.json';
    }
    // Default to Female for gender 2 or if undefined
    return 'FemaleSettings.json';
}

function cmdSaveInventory(args, session) {
    try {
        if (!session) return "Error: No session found to save.";

        const items = Array.from(session.inventory.values());
        
        // Determine filename based on gender
        const filename = getInventoryFilename(session);
        const savePath = path.join(__dirname, filename);

        fs.writeFileSync(savePath, JSON.stringify(items, null, 2), 'utf8');

        console.log(`[3XPLOIT -SAVEINV] Saved ${items.length} items to ${filename}`);
        return `Inventory saved to ${filename} (${items.length} items)`;

    } catch (err) {
        console.error('[3XPLOIT -SAVEINV] ERROR:', err);
        return `Failed to save inventory: ${err.message}`;
    }
}

function cmdLoadInventory(args, session) {
    try {
        if (!session) return "Error: No session found to load.";

        // Determine filename based on gender
        const filename = getInventoryFilename(session);
        const loadPath = path.join(__dirname, filename);

        if (!fs.existsSync(loadPath)) {
            console.log(`[3XPLOIT -LOADINV] File not found: ${filename}`);
            return `No ${filename} found.`;
        }

        const data = JSON.parse(fs.readFileSync(loadPath, 'utf8'));

        session.inventory.clear();
        let nextUID = session.nextUniqueId;

        data.forEach(item => {
            item.uniqueId = nextUID++;
            session.inventory.set(
                (item.category << 16) | item.itemTypeId,
                item
            );
        });

        console.log(`[3XPLOIT -LOADINV] Loaded ${data.length} items from ${filename}`);
        return `Loaded ${data.length} items from ${filename}.`;

    } catch (err) {
        console.error('[3XPLOIT -LOADINV] ERROR:', err);
        return `Failed to load: ${err.message}`;
    }
}


function isItemForGender(item, gender) {
    const itemGender = (item.itemTypeId % 2 === 0) ? 2 : 1;
    return itemGender === gender;
}

function getCorrectVariantForGender(category, itemTypeId, gender) {
    const requestedGender = (itemTypeId % 2 === 0) ? 2 : 1;
    
    if (requestedGender === gender) {
        let item = itemDB.get(category, itemTypeId, 0);
        if (item) return item;
        
        item = itemDB.get(category, itemTypeId, gender);
        if (item) return item;
        
        const found = itemDB.items.find(i => 
            i.category === category && 
            i.itemTypeId === itemTypeId
        );
        if (found) return found;
    }
    
    let correctedTypeId;
    if (gender === 1) {
        correctedTypeId = (itemTypeId % 2 === 0) ? itemTypeId - 1 : itemTypeId;
    } else {
        correctedTypeId = (itemTypeId % 2 === 0) ? itemTypeId : itemTypeId + 1;
    }
    
    let item = itemDB.get(category, correctedTypeId, 0);
    if (item) return item;
    
    item = itemDB.get(category, correctedTypeId, gender);
    if (item) return item;
    
    const found = itemDB.items.find(i => 
        i.category === category && 
        i.itemTypeId === correctedTypeId
    );
    if (found) return found;
    
    return null;
}

function cmdAddItem(args, session) {
    if (!session) {
        return 'ERROR: No active session';
    }
    
    const category = parseInt(args[0]);
    const itemTypeId = parseInt(args[1]);
    const variantId = args[2] ? parseInt(args[2]) : null;
    
    if (isNaN(category) || isNaN(itemTypeId)) {
        return 'Usage: \\additem <category> <typeId> [variantId]';
    }
    
    let item;
    
    if (variantId !== null) {
        item = itemDB.get(category, itemTypeId, variantId);
        if (!item && (category === 0x26 || category === 0x27)) {
            item = itemDB.items.find(i => 
                i.category === category && 
                i.itemTypeId === itemTypeId
            );
        }
    } else {
        item = getCorrectVariantForGender(category, itemTypeId, session.gender);
        if (!item && (category === 0x26 || category === 0x27)) {
            item = itemDB.items.find(i => 
                i.category === category && 
                i.itemTypeId === itemTypeId
            );
        }
    }
    
    if (!item) {
        return `Item not found: cat=${category} type=${itemTypeId} var=${variantId || 'auto'}`;
    }
    
    if (!isItemForGender(item, session.gender)) {
        const genderName = session.gender === 1 ? 'Male' : 'Female';
        const itemGender = (item.itemTypeId % 2 === 0) ? 'Female' : 'Male';
        return `Wrong gender: "${item.name}" is ${itemGender}, you are ${genderName}`;
    }
    
    const inventoryKey = (category << 16) | item.itemTypeId;
    const uniqueId = session.getNextUniqueId();
    
    session.inventory.set(inventoryKey, {
        uniqueId: uniqueId,
        slot: category,
        category: item.category,
        itemTypeId: item.itemTypeId,
        variantId: item.variantId,
        typeFlag: item.typeFlag || 0,
        quantity: 1,
        equipped: 0,
        duration: 10000,
    });
    
    console.log(`[INVENTORY] Added: "${item.name}" (cat=${item.category}, type=${item.itemTypeId}, var=${item.variantId}, uniqueId=${uniqueId})`);
    
    return `Added: "${item.name}" (ID=${uniqueId})`;
}

function cmdAddSet(args, session) {
    if (!session) {
        return 'ERROR: No active session';
    }
    
    const setName = args.join(' ');
    
    if (!setName) {
        return 'Usage: \\addset <setName> | Example: \\addset Kunoichi';
    }
    
    const genderName = session.gender === 1 ? 'Male' : 'Female';
    console.log(`[COMMAND] Searching for set: "${setName}"... (Gender: ${genderName})`);
    
    const matchingBoxes = itemDB.items.filter(i => 
        i.name.toLowerCase().includes(setName.toLowerCase()) && 
        i.typeFlag === 3
    );
    
    if (matchingBoxes.length === 0) {
        return `Set "${setName}" not found. Use \\listsets to see all`;
    }
    
    console.log(`[COMMAND] Found ${matchingBoxes.length} matching boxes`);
    
    let selectedBox = null;
    let selectedPieces = [];
    
    for (const box of matchingBoxes) {
        const pieces = itemDB.items.filter(i => 
            i.validity === box.validity && 
            i.validity !== 0 &&
            i.typeFlag !== 3 &&
            isItemForGender(i, session.gender)
        );
        
        console.log(`[COMMAND] Box: "${box.name}" (validity=${box.validity}) has ${pieces.length} pieces for ${genderName}`);
        
        if (pieces.length > 0) {
            selectedBox = box;
            selectedPieces = pieces;
            break;
        }
    }
    
    if (!selectedBox || selectedPieces.length === 0) {
        return `"${setName}" has no items for ${genderName}. Try different set.`;
    }
    
    console.log(`[COMMAND] Using box: "${selectedBox.name}" with ${selectedPieces.length} pieces`);
    
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const piece of selectedPieces) {
        const inventoryKey = (piece.category << 16) | piece.itemTypeId;
        
        if (session.inventory.has(inventoryKey)) {
            skippedCount++;
            continue;
        }
        
        const uniqueId = session.getNextUniqueId();
        
        session.inventory.set(inventoryKey, {
            uniqueId: uniqueId,
            slot: piece.category,
            category: piece.category,
            itemTypeId: piece.itemTypeId,
            variantId: piece.variantId,
            typeFlag: piece.typeFlag,
            quantity: 1,
            equipped: 0,
            duration: 10000,
        });
        
        console.log(`[COMMAND] Added: "${piece.name}" (type=${piece.itemTypeId})`);
        addedCount++;
    }
    
    return `Added ${addedCount}/${selectedPieces.length} items from "${selectedBox.name}" (${skippedCount} owned)`;
}

function cmdListSets(args, session) {
    const sets = itemDB.items.filter(i => i.typeFlag === 3);
    
    if (sets.length === 0) {
        return 'No sets found in database';
    }
    
    const ITEMS_PER_PAGE = 5;
    const page = args && args[0] ? parseInt(args[0]) : 1;
    const totalPages = Math.ceil(sets.length / ITEMS_PER_PAGE);
    
    if (page < 1 || page > totalPages) {
        return `Invalid page. Use 1-${totalPages}`;
    }
    
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, sets.length);
    const pageSets = sets.slice(startIdx, endIdx);
    
    const lines = [];
    lines.push(`Sets (${page}/${totalPages}):`);
    
    for (const set of pageSets) {
        const pieces = itemDB.items.filter(i => 
            i.validity === set.validity && 
            i.validity !== 0 &&
            i.typeFlag !== 3 &&
            isItemForGender(i, session.gender)
        );
        
        const num = startIdx + pageSets.indexOf(set) + 1;
        const marker = pieces.length > 0 ? '+' : '-';
        lines.push(`${marker} ${num}. ${set.name} (${pieces.length} items)`);
    }
    
    if (page < totalPages) {
        lines.push(`Type \\listsets ${page + 1} for more`);
    } else {
        lines.push(`+ = has items for you, - = wrong gender`);
    }
    
    return lines;
}

function cmdSearch(args, session) {
    if (args.length === 0) {
        return 'Usage: \\search <keyword> [page]';
    }
    
    const lastArg = args[args.length - 1];
    const isPageNumber = /^\d+$/.test(lastArg);
    
    let keyword, page;
    
    if (isPageNumber && args.length > 1) {
        page = parseInt(lastArg);
        keyword = args.slice(0, -1).join(' ').toLowerCase();
    } else {
        page = 1;
        keyword = args.join(' ').toLowerCase();
    }
    
    console.log(`[COMMAND] Searching for: "${keyword}"...`);
    
    const results = itemDB.items.filter(i => 
        i.name.toLowerCase().includes(keyword) &&
        isItemForGender(i, session.gender)
    );
    
    if (results.length === 0) {
        return `No items found for "${keyword}"`;
    }
    
    const ITEMS_PER_PAGE = 5;
    const totalPages = Math.ceil(results.length / ITEMS_PER_PAGE);
    
    if (page < 1 || page > totalPages) {
        return `Invalid page. Use 1-${totalPages}`;
    }
    
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, results.length);
    const pageResults = results.slice(startIdx, endIdx);
    
    const lines = [];
    lines.push(`Search "${keyword}" (${page}/${totalPages}):`);
    
    for (const item of pageResults) {
        lines.push(`"${item.name}" - cat=${item.category} type=${item.itemTypeId}`);
    }
    
    if (page < totalPages) {
        lines.push(`Type \\search ${keyword} ${page + 1} for more`);
    }
    
    return lines;
}

function cmdGiveAll(args, session) {
    if (!session) {
        return 'ERROR: No active session';
    }
    
    const category = parseInt(args[0]);
    
    if (isNaN(category)) {
        return 'Usage: \\giveall <category> | Example: \\giveall 11';
    }
    
    const items = itemDB.getByCategory(category);
    
    if (items.length === 0) {
        return `No items found in category ${category}`;
    }
    
    console.log(`[COMMAND] Adding all items from category ${category}...`);
    
    let addedCount = 0;
    let skippedCount = 0;
    let boxCount = 0;
    let wrongGenderCount = 0;
    
    for (const item of items) {
        if (item.typeFlag === 3) {
            boxCount++;
            continue;
        }
        
        if (!isItemForGender(item, session.gender)) {
            wrongGenderCount++;
            continue;
        }
        
        const inventoryKey = (item.category << 16) | item.itemTypeId;
        
        if (session.inventory.has(inventoryKey)) {
            skippedCount++;
            continue;
        }
        
        const uniqueId = session.getNextUniqueId();
        
        session.inventory.set(inventoryKey, {
            uniqueId: uniqueId,
            slot: item.category,
            category: item.category,
            itemTypeId: item.itemTypeId,
            variantId: item.variantId,
            typeFlag: item.typeFlag || 0,
            quantity: 1,
            equipped: 0,
            duration: 10000,
        });
        
        addedCount++;
    }
    
    return `Added ${addedCount} items (${skippedCount} owned, ${wrongGenderCount} wrong gender)`;
}

function cmdInventory(args, session) {
    if (!session) {
        return 'ERROR: No active session';
    }
    
    if (session.inventory.size === 0) {
        return 'Inventory is empty';
    }
    
    const byCategory = new Map();
    
    for (const [key, item] of session.inventory) {
        const catName = {
            0x0B: 'Hair',
            0x0C: 'Face',
            0x0D: 'Jacket',
            0x0E: 'Gloves',
            0x0F: 'Pants',
            0x10: 'Shoes',
            0x1F: 'Bracelet',
            0x20: 'Bag',
            0x21: 'Glasses',
            0x22: 'Earring',
            0x23: 'Particle',
            0x24: 'Title',
            0x25: 'Pet',
            0x26: 'Nick Color',
            0x27: 'Chat Color',
            0x28: 'Set Item',
        }[item.category] || `Cat ${item.category}`;
        
        if (!byCategory.has(catName)) {
            byCategory.set(catName, []);
        }
        
        byCategory.get(catName).push(item);
    }
    
    const categories = Array.from(byCategory.entries());
    
    const CATS_PER_PAGE = 3;
    const page = args && args[0] ? parseInt(args[0]) : 1;
    const totalPages = Math.ceil(categories.length / CATS_PER_PAGE);
    
    if (page < 1 || page > totalPages) {
        return `Invalid page. Use 1-${totalPages}`;
    }
    
    const startIdx = (page - 1) * CATS_PER_PAGE;
    const endIdx = Math.min(startIdx + CATS_PER_PAGE, categories.length);
    const pageCategories = categories.slice(startIdx, endIdx);
    
    const lines = [];
    lines.push(`Inventory (${page}/${totalPages}) - Total: ${session.inventory.size}`);
    
    for (const [catName, items] of pageCategories) {
        lines.push(`${catName}: ${items.length} items`);
        
        for (const item of items.slice(0, 2)) {
            const dbItem = itemDB.get(item.category, item.itemTypeId, item.variantId);
            const name = dbItem ? dbItem.name : `type=${item.itemTypeId}`;
            const equipped = item.equipped ? ' [E]' : '';
            lines.push(`  - ${name}${equipped}`);
        }
        
        if (items.length > 2) {
            lines.push(`  ... +${items.length - 2} more`);
        }
    }
    
    if (page < totalPages) {
        lines.push(`Type \\inv ${page + 1} for next page`);
    }
    
    return lines;
}

function cmdHelp(args) {
    const page = args && args[0] ? parseInt(args[0]) : 1;
    
    const lines = [];
    
    switch (page) {
        case 1:
            lines.push('Commands (1/3):');
            lines.push('\\additem <cat> <type> - Add item');
            lines.push('\\addset <name> - Add set');
            lines.push('\\listsets [page] - List sets');
            lines.push('Type \\help 2 for more');
            break;

        case 2:
            lines.push('Commands (2/3):');
            lines.push('\\search <keyword> [page] - Search items');
            lines.push('\\giveall <category> - Add all items');
            lines.push('Type \\help 3 for more');
            break;

        case 3:
            lines.push('Commands (3/3):');
            lines.push('\\inv [page] - Show inventory');
            lines.push('Note: Odd typeId=Male, Even=Female');
            lines.push('Type \\help 1 to restart');
            break;

        default:
            return 'Use \\help 1, \\help 2 or \\help 3';
    }
    
    return lines;
}

function executeCommand(message, session) {
    if (!message.startsWith('\\')) {
        return null;
    }
    
    const parts = message.slice(1).split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    console.log(`[COMMAND] Executing: \\${cmd} ${args.length > 0 ? args.join(' ') : ''}`);
    
    let result;
    
    switch (cmd) {
        case 'additem':
            result = cmdAddItem(args, session);
            break;
        
        case 'addset':
            result = cmdAddSet(args, session);
            break;
        
        case 'listsets':
            result = cmdListSets(args, session);
            break;
        
        case 'search':
            result = cmdSearch(args, session);
            break;
        
        case 'giveall':
            result = cmdGiveAll(args, session);
            break;
        
        case 'inv':
        case 'inventory':
            result = cmdInventory(args, session);
            break;
        
        case 'help':
        case '?':
            result = cmdHelp(args);
            break;
        case 'saveinv':
        case 'saveinventory':
            result = cmdSaveInventory(args, session);
            break;
        case 'loadinv':
        case 'loadinventory':
            result = cmdLoadInventory(args, session);
            break;
        default:
            result = `Unknown command: \\${cmd} | Type \\help for commands`;
            break;
    }
    
    return result;
}

module.exports = {
    executeCommand,
    isItemForGender,
    getCorrectVariantForGender,
    cmdSaveInventory,
    cmdLoadInventory,
    cmdGetItems
};
