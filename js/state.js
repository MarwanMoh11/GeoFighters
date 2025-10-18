// Game States Enum
export const GameState = { MainMenu: 'MainMenu', LevelSelect: 'LevelSelect', UpgradeMenu: 'UpgradeMenu', Playing: 'Playing', Paused: 'Paused', LevelUp: 'LevelUp', Settings: 'Settings', GameOver: 'GameOver', Win: 'Win', EvolutionBook: 'EvolutionBook' };

// --- Core State Management ---
export let state = {
    currentGameState: GameState.MainMenu,
    previousGameState: GameState.MainMenu,
    previousMenuState: GameState.MainMenu,
    isPaused: true,
    isTouchDevice: false,
    gameTime: 0,
    currentLevelId: 1,

    // Performance & Core THREE objects
    objectPools: { projectiles: [], particles: [], hitEffects: [], dataFragments: [] },
    frustum: new THREE.Frustum(),
    projScreenMatrix: new THREE.Matrix4(),
    spatialGrid: null,

    // Core Game Objects
    scene: null,
    camera: null,
    renderer: null,
    player: null,
    ground: null,
    gridHelper: null,
    clock: new THREE.Clock(),

    // Audio
    audioContext: null,

    // Meta Progression
    dataCores: 0,
    baseDamageMultiplier: 1.0,

    // Player Stats & Leveling (In-Run)
    playerShield: 100,
    MAX_PLAYER_SHIELD: 100,
    score: 0,
    playerLevel: 1,
    currentXP: 0,
    xpToNextLevel: 60,
    playerWeapons: [],
    playerItems: [],
    playerCorruptionTimer: 0,
    corruptionEffectTimer: 0,
    shieldRegenTimer: 0,

    // Timers
    shapeSpawnTimer: 0,
    shapeSpawnInterval: 2.0,
    eliteSpawnTimer: 35,
    pickupSpawnTimer: 5,

    // Base Stats
    BASE_MAX_PLAYER_SHIELD: 100,
    BASE_PLAYER_SPEED: 5.0,
    BASE_XP_COLLECTION_RADIUS: 2.0,

    // Current Stats (modified by items/upgrades)
    playerSpeed: 5.0,
    xpCollectionRadius: 2.0,
    playerCritChance: 0.05,
    playerCritDamageMultiplier: 1.5,

    // Input & Aiming
    moveState: { forward: 0, backward: 0, left: 0, right: 0 },
    aimTarget: new THREE.Vector3(),
    raycaster: new THREE.Raycaster(),
    groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),

    // Touch Controls
    joystickActive: false,
    joystickPointerId: null,
    joystickRadius: 75,
    knobRadius: 30,

    movePointerId: null,      // Tracks the finger controlling movement
    aimPointerId: null,       // Tracks the finger controlling aiming
    joystickCenter: new THREE.Vector2(), // Center of the movement joystick
    aimStart: new THREE.Vector2(),       // Start position of the aim touch

    // Game Element Arrays
    shapes: [],
    projectiles: [],
    dataFragments: [],
    megaDataFragments: [],
    hitEffects: [],
    geometricCaches: [],
    repairNodes: [],
    energyCores: [],
    particles: [],
    persistentWeaponMeshes: {},
    staticLevelObjects: [],
    backgroundPattern: null,

    // XP Consolidation
    accumulatedOffScreenXP: 0,

    // Boss state
    isBossWave: false,
    nextBossTime: 300, // 5 minutes (changed from 540)
};

// --- Game Constants ---
export const CONSTANTS = {
    WORLD_BOUNDARY: 70,
    MAX_WEAPONS: 5,
    MAX_ITEMS: 5,
    CORRUPTION_DAMAGE: 1,
    CORRUPTION_INTERVAL: 0.5,

    // Radii
    PLAYER_RADIUS: 0.6,
    PLAYER_HEIGHT: 1.0,
    PROJECTILE_RADIUS: 0.1,
    DATA_FRAGMENT_RADIUS: 0.15,
    REPAIR_NODE_RADIUS: 0.2,
    ENERGY_CORE_RADIUS: 0.25,
    CACHE_RADIUS: 0.4,
    PICKUP_COLLECTION_RADIUS: 0.9,

    // Projectile Speeds
    BASE_PROJECTILE_SPEED: 10,
    BASE_DATA_FRAGMENT_SPEED: 3.5,

    // Object Pooling
    MAX_POOL_SIZE: { projectiles: 300, particles: 500, hitEffects: 50, dataFragments: 200 },

    // XP Consolidation
    MEGA_XP_THRESHOLD: 300,
    XP_CONSOLIDATION_DISTANCE: 55,
};