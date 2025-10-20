import * as THREE from 'three';

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

    // --- ADD THESE 3 LINES ---
    instancedMeshes: {}, // Will hold one InstancedMesh per enemy type
    dummy: new THREE.Object3D(), // A helper object for setting matrices
    tempColor: new THREE.Color(), // A helper object for setting colors
    // -----------------------

    //horde
    spawnerState: 'CALM', // Can be 'CALM' or 'HORDE_ACTIVE'
    hordeTimer: 0,
    hordeIndex: 0,
    currentHordeEnemyType: null,

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
    movePointerId: null,
    aimPointerId: null,
    joystickCenter: new THREE.Vector2(),
    aimStart: new THREE.Vector2(),

    // --- Game Element Arrays ---
    // --- THIS IS THE FIX ---
    effectsToUpdate: [], // The animation engine's "to-do" list
    // -----------------------
    shapes: [],
    projectiles: [],
    dataFragments: [],
    megaDataFragments: [],
    hitEffects: [], // You had this in objectPools but not here, added for consistency
    geometricCaches: [],
    repairNodes: [],
    energyCores: [],
    particles: [], // Note: This might be redundant if effectsToUpdate handles all particles
    persistentWeaponMeshes: {},
    staticLevelObjects: [],
    backgroundPattern: null,

    // XP Consolidation
    accumulatedOffScreenXP: 0,

    // Boss state
    isBossWave: false,
    nextBossTime: 300,
};

export function resetGameState() {
    // Core Gameplay State
    state.gameTime = 0;
    state.isPaused = false;
    state.score = 0;

    // Player Stats
    state.playerLevel = 1;
    state.currentXP = 0;
    state.xpToNextLevel = 60; // Or your initial value
    state.playerShield = state.MAX_PLAYER_SHIELD; // Start with full shield

    // Clear dynamic arrays
    // We need to be careful here to not just clear the array, but also remove objects from the scene
    // and return them to pools. This will be handled by a separate "cleanup" function.
    state.shapes.forEach(shape => {
        // A simple removal for now. A full cleanup would return to pool.
        if (shape.parent) state.scene.remove(shape);
    });

    // Reset arrays to be empty
    state.shapes = [];
    state.projectiles = [];
    state.dataFragments = [];
    state.megaDataFragments = [];
    state.geometricCaches = [];
    state.repairNodes = [];
    state.energyCores = [];
    state.effectsToUpdate = [];

    // --- THE FIX FOR YOUR HORDE PROBLEM ---
    // Reset Spawner State
    state.spawnerState = 'CALM';
    state.hordeTimer = 5; // Give player 5 seconds before first wave starts
    state.hordeIndex = 0;
    state.currentHordeEnemyType = null;
    state.isBossWave = false;
    state.shapeSpawnTimer = 0;
    state.eliteSpawnTimer = 0;
    state.pickupSpawnTimer = 0;

    // Reset player position
    if (state.player) {
        state.player.position.set(0, CONSTANTS.PLAYER_HEIGHT / 2, 0);
    }

    console.log("Game state has been reset for a new run.");
}

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