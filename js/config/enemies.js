// =============================================================================
// ENEMY CONFIGURATION - Cyberpunk Monster Sprite Sheet
// =============================================================================
// Sprite Sheet Layout (4x4 grid, 512x512):
//   Row 0: [0,0] Plasma Dragon | [1,0] Spider Mech | [2,0] Glitch Specter | [3,0] Heavy Golem
//   Row 1: [0,1] Tentacle Beast | [1,1] Raptor Strike | [2,1] Drone Eye | [3,1] Cyber Wolf
//   Row 2-3 (Bottom Half): Titan Overlord Boss (left ~60%) | Utility sprites (right ~40%)
// =============================================================================

export const ENEMY_TYPES = {
    // === ROW 0 ENEMIES ===

    PLASMA_DRAGON: {
        name: 'Plasma Dragon',
        icon: '🐉',
        size: [4.0, 4.0],
        color: 0xffffff,
        speed: 0.9,
        healthMultiplier: 8.0,
        xpMultiplier: 4.0,
        damageMultiplier: 2.0,
        dropsCache: false,
        cost: 12,
        spriteIndex: [0, 0],
        // Mini-boss behavior: shoots projectiles
        specialAbility: 'shoot',
        shootCooldown: 2.5,
        shootTimer: 2.0
    },

    SPIDER_MECH: {
        name: 'Spider Mech',
        icon: '🕷️',
        size: [3.5, 3.5],
        color: 0xffffff,
        speed: 1.2,
        healthMultiplier: 3.5,
        xpMultiplier: 2.0,
        damageMultiplier: 1.4,
        dropsCache: false,
        cost: 5,
        spriteIndex: [1, 0]
    },

    GLITCH_SPECTER: {
        name: 'Glitch Specter',
        icon: '👻',
        size: [3.0, 3.0],
        color: 0xffffff,
        speed: 1.6,
        healthMultiplier: 1.2,
        xpMultiplier: 1.2,
        damageMultiplier: 1.0,
        dropsCache: false,
        cost: 3,
        spriteIndex: [2, 0],
        // Splits into 2 smaller versions on death
        specialAbility: 'split',
        generation: 1
    },

    HEAVY_GOLEM: {
        name: 'Heavy Golem',
        icon: '🗿',
        size: [4.0, 4.0],
        color: 0xffffff,
        speed: 0.6,
        healthMultiplier: 6.0,
        xpMultiplier: 3.0,
        damageMultiplier: 2.2,
        dropsCache: false,
        cost: 8,
        spriteIndex: [3, 0]
    },

    // === ROW 1 ENEMIES ===

    TENTACLE_BEAST: {
        name: 'Tentacle Beast',
        icon: '🐙',
        size: [3.2, 3.2],
        color: 0xffffff,
        speed: 1.0,
        healthMultiplier: 2.0,
        xpMultiplier: 1.5,
        damageMultiplier: 1.2,
        dropsCache: false,
        cost: 4,
        spriteIndex: [0, 1]
    },

    RAPTOR_STRIKE: {
        name: 'Raptor Strike',
        icon: '🦖',
        size: [3.2, 3.2],
        color: 0xffffff,
        speed: 2.8,
        healthMultiplier: 1.5,
        xpMultiplier: 1.8,
        damageMultiplier: 1.8,
        dropsCache: false,
        cost: 5,
        spriteIndex: [1, 1]
    },

    DRONE_EYE: {
        name: 'Drone Eye',
        icon: '👁️',
        size: [2.5, 2.5],
        color: 0xffffff,
        speed: 2.2,
        healthMultiplier: 0.8,
        xpMultiplier: 0.6,
        damageMultiplier: 0.7,
        dropsCache: false,
        cost: 1,
        spriteIndex: [2, 1]
    },

    CYBER_WOLF: {
        name: 'Cyber Wolf',
        icon: '🐺',
        size: [3.0, 3.0],
        color: 0xffffff,
        speed: 2.5,
        healthMultiplier: 1.8,
        xpMultiplier: 1.2,
        damageMultiplier: 1.3,
        dropsCache: false,
        cost: 3,
        spriteIndex: [3, 1]
    },

    // === BOSS (Bottom Half - Left Side) ===

    TITAN_OVERLORD: {
        name: 'Titan Overlord',
        icon: '👑',
        size: [12.0, 12.0],
        color: 0xffffff,
        speed: 1.5,
        healthMultiplier: 500.0,
        xpMultiplier: 250.0,
        damageMultiplier: 3.0,
        dropsCache: false,
        currencyDrop: 1500,
        cost: 1000,
        isBoss: true,
        spriteIndex: [0, 2], // Uses custom UV mapping for larger sprite
        bossUVWidth: 0.6,    // Takes 60% of sheet width
        bossUVHeight: 0.5,   // Takes 50% of sheet height (bottom half)
        // Boss attack patterns
        attackPatterns: ['PULSE', 'RAPID_FIRE', 'SLAM', 'SUMMON'],
        attackCooldown: 3.0,
        pulseRadius: 14.0,
        pulseDamage: 70,
        slamRadius: 10.0,
        slamDamage: 90,
        summonCount: 5,
        summonType: 'DRONE_EYE'
    }
};

// Elite spawn configuration
export const ELITE_CONFIG = {
    spawnChance: 0.007,       // 0.7% chance - averages ~10 elites per 10-min game
    healthMultiplier: 5.0,    // 5x more health
    sizeMultiplier: 1.3,      // 30% larger
    glowColor: 0xFFD700,      // Golden glow
    glowIntensity: 2.0,
    guaranteedCacheDrop: true
};

// All regular enemy types (for spawning/timeline)
export const REGULAR_ENEMY_TYPES = [
    'CYBER_WOLF',
    'DRONE_EYE',
    'TENTACLE_BEAST',
    'GLITCH_SPECTER',
    'SPIDER_MECH',
    'RAPTOR_STRIKE',
    'PLASMA_DRAGON',
    'HEAVY_GOLEM'
];

// Enemy tier groupings for spawn timeline
export const ENEMY_TIERS = {
    COMMON: ['DRONE_EYE', 'CYBER_WOLF'],
    UNCOMMON: ['TENTACLE_BEAST', 'GLITCH_SPECTER', 'RAPTOR_STRIKE'],
    ELITE: ['SPIDER_MECH', 'HEAVY_GOLEM'],
    MINIBOSS: ['PLASMA_DRAGON']
};