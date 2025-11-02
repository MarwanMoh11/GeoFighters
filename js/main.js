import {CONSTANTS, GameState, state} from './state.js';
import {initRenderer} from './core/renderer.js';
import {applyFrustumCulling, updatePlaying} from './core/sceneUpdates.js';
import {setupEventListeners} from './utils/input.js';
import {loadGameData} from './utils/saveLoad.js';
import {initializeAudio} from './utils/audio.js';
import {bindUIEvents} from './ui/manager.js';
import * as THREE from 'three';
// Make sure this path is correct for your project structure!
// It might be './systems/spawner.js'
import {
    initializeDamageNumberPool,
    initializePools,
    resetDamageNumberCounter,
    returnEnemyToPool
} from './game/spawner.js';
import {ENEMY_TYPES} from './config/enemies.js';

// At the very top of main.js
const socket = io(); // This line connects your game to the server
state.socket = socket;

// Enhanced multiplayer synchronization
socket.on('gameStateUpdate', (data) => {
    if (!state.scene || state.isPaused) return;

    const { players: serverPlayers, gameState: serverGameState } = data;

    // Update other players
    for (const id in serverPlayers) {
        const serverPlayer = serverPlayers[id];

        // Skip rendering our own character (we control our own mesh locally)
        if (id === socket.id) continue;

        // Is this a new player we haven't seen before?
        if (!state.otherPlayers[id]) {
            console.log(`[+] Seeing new player: ${id}`);
            const geometry = new THREE.BoxGeometry(CONSTANTS.PLAYER_RADIUS * 2, CONSTANTS.PLAYER_HEIGHT, CONSTANTS.PLAYER_RADIUS * 2);
            const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // Green
            const newPlayerMesh = new THREE.Mesh(geometry, material);

            state.scene.add(newPlayerMesh);
            state.otherPlayers[id] = newPlayerMesh; // Store it for future updates
        }

        // This player already exists, so update their position smoothly
        const playerMesh = state.otherPlayers[id];
        const targetPosition = new THREE.Vector3(serverPlayer.x, serverPlayer.y, serverPlayer.z);

        // Use LERP to smoothly interpolate to the target position, hiding network jitter
        playerMesh.position.lerp(targetPosition, 0.2);
    }

    // Clean up players who have disconnected
    for (const id in state.otherPlayers) {
        if (!serverPlayers[id]) {
            console.log(`[-] Player left: ${id}`);
            state.scene.remove(state.otherPlayers[id]);
            delete state.otherPlayers[id];
        }
    }

    // Update multiplayer UI
    updateMultiplayerUI(serverPlayers);

    // Synchronize game state
    if (serverGameState) {
        // Update enemies
        syncEnemies(serverGameState.enemies);
        
        // Update projectiles
        syncProjectiles(serverGameState.projectiles);
        
        // Update data fragments
        syncDataFragments(serverGameState.dataFragments);
        
        // Update game time and other state
        state.gameTime = serverGameState.gameTime;
        state.spawnerState = serverGameState.spawnerState;
        state.hordeTimer = serverGameState.hordeTimer;
        
        // Update local player's score from server
        const localPlayer = serverPlayers[socket.id];
        if (localPlayer && localPlayer.score !== undefined) {
            state.score = localPlayer.score;
        }
    }
});

// Listen for projectile creation from server
socket.on('projectileCreated', (projectileData) => {
    if (!state.scene) return;
    
    // Create projectile mesh
    const geometry = new THREE.SphereGeometry(projectileData.radius, 8, 6);
    const material = new THREE.MeshBasicMaterial({ 
        color: projectileData.isEnemyProjectile ? 0xff0000 : 0x00ff00 
    });
    const mesh = new THREE.Mesh(geometry, material);
    
    mesh.position.set(projectileData.position.x, projectileData.position.y, projectileData.position.z);
    state.scene.add(mesh);
    
    // Store projectile data
    const projectile = {
        id: projectileData.id,
        mesh: mesh,
        velocity: new THREE.Vector3(projectileData.velocity.x, projectileData.velocity.y, projectileData.velocity.z),
        damage: projectileData.damage,
        radius: projectileData.radius,
        life: projectileData.life,
        ownerId: projectileData.ownerId,
        isEnemyProjectile: projectileData.isEnemyProjectile,
        hitEnemies: new Set(), // Add missing property for collision detection
        weaponId: projectileData.weaponId || 'unknown',
        tags: projectileData.tags || []
    };
    
    state.projectiles.push(projectile);
});

// Listen for player disconnections
socket.on('playerDisconnected', (playerId) => {
    console.log(`[SERVER] Player ${playerId} disconnected`);
    if (state.otherPlayers[playerId]) {
        state.scene.remove(state.otherPlayers[playerId]);
        delete state.otherPlayers[playerId];
    }
});

// Connection status monitoring
socket.on('connect', () => {
    console.log('[SOCKET] Connected to server');
    updateMultiplayerUI({}); // Will be updated by gameStateUpdate
});

socket.on('disconnect', () => {
    console.log('[SOCKET] Disconnected from server');
    updateMultiplayerUI({}); // Clear UI
});

socket.on('connect_error', (error) => {
    console.error('[SOCKET] Connection error:', error);
    updateMultiplayerUI({}); // Clear UI
});

// Helper functions for synchronization
function syncEnemies(serverEnemies) {
    // Clear existing enemies and rebuild from server state
    // This ensures perfect synchronization
    state.shapes.forEach(enemy => {
        if (enemy.instanceId !== undefined) {
            returnEnemyToPool(enemy);
        }
    });
    state.shapes.length = 0;
    
    // Add all enemies from server
    serverEnemies.forEach(serverEnemy => {
        const localEnemy = {
            id: serverEnemy.id,
            type: serverEnemy.type,
            position: new THREE.Vector3(serverEnemy.position.x, serverEnemy.position.y, serverEnemy.position.z),
            health: serverEnemy.health,
            maxHealth: serverEnemy.maxHealth,
            radius: serverEnemy.radius,
            speed: serverEnemy.speed,
            damageMultiplier: serverEnemy.damageMultiplier,
            spawnTime: serverEnemy.spawnTime,
            // Preserve AI state from server
            dashTimer: serverEnemy.dashTimer,
            isDashing: serverEnemy.isDashing,
            dashDirection: serverEnemy.dashDirection,
            dashTimeLeft: serverEnemy.dashTimeLeft,
            weaveTimer: serverEnemy.weaveTimer,
            bounceTimer: serverEnemy.bounceTimer,
            generation: serverEnemy.generation,
            instanceId: null // Will be assigned by spawnEnemyByType
        };
        
        // Use the original spawning system to create the enemy
        spawnEnemyFromServer(localEnemy);
    });
}

function spawnEnemyFromServer(enemyData) {
    // This integrates with the existing enemy spawning system
    const typeData = ENEMY_TYPES[enemyData.type];
    if (!typeData) return;

    // Get the InstancedMesh and an available index from the pool
    const instancedMesh = state.instancedMeshes[enemyData.type];
    const poolName = `pool_${enemyData.type}`;
    const pool = state.objectPools[poolName];

    if (!instancedMesh || !pool || pool.length === 0) {
        console.warn(`[MULTIPLAYER_SPAWN_FAIL] Pool empty for ${enemyData.type}`);
        return;
    }

    const instanceId = pool.pop();
    instancedMesh.count = Math.max(instancedMesh.count, instanceId + 1);

    // Set the instance's transform
    state.dummy.position.copy(enemyData.position);
    state.dummy.scale.set(1, 1, 1);
    state.dummy.updateMatrix();
    instancedMesh.setMatrixAt(instanceId, state.dummy.matrix);
    instancedMesh.instanceMatrix.needsUpdate = true;

    // Set the instance's color
    instancedMesh.setColorAt(instanceId, instancedMesh.userData.baseColor);
    instancedMesh.instanceColor.needsUpdate = true;

    // Link the enemy data to the instance
    enemyData.instanceId = instanceId;
    state.shapes.push(enemyData);
}

function syncProjectiles(serverProjectiles) {
    // Clear all local projectiles and rebuild from server state
    // This ensures perfect synchronization
    state.projectiles.forEach(projectile => {
        if (projectile.mesh) {
            state.scene.remove(projectile.mesh);
        }
    });
    state.projectiles.length = 0;
    
    // Add all projectiles from server
    serverProjectiles.forEach(serverProjectile => {
        const localProjectile = {
            id: serverProjectile.id,
            mesh: null,
            velocity: new THREE.Vector3(serverProjectile.velocity.x, serverProjectile.velocity.y, serverProjectile.velocity.z),
            damage: serverProjectile.damage,
            radius: serverProjectile.radius,
            life: serverProjectile.life,
            ownerId: serverProjectile.ownerId,
            isEnemyProjectile: serverProjectile.isEnemyProjectile,
            hitEnemies: new Set(), // Add missing property for collision detection
            weaponId: serverProjectile.weaponId || 'unknown',
            tags: serverProjectile.tags || []
        };
        
        // Create mesh for projectile
        const geometry = new THREE.SphereGeometry(serverProjectile.radius, 8, 6);
        const material = new THREE.MeshBasicMaterial({ 
            color: serverProjectile.isEnemyProjectile ? 0xff0000 : 0x00ff00 
        });
        localProjectile.mesh = new THREE.Mesh(geometry, material);
        localProjectile.mesh.position.set(
            serverProjectile.position.x,
            serverProjectile.position.y,
            serverProjectile.position.z
        );
        
        state.scene.add(localProjectile.mesh);
        state.projectiles.push(localProjectile);
    });
}

function syncDataFragments(serverFragments) {
    // Remove fragments that no longer exist on server
    for (let i = state.dataFragments.length - 1; i >= 0; i--) {
        const localFragment = state.dataFragments[i];
        const serverFragment = serverFragments.find(f => f.id === localFragment.id);
        if (!serverFragment) {
            if (localFragment.mesh) {
                state.scene.remove(localFragment.mesh);
            }
            state.dataFragments.splice(i, 1);
        }
    }
    
    // Add or update fragments from server
    serverFragments.forEach(serverFragment => {
        let localFragment = state.dataFragments.find(f => f.id === serverFragment.id);
        
        if (!localFragment) {
            // Create new fragment
            localFragment = {
                id: serverFragment.id,
                position: new THREE.Vector3(serverFragment.position.x, serverFragment.position.y, serverFragment.position.z),
                xpValue: serverFragment.xpValue,
                life: serverFragment.life,
                mesh: null
            };
            
            // Create mesh
            const geometry = new THREE.SphereGeometry(0.3, 8, 6);
            const material = new THREE.MeshBasicMaterial({ color: 0x00ffff });
            localFragment.mesh = new THREE.Mesh(geometry, material);
            localFragment.mesh.position.copy(localFragment.position);
            state.scene.add(localFragment.mesh);
            
            state.dataFragments.push(localFragment);
        } else {
            // Update existing fragment
            localFragment.position.set(serverFragment.position.x, serverFragment.position.y, serverFragment.position.z);
            localFragment.life = serverFragment.life;
            
            if (localFragment.mesh) {
                localFragment.mesh.position.copy(localFragment.position);
            }
        }
    });
}


// Function to send weapon fire events to server
export function sendWeaponFire(fireData) {
    if (state.socket) {
        state.socket.emit('weaponFire', fireData);
    }
}

// Multiplayer UI management
function updateMultiplayerUI(players) {
    const connectionStatus = document.getElementById('connectionStatus');
    const playerCountValue = document.getElementById('playerCountValue');
    const playerList = document.getElementById('playerList');
    
    if (!connectionStatus || !playerCountValue || !playerList) return;
    
    // Update connection status
    if (state.socket && state.socket.connected) {
        connectionStatus.textContent = 'Connected';
        connectionStatus.className = '';
    } else {
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.className = 'disconnected';
    }
    
    // Update player count
    playerCountValue.textContent = Object.keys(players).length;
    
    // Update player list
    playerList.innerHTML = '';
    for (const playerId in players) {
        const player = players[playerId];
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        
        if (playerId === socket.id) {
            playerItem.className += ' self';
            playerItem.textContent = `You (${Math.floor(player.shield || 100)}) - Score: ${player.score || 0}`;
        } else {
            playerItem.textContent = `Player ${playerId.substring(0, 6)} (${Math.floor(player.shield || 100)}) - Score: ${player.score || 0}`;
        }
        
        playerList.appendChild(playerItem);
    }
}

function init() {
    state.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    loadGameData();
    initializeAudio();
    initRenderer();

    initializePools();
    initializeDamageNumberPool();
    resetDamageNumberCounter();

    setupEventListeners();
    bindUIEvents();

    // Set initial time for the game loop
    lastTime = performance.now();
    animate();
}

const FIXED_TIMESTEP = 1 / 60;
const MAX_FRAME_TIME = 0.25;

let accumulator = 0;
let lastTime = 0;

function animate() {
    requestAnimationFrame(animate);
    resetDamageNumberCounter();

    const currentTime = performance.now();
    let deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (deltaTime > MAX_FRAME_TIME) {
        deltaTime = MAX_FRAME_TIME;
    }

    if (state.currentGameState === GameState.Playing && !state.isPaused) {
        accumulator += deltaTime;
        while (accumulator >= FIXED_TIMESTEP) {
            state.gameTime += FIXED_TIMESTEP;
            updatePlaying(FIXED_TIMESTEP);
            accumulator -= FIXED_TIMESTEP;
        }
    }

    // --- THIS IS THE CORRECTED, ROBUST ANIMATION ENGINE ---
    if (state.effectsToUpdate && state.effectsToUpdate.length > 0) {
        for (let i = state.effectsToUpdate.length - 1; i >= 0; i--) {
            const effect = state.effectsToUpdate[i];

            // --- FIX ---
            // Check if the effect has a 'brain' directly on it OR on its userData.
            // This handles both hit effects and particle effects.
            const updateFn = effect.update || (effect.userData && effect.userData.update);

            if (updateFn) {
                // Call the brain function
                updateFn(effect, deltaTime);
            } else {
                // If the brain is gone, its life is over. Remove it from the list.
                state.effectsToUpdate.splice(i, 1);
            }
        }
    }

    if (state.backgroundPattern) {
        state.backgroundPattern.material.uniforms.time.value = (currentTime / 1000) * 0.05;
    }

    applyFrustumCulling();

    if (state.renderer && state.scene && state.camera) {
        try {
            state.renderer.render(state.scene, state.camera);
        } catch (renderError) {
            console.error("A critical error occurred during rendering:", renderError);
        }
    }
}

window.onload = init;