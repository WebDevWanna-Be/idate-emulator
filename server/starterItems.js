const CATEGORIES = {
    NORMAL:         0x01,
    NORMAL_PERIOD:  0x02,  
    
    HAIR:           0x0B,   // 11
    FACE:           0x0C,   // 12
    JACKET:         0x0D,   // 13
    GLOVES:         0x0E,   // 14
    PANTS:          0x0F,   // 15
    SHOES:          0x10,   // 16
  
    BRACELET:       0x1F,   // 31
    BAG:            0x20,   // 32
    GLASSES:        0x21,   // 33
    EARRING:        0x22,   // 34
    PARTICLE:       0x23,   // 35
    TITLE:          0x24,   // 36
    PET:            0x25,   // 37 
    NICK_COLOR:     0x26,   // 38
    CHAT_COLOR:     0x27,   // 39 
    SETITEM:        0x28,   // 40 
};

const SHARED_ITEMS = [ //works both gender
    
    // Example: Glasses
    // { category: CATEGORIES.GLASSES, itemTypeId: 1, variantId: 0 },
    
    // Example: Particle effect
    // { category: CATEGORIES.PARTICLE, itemTypeId: 5, variantId: 0 },
    
    // Example: Title
    // { category: CATEGORIES.TITLE, itemTypeId: 1, variantId: 0 },
    
    // Example: Some consumable item
    // { category: CATEGORIES.NORMAL, itemTypeId: 10, variantId: 0, quantity: 5 }
    
    // Example: A set item (typeFlag=3 in database)
    // { category: CATEGORIES.NORMAL, itemTypeId: 100, variantId: 0 },
];

const MALE_ITEMS = [
    { category: CATEGORIES.JACKET, itemTypeId: 10305, variantId: 0 },
    { category: CATEGORIES.JACKET, itemTypeId: 10307, variantId: 0 },
    { category: CATEGORIES.BAG, itemTypeId: 10107, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10001, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10003, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10005, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10007, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10009, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10011, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10013, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10015, variantId: 0 },
];

const FEMALE_ITEMS = [
    { category: CATEGORIES.JACKET, itemTypeId: 10306, variantId: 0 },
    { category: CATEGORIES.JACKET, itemTypeId: 10308, variantId: 0 },
    { category: CATEGORIES.BAG, itemTypeId: 10108, variantId: 0 },

    { category: CATEGORIES.PET, itemTypeId: 10002, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10004, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10006, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10008, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10010, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10012, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10014, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10016, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10018, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10020, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10022, variantId: 0 },
    { category: CATEGORIES.PET, itemTypeId: 10024, variantId: 0 },
];

/**
 * Get all starter items for a specific gender
 * @param {number} gender - 1 = Male, 2 = Female
 * @returns {Array} Array of item definitions
 */
function getStarterItems(gender) {
    const genderItems = gender === 2 ? FEMALE_ITEMS : MALE_ITEMS;
    return [...SHARED_ITEMS, ...genderItems];
}

/**
 * Get item count summary
 * @param {number} gender - 1 = Male, 2 = Female
 * @returns {Object} Count summary
 */
function getStarterItemsSummary(gender) {
    const items = getStarterItems(gender);
    const summary = {
        total: items.length,
        shared: SHARED_ITEMS.length,
        genderSpecific: gender === 2 ? FEMALE_ITEMS.length : MALE_ITEMS.length,
        byCategory: {},
    };
    
    for (const item of items) {
        const catName = Object.keys(CATEGORIES).find(k => CATEGORIES[k] === item.category) || `0x${item.category.toString(16)}`;
        summary.byCategory[catName] = (summary.byCategory[catName] || 0) + 1;
    }
    
    return summary;
}

module.exports = {
    CATEGORIES,
    SHARED_ITEMS,
    MALE_ITEMS,
    FEMALE_ITEMS,
    getStarterItems,
    getStarterItemsSummary,
};