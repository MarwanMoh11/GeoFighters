export const ENEMY_TYPES = {
    // --- COMMON HORDE ENEMIES ---
    CUBE_CRUSHER: {
        name: 'Cube Crusher', icon: '⬜', geometryType: 'Box', size: [0.8, 0.8, 0.8], color: 0xcc3333,
        emissive: 0x660000, emissiveIntensity: 0.3, roughness: 0.4, metalness: 0.2,
        speed: 1.3, healthMultiplier: 1, xpMultiplier: 0.7, dropsCache: false,
        specialAbility: null, damageMultiplier: 0.7, cost: 1
    },
    TETRA_SWARMER: {
        name: 'Tetra Swarmer', icon: 'tetrahedral', geometryType: 'Tetrahedron', size: [0.4, 0], color: 0x9A1F1F,
        emissive: 0x4A0000, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.1,
        speed: 3.6, healthMultiplier: 1, xpMultiplier: 0.4, dropsCache: false,
        specialAbility: null, damageMultiplier: 0.6, cost: 0.5
    },

    // --- SLIGHTLY TOUGHER / MORE NUMEROUS HORDE ---
    ICOSAHEDRON_INVADER: {
        name: 'Icosahedron Invader', icon: '🌐', geometryType: 'Icosahedron', size: [0.6, 0], color: 0x4B5320,
        emissive: 0x1F2F00, emissiveIntensity: 0.35, roughness: 0.5, metalness: 0.3,
        speed: 1.2, healthMultiplier: 1.0, xpMultiplier: 0.8, dropsCache: false,
        specialAbility: 'distort', distortCooldown: 12, distortTimer: 6 + Math.random() * 6, damageMultiplier: 0.8, cost: 1.5
    },
    SPHERE_SPLITTER: {
        name: 'Sphere Splitter', icon: '⚪', geometryType: 'Sphere', size: [0.5, 12, 8], color: 0x98FB98,
        emissive: 0x2F8B2F, emissiveIntensity: 0.4, roughness: 0.2, metalness: 0.4,
        speed: 1.0, healthMultiplier: 1.0, xpMultiplier: 0.6, dropsCache: false,
        specialAbility: 'split', generation: 1, damageMultiplier: 0.4, cost: 1.2
    },
    CYLINDER_CORRUPTER: {
        name: 'Cylinder Corrupter', icon: '🐛', geometryType: 'Cylinder', size: [0.3, 0.3, 1.0, 8], color: 0x4F4F4F,
        emissive: 0x00FF00, emissiveIntensity: 0.5, roughness: 0.6, metalness: 0.2,
        speed: 2.0, healthMultiplier: 1.0, xpMultiplier: 0.9, dropsCache: false,
        specialAbility: 'corrupt_touch', damageMultiplier: 0.5, cost: 2
    },

    // --- SPECIAL ABILITY / MID-TIER ENEMIES ---
    PRISM_DASHER: {
        name: 'Prism Dasher', icon: '🔶', geometryType: 'Cylinder', size: [0.35, 1.5, 0.35, 6], color: 0xB0C4DE,
        emissive: 0x4060A0, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.7,
        speed: 0, healthMultiplier: 1.5, xpMultiplier: 1.2, dropsCache: false,
        specialAbility: 'dash', dashSpeed: 7.0, dashDuration: 0.45, dashCooldown: 2.8, dashTimer: 1.5 + Math.random(), isDashing: false, damageMultiplier: 1.2, cost: 3
    },
    CONE_CASTER: {
        name: 'Cone Caster', icon: '🗼', geometryType: 'Cone', size: [0.45, 1.3, 8], color: 0xB8860B,
        emissive: 0xFF6600, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.5,
        speed: 1.0, healthMultiplier: 1.5, xpMultiplier: 1.3, dropsCache: false,
        specialAbility: 'launch_shard', shardCooldown: 4.5, shardTimer: Math.random() * 4.5, deathBurstRadius: 2.0, deathBurstDamage: 10, damageMultiplier: 0.9, cost: 3.5
    },
    DODECAHEDRON_DRIFTER: {
        name: 'Dodecahedron Drifter', icon: '✨', geometryType: 'Dodecahedron', size: [0.6, 0], color: 0x181818,
        emissive: 0x8800FF, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.6,
        speed: 1.7, healthMultiplier: 1.0, xpMultiplier: 1.5, dropsCache: false,
        specialAbility: 'phase_shift', shiftCooldown: 5.5, shiftTimer: Math.random() * 5.5, damageMultiplier: 1.0, cost: 4
    },

    // --- ELITE / TANK ENEMIES ---
    PYRAMID_PIERCER: {
        name: 'Pyramid Piercer', icon: '🔺', geometryType: 'Cone', size: [0.7, 1.8, 4], color: 0xcc6600,
        emissive: 0xFF3300, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.6,
        speed: 0.9, healthMultiplier: 12, xpMultiplier: 2.8, dropsCache: true,
        specialAbility: null, damageMultiplier: 1.2, cost: 7
    },
    OCTAHEDRON_OBSTACLE: {
        name: 'Octahedron Obstacle', icon: '🛑', geometryType: 'Octahedron', size: [0.8, 0], color: 0x696969,
        emissive: 0x333333, emissiveIntensity: 0.3, roughness: 0.7, metalness: 0.3,
        speed: 0.5, healthMultiplier: 16, xpMultiplier: 4.0, dropsCache: false,
        specialAbility: 'tough', damageMultiplier: 1.0, cost: 12
    },
    BOSS_OCTA_PRIME: {
        name: 'Octa Prime', icon: '💠', geometryType: 'Octahedron', size: [3.0, 0], color: 0xFF1493,
        roughness: 0.3, metalness: 0.4, emissive: 0x8B008B, emissiveIntensity: 0.6, flatShading: false,
        speed: 6, healthMultiplier: 250.0, xpMultiplier: 100.0, dropsCache: false,
        currencyDrop: 500 + Math.floor(Math.random() * 251), damageMultiplier: 1.1, cost: 500, isBoss: true,
        specialAbility: 'multi_attack',
        attackPatterns: ['PULSE', 'RAPID_FIRE', 'DASH_SLAM', 'SUMMON'],
        currentAttackPattern: 'PULSE', attackState: 'MOVING', attackStateTimer: 0,
        attackCooldown: 4.0, attackCooldownTimer: 4.0,
        rapidFireBursts: 0, rapidFireBurstTimer: 0, rapidFireTargetPos: null,
        dashChargeTime: 1.0, dashSpeedMultiplier: 4.0, dashDuration: 0.6,
        slamRadius: 5.0, slamDamage: 50,
        pulseChargeTime: 1.2, pulseRadius: 8.0, pulseDamage: 35, pulseColor: 0xFF69B4,
        summonChargeTime: 1.5, summonCount: 3, summonType: 'CYLINDER_CORRUPTER'
    }
};