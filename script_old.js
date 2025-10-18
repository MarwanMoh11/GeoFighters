// --- Game States ---
const GameState = { MainMenu: 'MainMenu', LevelSelect: 'LevelSelect', UpgradeMenu: 'UpgradeMenu', Playing: 'Playing', Paused: 'Paused', LevelUp: 'LevelUp', Settings: 'Settings', GameOver: 'GameOver', Win: 'Win', EvolutionBook: 'EvolutionBook' };
let currentGameState = GameState.MainMenu;
let previousGameState = GameState.MainMenu; // Used for returning from Settings/Book etc.
let previousMenuState = GameState.MainMenu; // Specifically for returning from Upgrades

// --- Basic Setup ---
let scene, camera, renderer;
let player, ground, gridHelper;
const clock = new THREE.Clock();
let isPaused = false;
let gameTime = 0;
let currentLevelId = 1;
const WORLD_BOUNDARY = 70;

// --- Audio ---
let audioContext = null; // Initialize later after user interaction

// --- Meta Progression ---
let dataCores = 0;
const metaUpgrades = { // Define available permanent upgrades
    maxShield: { name: "Max Shield", level: 0, maxLevel: 10, costBase: 50, costIncrease: 1.5, valuePerLevel: 10 },
    baseDamage: { name: "Base Damage", level: 0, maxLevel: 10, costBase: 75, costIncrease: 1.6, valuePerLevel: 0.05 },
    moveSpeed: { name: "Move Speed", level: 0, maxLevel: 5, costBase: 60, costIncrease: 1.8, valuePerLevel: 0.15 },
    pickupRadius: { name: "Pickup Radius", level: 0, maxLevel: 5, costBase: 40, costIncrease: 1.7, valuePerLevel: 0.2 },
    luck: { name: "Luck", level: 0, maxLevel: 10, costBase: 100, costIncrease: 1.8, valuePerLevel: 0.03 },
};
let baseDamageMultiplier = 1.0; // Global multiplier affected by meta upgrade

// ... (near WORLD_BOUNDARY)
const ENEMY_DESPAWN_DISTANCE_FACTOR = 1.2; // How many times the screen diagonal (approx) away to despawn
const MIN_ENEMY_DESPAWN_DISTANCE = 60;  // Minimum distance regardless of screen size (prevents too close despawn on small screens)
const MAX_ENEMY_DESPAWN_DISTANCE = 100; // Absolute max distance to despawn (prevents waiting too long on huge screens)

// --- Player Stats & Leveling ---
let BASE_MAX_PLAYER_SHIELD = 100; // Base value before meta upgrades
let playerShield = 100; // <<<< DECLARED ONCE HERE
let MAX_PLAYER_SHIELD = 100; // Current max, updated by meta upgrades
let score = 0; // <<<< DECLARED ONCE HERE
let playerLevel = 1; // <<<< DECLARED ONCE HERE
let currentXP = 0; // <<<< DECLARED ONCE HERE
let xpToNextLevel = 60; // <<<< DECLARED ONCE HERE
const playerWeapons = []; // <<<< DECLARED ONCE HERE
const MAX_WEAPONS = 5; // <<<< DECLARED ONCE HERE
const playerItems = []; // <<<< DECLARED ONCE HERE
const MAX_ITEMS = 5; // <<<< DECLARED ONCE HERE
let playerCorruptionTimer = 0; // <<<< DECLARED ONCE HERE
const CORRUPTION_DAMAGE = 1; // <<<< DECLARED ONCE HERE
const CORRUPTION_INTERVAL = 0.5; // <<<< DECLARED ONCE HERE
let corruptionEffectTimer = 0; // <<<< DECLARED ONCE HERE
let shieldRegenTimer = 0; // <<<< DECLARED ONCE HERE

// --- Timers ---
let shapeSpawnTimer = 0; // <<<< DECLARED ONCE HERE
const baseShapeSpawnInterval = 2.0; // <<<< DECLARED ONCE HERE
let shapeSpawnInterval = baseShapeSpawnInterval; // <<<< DECLARED ONCE HERE
let eliteSpawnTimer = 35; // <<<< DECLARED ONCE HERE
const eliteSpawnInterval = 40; // <<<< DECLARED ONCE HERE // NOTE: You had 20 here in the duplicate block, using 40 from the first block. Adjust if needed.
let pickupSpawnTimer = 5; // <<<< DECLARED ONCE HERE
const pickupSpawnInterval = 8; // <<<< DECLARED ONCE HERE

// --- Movement & Stats (Base values) ---
const moveState = { forward: 0, backward: 0, left: 0, right: 0 };
const basePlayerSpeed = 5.0; // <<< ADD THIS LINE BACK
let BASE_PLAYER_SPEED = 5.0; // Base before meta upgrades - You can actually remove this one and just use basePlayerSpeed everywhere
let playerSpeed = basePlayerSpeed; // Initialize playerSpeed with the base constant
const baseProjectileSpeed = 10;
const baseDataFragmentSpeed = 3.5;
const baseXpCollectionRadius = 2.0; // Renamed BASE_XP_COLLECTION_RADIUS below
let BASE_XP_COLLECTION_RADIUS = 2.0; // Base before meta upgrades
let xpCollectionRadius = BASE_XP_COLLECTION_RADIUS;

// --- Collision & Radii ---
const playerRadius = 0.6; // <<<< DECLARED ONCE HERE
const playerHeight = 1.0; // <<<< DECLARED ONCE HERE
const projectileRadius = 0.1; // <<<< DECLARED ONCE HERE
const dataFragmentRadius = 0.15; // <<<< DECLARED ONCE HERE
const energyCoreRadius = 0.25; // <<<< DECLARED ONCE HERE
const repairNodeRadius = 0.2; // <<<< DECLARED ONCE HERE
const cacheRadius = 0.4; // <<<< DECLARED ONCE HERE
const pickupCollectionRadius = 0.9; // <<<< DECLARED ONCE HERE


// --- Mouse & Touch Aiming ---
const mouse = new THREE.Vector2(); // <<<< DECLARED ONCE HERE
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // <<<< DECLARED ONCE HERE
const raycaster = new THREE.Raycaster(); // <<<< DECLARED ONCE HERE
let aimTarget = new THREE.Vector3(); // <<<< DECLARED ONCE HERE

// --- Touch Controls ---
const joystickArea = document.getElementById('joystick-area'); // <<<< DECLARED ONCE HERE
const joystickKnob = document.getElementById('joystick-knob'); // <<<< DECLARED ONCE HERE
let joystickActive = false; // <<<< DECLARED ONCE HERE
let joystickBaseX, joystickBaseY, joystickPointerId; // <<<< DECLARED ONCE HERE
let joystickRadius = 75; // Default, will be updated // <<<< DECLARED ONCE HERE
let knobRadius = 30;     // Default, will be updated // <<<< DECLARED ONCE HERE

const aimJoystickArea = document.getElementById('aim-joystick-area'); // <<<< DECLARED ONCE HERE
const aimJoystickKnob = document.getElementById('aim-joystick-knob'); // <<<< DECLARED ONCE HERE
let aimJoystickActive = false; // <<<< DECLARED ONCE HERE
let aimJoystickBaseX, aimJoystickBaseY, aimJoystickPointerId; // <<<< DECLARED ONCE HERE
let aimJoystickRadius = 75; // Default // <<<< DECLARED ONCE HERE
let aimKnobRadius = 30;     // Default // <<<< DECLARED ONCE HERE

const fullscreenButton = document.getElementById('fullscreen-button'); // <<<< DECLARED ONCE HERE
let isTouchDevice = false; // <<<< DECLARED ONCE HERE


// --- Game Elements ---
const shapes = []; // <<<< DECLARED ONCE HERE
const projectiles = []; // <<<< DECLARED ONCE HERE
const dataFragments = []; // <<<< DECLARED ONCE HERE
const megaDataFragments = []; // For consolidated XP orbs
let accumulatedOffScreenXP = 0;
const MEGA_XP_THRESHOLD = 300; // XP needed to spawn a mega orb
const XP_CONSOLIDATION_DISTANCE = 55; // Fragments further than this from player get 
const hitEffects = []; // <<<< DECLARED ONCE HERE
const geometricCaches = []; // <<<< DECLARED ONCE HERE
const repairNodes = []; // <<<< DECLARED ONCE HERE
const energyCores = []; // <<<< DECLARED ONCE HERE
const particles = []; // <<<< DECLARED ONCE HERE
let persistentWeaponMeshes = {}; // <<<< DECLARED ONCE HERE
const staticLevelObjects = []; // <<<< DECLARED ONCE HERE
let backgroundPattern = null; // <<<< DECLARED ONCE HERE
const damageNumbersContainer = document.getElementById('damage-numbers-container'); // <<<< DECLARED ONCE HERE (also declared above, ensure consistency or remove one) - KEEPING THIS ONE

// --- Weapon & Item Definitions ---
// Define all available weapons
const weaponDefinitions = {
    // Basic Weapons
    basicLaser: {
        name: "Basic Laser",
        icon: "→",
        description: "Fires a simple laser beam forward",
        damage: 10,
        cooldown: 0.8,
        projectileSpeed: 12,
        projectileLifetime: 1.0,
        color: 0x00ffff,
        size: 0.15,
        knockback: 0.2,
        piercing: false,
        count: 1,
        spread: 0,
        type: "projectile",
        evolution: { weapon: null, item: "focusCrystal", result: "enhancedLaser" },
        onFire: function(player, level = 1) {
            const direction = new THREE.Vector3();
            direction.subVectors(aimTarget, player.position).normalize();
            
            // Apply damage multiplier based on level and meta upgrade
            const damageMultiplier = 1 + (level - 1) * 0.3; // 30% increase per level
            const finalDamage = this.damage * damageMultiplier * baseDamageMultiplier;
            
            spawnProjectile(player.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 
                           direction, this.projectileSpeed, this.projectileLifetime, 
                           finalDamage, this.color, this.size, this.knockback, this.piercing);
        }
    },
    
    // ... Rest of the JavaScript code from the original file
    
    // Add all the remaining JavaScript code here
};

// Initialize the game when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize game
    init();
    
    // Start animation loop
    animate();
});

// Add all the remaining JavaScript functions and event handlers here