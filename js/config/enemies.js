export const ENEMY_TYPES = {
    // --- COMMON CYBER-MUTANTS ---
    MECH_BEAST: {
        name: 'Heavy Mech-Beast', icon: '🐺', geometryType: 'Box', size: [3.0, 3.0], color: 0xffffff,
        speed: 1.1, healthMultiplier: 2.5, xpMultiplier: 1.2, dropsCache: false,
        damageMultiplier: 1.2, cost: 2, spriteIndex: [3, 1]
    },
    SEC_DRONE: {
        name: 'Laser-eyed Drone', icon: '👁️', geometryType: 'Box', size: [2.8, 2.8], color: 0xffffff,
        speed: 3.2, healthMultiplier: 0.8, xpMultiplier: 0.5, dropsCache: false,
        damageMultiplier: 0.8, cost: 1, spriteIndex: [2, 1]
    },

    // --- ELITE MUTANTS ---
    TECH_TENTACLE: {
        name: 'Tentacle Horror', icon: '🐙', geometryType: 'Box', size: [3.2, 3.2], color: 0xffffff,
        speed: 1.0, healthMultiplier: 1.5, xpMultiplier: 1.5, dropsCache: false,
        specialAbility: 'distort', distortCooldown: 10, distortTimer: 5, damageMultiplier: 1.5, cost: 3, spriteIndex: [0, 1]
    },
    GLITCH_HORROR: {
        name: 'Glitch Wraith', icon: '👻', geometryType: 'Box', size: [3.0, 3.0], color: 0xffffff,
        speed: 1.5, healthMultiplier: 1.2, xpMultiplier: 1.0, dropsCache: false,
        specialAbility: 'split', generation: 1, damageMultiplier: 1.0, cost: 2, spriteIndex: [2, 0]
    },
    SPIDER_TANK: {
        name: 'Neon Spider Tank', icon: '🕷️', geometryType: 'Box', size: [3.5, 3.5], color: 0xffffff,
        speed: 1.8, healthMultiplier: 2.0, xpMultiplier: 1.8, dropsCache: false,
        specialAbility: 'corrupt_touch', damageMultiplier: 1.3, cost: 4, spriteIndex: [1, 0]
    },

    // --- HIGH-THREAT MONSTERS ---
    RAZOR_RAPTOR: {
        name: 'Chrome Raptor', icon: '🦖', geometryType: 'Box', size: [3.2, 3.2], color: 0xffffff,
        speed: 4.5, healthMultiplier: 2.0, xpMultiplier: 2.2, dropsCache: false,
        specialAbility: 'dash', dashSpeed: 10.0, dashDuration: 0.5, dashCooldown: 2.5, dashTimer: 2.0, isDashing: false, damageMultiplier: 2.0, cost: 6, spriteIndex: [1, 1]
    },
    CYBER_HYDRA: {
        name: 'Cyber-Hydra', icon: '🐉', geometryType: 'Box', size: [4.0, 4.0], color: 0xffffff,
        speed: 0.8, healthMultiplier: 25, xpMultiplier: 5.0, dropsCache: true,
        specialAbility: 'launch_shard', shardCooldown: 3.5, shardTimer: 2.0, deathBurstRadius: 4.0, deathBurstDamage: 40, damageMultiplier: 2.5, cost: 15, spriteIndex: [0, 0]
    },
    PLASMA_GOLEM: {
        name: 'Plasma Golem', icon: '🗿', geometryType: 'Box', size: [3.8, 3.8], color: 0xffffff,
        speed: 1.2, healthMultiplier: 18, xpMultiplier: 7.0, dropsCache: false,
        specialAbility: 'phase_shift', shiftCooldown: 4.0, shiftTimer: 2.0, damageMultiplier: 2.0, cost: 12, spriteIndex: [3, 0]
    },

    // --- SUPER-ELITES ---
    TITAN_MECH_KING: {
        name: 'Titan Mech King', icon: '👑', geometryType: 'Box', size: [10.0, 10.0], color: 0xffffff,
        speed: 5, healthMultiplier: 400.0, xpMultiplier: 200.0, dropsCache: false,
        currencyDrop: 1000, damageMultiplier: 2.5, cost: 1000, isBoss: true,
        specialAbility: 'multi_attack',
        attackPatterns: ['PULSE', 'RAPID_FIRE', 'DASH_SLAM', 'SUMMON'],
        currentAttackPattern: 'PULSE', attackState: 'MOVING', attackStateTimer: 0,
        attackCooldown: 3.5, attackCooldownTimer: 3.5,
        rapidFireBursts: 0, rapidFireBurstTimer: 0.1, rapidFireTargetPos: null,
        dashChargeTime: 0.8, dashSpeedMultiplier: 5.0, dashDuration: 0.8,
        slamRadius: 8.0, slamDamage: 80,
        pulseChargeTime: 1.0, pulseRadius: 12.0, pulseDamage: 60, pulseColor: 0xFF69B4,
        summonChargeTime: 1.2, summonCount: 4, summonType: 'SEC_DRONE', spriteIndex: [0, 2]
    }
};

// Legacy alias mapping for internal state compatibility (if needed)
export const ENEMY_ALIASES = {
    'CUBE_CRUSHER': 'MECH_BEAST',
    'TETRA_SWARMER': 'SEC_DRONE',
    'ICOSAHEDRON_INVADER': 'TECH_TENTACLE',
    'SPHERE_SPLITTER': 'GLITCH_HORROR',
    'CYLINDER_CORRUPTER': 'SPIDER_TANK',
    'PRISM_DASHER': 'RAZOR_RAPTOR',
    'CONE_CASTER': 'CYBER_HYDRA',
    'DODECAHEDRON_DRIFTER': 'PLASMA_GOLEM',
    'BOSS_OCTA_PRIME': 'TITAN_MECH_KING'
};