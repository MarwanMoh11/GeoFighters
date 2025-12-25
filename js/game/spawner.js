import * as THREE from 'three';
import { state, CONSTANTS } from '../state.js';
import { ENEMY_TYPES } from '../config/enemies.js';
import { playSoundSynth } from '../utils/audio.js';
import { ui } from '../ui/dom.js';
import { gameLevels } from '../config/levels.js';

// --- Horde Progression Timeline ---
// This defines the entire spawning flow for a run.
// In js/systems/spawner.js

// --- Horde Progression Timeline (10-Minute Run) ---
// This timeline introduces overlapping hordes and elite support enemies.
const HORDE_TIMELINE = [
    // === PHASE 1: The Onslaught Begins (0:00 - 2:00) ===
    // Objective: Teach basic movement and dodging.
    { startTime: 5, duration: 50, type: 'MECH_BEAST', calmDuration: 15 }, // Standard intro. Ends at 1:10.
    { startTime: 70, duration: 60, type: 'SEC_DRONE', calmDuration: 20 }, // Introduce fast, numerous enemies. Ends at 2:10.

    // === PHASE 2: New Threats (2:10 - 4:30) ===
    // Objective: Introduce special abilities and armor.
    { startTime: 150, duration: 10, type: 'GLITCH_HORROR', calmDuration: 25 }, // Short, intense wave to manage performance. Ends at 3:35.
    { startTime: 150, duration: 100, type: 'MECH_BEAST', calmDuration: 15 },
    { startTime: 215, duration: 60, type: 'SEC_DRONE', calmDuration: 25 }, // Introduce the "Tough" enemy type. Ends at 4:20.

    // === PHASE 3: The Gauntlet (4:30 - 7:00) ===
    // Objective: Combine hordes to test player prioritization.
    { startTime: 275, duration: 65, type: 'SPIDER_TANK', calmDuration: 20 }, // A full wave of easy enemies. Ends at 5:40.
    // ** OVERLAP! ** While dashers are still spawning, swarmers return.
    { startTime: 275, duration: 80, type: 'SEC_DRONE', calmDuration: 0, isMiniHorde: true }, // Swarmers create chaos for the dashers.

    // === PHASE 4: The Corrupted Zone (7:00 - 9:45) ===
    // Objective: High-stakes survival with area denial and ranged threats.
    { startTime: 420, duration: 140, type: 'TECH_TENTACLE', calmDuration: 25 }, // Introduce area denial. Ends at 8:15.

    // === FINAL CLIMAX (before the boss) ===
    { startTime: 535, duration: 45, type: 'PLASMA_GOLEM', calmDuration: 20 }, // The final, tanky drifters. Ends at 9:40.
    // The game enters a final "Calm" phase from 580s (9:40) to 600s, allowing the player to prepare for the boss.
];

export let damageNumbersThisFrame = 0; // Export the counter
const MAX_DAMAGE_NUMBERS_PER_FRAME = 25; // Budget: Only allow 25 new damage numbers per frame.

export function resetDamageNumberCounter() {
    damageNumbersThisFrame = 0;
}


// Now, find and REPLACE your existing createDamageNumber function with this one:

export function createDamageNumber(position, amount, isCritical = false) {
    // --- THE FINAL OPTIMIZATION ---
    // Enforce the budget. If we've shown too many numbers this frame, do nothing.
    if (damageNumbersThisFrame >= MAX_DAMAGE_NUMBERS_PER_FRAME) {
        return;
    }
    damageNumbersThisFrame++;
    // --- END OF FIX ---

    if (!ui.damageNumbersContainer) return;

    // Get a <div> from the pool instead of creating a new one.
    const el = getFromPool('damageNumbers', () => {
        // Fallback in case the pool runs out (should be rare)
        const newEl = document.createElement('div');
        newEl.style.position = 'absolute';
        ui.damageNumbersContainer.appendChild(newEl);
        return newEl;
    });

    // Configure the reused element
    el.className = 'damage-number';
    if (isCritical) {
        el.classList.add('critical');
        el.textContent = `${Math.round(amount)}!!`;
    } else {
        el.textContent = String(Math.round(amount));
    }

    const screenPos = worldToScreen(position);
    if (!screenPos) {
        // If the position is off-screen, immediately return the element to the pool
        returnToPool('damageNumbers', el);
        return;
    }

    el.style.left = `${screenPos.x}px`;
    el.style.top = `${screenPos.y}px`;

    // Use animation to handle the lifecycle
    el.style.animation = 'damage-anim 0.8s ease-out forwards';

    // After the animation is done, return the element to the pool for reuse.
    setTimeout(() => {
        el.style.animation = 'none'; // Reset animation for the next use
        returnToPool('damageNumbers', el);
    }, 800); // 800ms must match your CSS animation duration
}


// =================================================================================
// --- DIRECTOR: Main Spawning Orchestration ---
// =================================================================================

export function handleSpawning(deltaTime) {
    // Tutorial Interception
    const currentLevel = gameLevels?.find(l => l.id === state.currentLevelId);
    if (currentLevel?.isTutorial) {
        handleTutorialSpawning(deltaTime);
        return;
    }

    if (state.isBossWave) {
        handleBossWave(deltaTime);
        return;
    }

    handleBossSpawnTrigger(); // Checks if it's time for the boss

    // Pyramid Piercer periodic spawn: every 60s
    state.pyramidSpawnTimer += deltaTime;
    if (state.pyramidSpawnTimer >= 60) {
        state.pyramidSpawnTimer = 0;
        spawnEnemyByType('PYRAMID_PIERCER');
    }

    // Always check for the next horde, even during a calm phase.
    const nextHorde = HORDE_TIMELINE[state.hordeIndex];
    if (nextHorde && state.gameTime >= nextHorde.startTime) {
        transitionToHorde(nextHorde);
    }

    // Process current spawner state
    if (state.spawnerState === 'HORDE_ACTIVE') {
        state.hordeTimer -= deltaTime;
        handleActiveHorde(deltaTime);
        if (state.hordeTimer <= 0) {
            transitionToCalm();
        }
    } else if (state.spawnerState === 'CALM') {
        state.hordeTimer -= deltaTime;
        handleCalmPhase(deltaTime);
    }
}

// =================================================================================
// --- TUTORIAL LOGIC ---
// =================================================================================
function handleTutorialSpawning(deltaTime) {
    state.tutorialTimer += deltaTime;

    switch (state.tutorialStep) {
        case 'INTRO':
            state.tutorialMessage = "Drag LEFT Joystick to Move";
            // Check for movement
            if (state.player && (Math.abs(state.player.position.x) > 5 || Math.abs(state.player.position.z) > 5)) {
                state.tutorialStep = 'SHOOT';
                state.tutorialTimer = 0;
                state.tutorialWaveSpawned = false; // Reset flag
                playSoundSynth('powerup_spawn');
            }
            break;

        case 'SHOOT':
            state.tutorialMessage = "Approach Enemies to Auto-Shoot";

            // Spawn mini-horde close to player
            if (!state.tutorialWaveSpawned && state.tutorialTimer > 0.5) {
                const playerPos = state.player.position;
                for (let i = 0; i < 5; i++) {
                    const angle = (i / 5) * Math.PI * 2;
                    const spawnDist = 12; // Close enough to see, far enough to not hit instantly
                    const spawnPos = new THREE.Vector3(
                        playerPos.x + Math.cos(angle) * spawnDist,
                        0,
                        playerPos.z + Math.sin(angle) * spawnDist
                    );
                    spawnEnemyByType('MECH_BEAST', spawnPos);
                }
                state.tutorialWaveSpawned = true;
            }

            // Check if killed (must have spawned first)
            if (state.tutorialWaveSpawned && state.shapes.length === 0 && state.tutorialTimer > 2.0) {
                state.tutorialStep = 'XP';
                state.tutorialTimer = 0;
                state.tutorialXPSpawned = false;
                playSoundSynth('powerup_spawn');
            }
            break;

        case 'XP':
            state.tutorialMessage = "Collect Data to Level Up";
            // Spawn clean XP if none logic
            // Directly spawn a data fragment near player
            if (!state.tutorialXPSpawned && state.tutorialTimer > 0.5 && state.tutorialTimer < 1.0) {
                // Spawn 1 orange mega shard for quick level up
                spawnMegaDataFragment(500);
                state.tutorialXPSpawned = true;
            }

            if (state.playerLevel > 1 || (state.playerLevel === 1 && state.currentXP > 0)) { // Adjusted for safety
                // If level > 1 (started at 1, so level 2), we are good.
                // Wait, starting level is 1. Next is 2.
                if (state.playerLevel > 1) {
                    state.tutorialStep = 'CHEST';
                    state.tutorialTimer = 0;
                    state.tutorialChestSpawned = false;
                    playSoundSynth('powerup_spawn');
                }
            }
            break;

        case 'CHEST':
            state.tutorialMessage = "Open Cache for Rewards";
            if (!state.tutorialChestSpawned && state.tutorialTimer > 1.0) {
                const playerPos = state.player.position;
                const spawnPos = new THREE.Vector3(playerPos.x + 8, 0, playerPos.z);
                // Pass 'COMMON' to ensure the tutorial cache is always common
                spawnGeometricCache(spawnPos, 'COMMON');
                state.tutorialChestSpawned = true;
            }

            // Check if chest is gone (meaning it was opened/collected)
            if (state.tutorialChestSpawned && state.geometricCaches.length === 0) {
                state.tutorialStep = 'COMBAT';
                state.tutorialTimer = 0;
                state.tutorialCombatSpawned = false;
                playSoundSynth('powerup_spawn');
            }
            break;

        case 'COMBAT':
            state.tutorialMessage = "Defeat the Enemies!";

            if (!state.tutorialCombatSpawned && state.tutorialTimer > 1.0) {
                const playerPos = state.player.position;
                for (let i = 0; i < 3; i++) {
                    const angle = (i / 3) * Math.PI * 2;
                    const spawnDist = 10;
                    const spawnPos = new THREE.Vector3(
                        playerPos.x + Math.cos(angle) * spawnDist,
                        0,
                        playerPos.z + Math.sin(angle) * spawnDist
                    );
                    spawnEnemyByType('MECH_BEAST', spawnPos);
                }
                state.tutorialCombatSpawned = true;
            }

            if (state.tutorialCombatSpawned && state.shapes.length === 0 && state.tutorialTimer > 2.0) {
                state.tutorialStep = 'COMPLETE';
                state.tutorialTimer = 0;
            }
            break;

        case 'COMPLETE':
            // Only set message if not explicitly cleared by the BEGIN MISSION button
            if (state.tutorialMessage !== "" && state.tutorialStep === 'COMPLETE') {
                state.tutorialMessage = "MISSION READY. START ENGINE";
            }
            break;
    }
}
// =================================================================================
// --- HORDE STATE MACHINE ---
// =================================================================================

function transitionToHorde(hordeConfig) {
    if (hordeConfig.isMiniHorde) {
        // Mini-horde: Don't change the main spawner state
    } else {
        state.spawnerState = 'HORDE_ACTIVE';
        state.hordeTimer = hordeConfig.duration;
    }

    state.currentHordeEnemyType = hordeConfig.type;
    state.hordeIndex++;
}

function transitionToCalm() {
    // Only transition to calm if we are not in the middle of an overlapping horde
    const nextHorde = HORDE_TIMELINE[state.hordeIndex];
    if (nextHorde && nextHorde.isMiniHorde) {
        // Don't go calm yet, the mini-horde is active
        return;
    }

    const previousHorde = HORDE_TIMELINE[state.hordeIndex - 1];
    const calmDuration = previousHorde ? previousHorde.calmDuration : 10;

    // Only log and set timer if we aren't about to start another horde
    if (calmDuration > 0) {
        state.spawnerState = 'CALM';
        state.hordeTimer = calmDuration;
        state.currentHordeEnemyType = null;
    }
}

function handleActiveHorde(deltaTime) {
    // This function now handles BOTH main hordes and mini-hordes.
    state.shapeSpawnInterval = Math.max(0.1, 1.2 - (state.gameTime * 0.0015));
    state.shapeSpawnTimer += deltaTime;

    if (state.shapeSpawnTimer > state.shapeSpawnInterval) {
        state.shapeSpawnTimer = 0;
        spawnHordeWave();
    }
}

function handleCalmPhase(deltaTime) {
    state.pickupSpawnTimer += deltaTime;
    if (state.pickupSpawnTimer > 8) { // Slower pickup spawn in calm
        state.pickupSpawnTimer = 0;
        if (Math.random() < 0.65) spawnRepairNode(); spawnEnergyCore();
    }

    state.eliteSpawnTimer += deltaTime;
    if (state.eliteSpawnTimer > 18) { // Slower elite spawn in calm
        state.eliteSpawnTimer = 0;
        // Spawn elites based on how far into the game we are
        if (state.gameTime > 400 && Math.random() < 0.3) {
            spawnEnemyByType('SPIDER_TANK');
        }
    }
}

function spawnHordeWave() {
    let budget = Math.min(15 + Math.floor(state.gameTime / 20) + state.playerLevel * 2.5, 80);
    const maxSpawns = 20;
    let spawnedCount = 0;

    // This can be a main horde type OR a mini-horde type
    const currentTypeData = ENEMY_TYPES[state.currentHordeEnemyType];
    if (!currentTypeData) return;

    // Prioritize the current horde enemy type
    while (budget >= currentTypeData.cost && spawnedCount < maxSpawns) {
        spawnEnemyByType(state.currentHordeEnemyType);
        budget -= currentTypeData.cost;
        spawnedCount++;
    }

    // Always add some basic cubes as filler if there's leftover budget
    const fillerTypeData = ENEMY_TYPES['MECH_BEAST'];
    while (budget >= fillerTypeData.cost && spawnedCount < maxSpawns) {
        spawnEnemyByType('MECH_BEAST');
        budget -= fillerTypeData.cost;
        spawnedCount++;
    }
}

// =================================================================================
// --- BOSS & MISC LOGIC ---
// =================================================================================

function handleBossWave(deltaTime) {
    // We now check for the 'type' property directly on the data object in state.shapes
    const bossExists = state.shapes.some(s => s.type === 'TITAN_MECH_KING');

    if (!bossExists) {
        spawnEnemyByType('TITAN_MECH_KING');
    }

    // ... rest of the function is the same ...
    state.pickupSpawnTimer += deltaTime;
    if (state.pickupSpawnTimer > 12) {
        state.pickupSpawnTimer = 0;
        if (Math.random() < 0.7) spawnRepairNode();
    }
}

function handleBossSpawnTrigger() {
    if (state.gameTime >= state.nextBossTime && !state.isBossWave) {
        state.isBossWave = true;
    }
}

export function handleXPOrbConsolidation() {
    if (state.accumulatedOffScreenXP >= CONSTANTS.MEGA_XP_THRESHOLD) {
        spawnMegaDataFragment(state.accumulatedOffScreenXP);
        state.accumulatedOffScreenXP = 0;
    }
}

// =================================================================================
// --- OBJECT POOLING INFRASTRUCTURE ---
// =================================================================================

export function initializePools() {
    initializeEffectPools();
    initializeDamageNumberPool();

    // Max number of one enemy type on screen at once.
    // Increased for heavy load stress testing.
    const MAX_INSTANCES_PER_TYPE = 500;

    const textureLoader = new THREE.TextureLoader();
    const enemySheet = textureLoader.load('assets/enemy_sheet.png');
    enemySheet.colorSpace = THREE.SRGBColorSpace;
    enemySheet.magFilter = THREE.NearestFilter;
    enemySheet.minFilter = THREE.NearestFilter;

    // Sprite Sheet has 4 columns and 4 rows
    const COLS = 4;
    const ROWS = 4;

    Object.keys(ENEMY_TYPES).forEach(typeId => {
        const typeData = ENEMY_TYPES[typeId];
        if (!typeData) return;

        // 1. Create 2D Quad Geometry for Sprites (Sized and Anchored to Ground)
        const width = typeData.size ? typeData.size[0] : 1;
        const height = typeData.size ? typeData.size[1] : 1;
        const geometry = new THREE.PlaneGeometry(width, height);

        // Offset the geometry so the bottom edge is at Y=0
        geometry.translate(0, height / 2, 0);

        // --- CRITICAL FIX: Custom UV mapping for this monster type to avoid texture clones ---
        const col = typeData.spriteIndex ? typeData.spriteIndex[0] : 0;
        const row = typeData.spriteIndex ? typeData.spriteIndex[1] : 0;

        const uvAttr = geometry.attributes.uv;

        // Add small padding to prevent bleeding from adjacent sprites
        const SHEET_SIZE = 512; // Assume 512x512 sheet
        const padding = 0.5 / SHEET_SIZE; // Half pixel padding

        const uMin = col / COLS + padding;
        const uMax = (col + 1) / COLS - padding;
        const vMin = 1 - (row + 1) / ROWS + padding;
        const vMax = 1 - row / ROWS - padding;

        // Set UVs: [TL, TR, BL, BR] order for PlaneGeometry
        uvAttr.setXY(0, uMin, vMax); // Top-Left
        uvAttr.setXY(1, uMax, vMax); // Top-Right
        uvAttr.setXY(2, uMin, vMin); // Bottom-Left
        uvAttr.setXY(3, uMax, vMin); // Bottom-Right
        uvAttr.needsUpdate = true;

        geometry.computeBoundingSphere();

        // 2. Create Material using the shared sheet
        const material = new THREE.MeshBasicMaterial({
            map: enemySheet,
            transparent: true,
            alphaTest: 0.5, // Crisp edges for pixel art
            color: 0xffffff,
            side: THREE.DoubleSide
        });

        // 3. Create the InstancedMesh
        const instancedMesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES_PER_TYPE);
        instancedMesh.frustumCulled = false;
        instancedMesh.count = 0;
        instancedMesh.userData.radius = width * 0.5; // Use half-width as horizontal radius 
        instancedMesh.userData.baseColor = new THREE.Color(typeData.color || 0xffffff);

        // 4. Add to scene
        state.scene.add(instancedMesh);
        state.instancedMeshes[typeId] = instancedMesh;

        // 5. Create the new pool. This pool stores INDICES (numbers), not meshes.
        const poolName = `pool_${typeId}`;
        state.objectPools[poolName] = [];
        for (let i = 0; i < MAX_INSTANCES_PER_TYPE; i++) {
            // Pre-fill the pool with all available indices
            state.objectPools[poolName].push(i);
        }
        // Set all instances to scale 0 so they are invisible
        const dummy = state.dummy;
        dummy.scale.set(0, 0, 0);
        dummy.updateMatrix();
        for (let i = 0; i < MAX_INSTANCES_PER_TYPE; i++) {
            instancedMesh.setMatrixAt(i, dummy.matrix);
            instancedMesh.setColorAt(i, instancedMesh.userData.baseColor);
        }
        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.instanceColor.needsUpdate = true;
    });
}


export function getFromPool(poolName, createFunc) {
    const pool = state.objectPools[poolName];
    if (pool && pool.length > 0) {
        const obj = pool.pop();
        if (obj.style) obj.style.display = 'block';
        else obj.visible = true;
        return obj;
    }
    return createFunc();
}

export function returnToPool(poolName, object) {
    const pool = state.objectPools[poolName];
    if (!pool) return;

    if (object.style) object.style.display = 'none';
    else object.visible = false;

    if (object.isObject3D && object.parent) {
        object.parent.remove(object);
    }

    const maxPoolSize = CONSTANTS.MAX_POOL_SIZE[poolName] || 100;
    if (pool.length < maxPoolSize) {
        pool.push(object);
    } else if (object.isObject3D) {
        object.geometry?.dispose();
        if (object.material) {
            if (Array.isArray(object.material)) object.material.forEach(m => m?.dispose());
            else object.material.dispose();
        }
    }
}

// =================================================================================
// --- HIGH-PERFORMANCE, POOLED SPAWNERS ---
// =================================================================================

function createEnemyFactory(typeId) {
    return () => {
        const typeData = ENEMY_TYPES[typeId];
        if (!typeData) return null;

        let geometry;
        const size = typeData.size || [1];
        switch (typeData.geometryType) {
            case 'Box': geometry = new THREE.BoxGeometry(...size); break;
            case 'Sphere': geometry = new THREE.SphereGeometry(...size); break;
            case 'Cylinder': geometry = new THREE.CylinderGeometry(...size); break;
            case 'Cone': geometry = new THREE.ConeGeometry(...size); break;
            case 'Icosahedron': geometry = new THREE.IcosahedronGeometry(...size); break;
            case 'Octahedron': geometry = new THREE.OctahedronGeometry(...size); break;
            case 'Dodecahedron': geometry = new THREE.DodecahedronGeometry(...size); break;
            case 'Tetrahedron': geometry = new THREE.TetrahedronGeometry(...size); break;
            default: geometry = new THREE.BoxGeometry(1, 1, 1);
        }
        geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({
            color: typeData.color || 0xffffff,
            roughness: typeData.roughness ?? 0.5,
            metalness: typeData.metalness ?? 0.0,
            flatShading: typeData.flatShading ?? false
        });
        if (typeData.emissive) {
            material.emissive = new THREE.Color(typeData.emissive);
            material.emissiveIntensity = typeData.emissiveIntensity ?? 1.0;
        }

        const enemyMesh = new THREE.Mesh(geometry, material);
        enemyMesh.radius = geometry.boundingSphere.radius;
        // Store original material properties on userData for hit effects
        enemyMesh.userData.originalEmissiveHex = material.emissive ? material.emissive.getHex() : 0x000000;
        return enemyMesh;
    };
}

export function spawnEnemyByType(typeId, forcedPosition = null) {
    const typeData = ENEMY_TYPES[typeId];
    if (!typeData) return;

    // 1. Get the InstancedMesh and an available index from the pool
    const instancedMesh = state.instancedMeshes[typeId];
    const poolName = `pool_${typeId}`;
    const pool = state.objectPools[poolName];

    if (!instancedMesh || !pool || pool.length === 0) {
        console.warn(`[SPAWN_FAIL] Pool empty for ${typeId}. Pool length: ${pool?.length}`);
        // console.warn(`No available instances in pool for ${typeId}`);
        return; // Pool is full, cannot spawn this enemy
    }

    const instanceId = pool.pop(); // Get an available index
    instancedMesh.count = Math.max(instancedMesh.count, instanceId + 1);

    // 2. Determine spawn position
    let spawnPosition;
    if (forcedPosition) {
        spawnPosition = forcedPosition;
    } else {
        // Mobile: spawn at screen edge (closer). Desktop: spawn further out.
        const spawnRadius = state.isTouchDevice ? 18 : 35;
        const angle = Math.random() * Math.PI * 2;
        let x = state.player.position.x + Math.cos(angle) * spawnRadius;
        let z = state.player.position.z + Math.sin(angle) * spawnRadius;
        x = THREE.MathUtils.clamp(x, -CONSTANTS.WORLD_BOUNDARY, CONSTANTS.WORLD_BOUNDARY);
        z = THREE.MathUtils.clamp(z, -CONSTANTS.WORLD_BOUNDARY, CONSTANTS.WORLD_BOUNDARY);
        spawnPosition = new THREE.Vector3(x, 0, z);
    }

    spawnPosition.y = 0;

    // 3. Set the instance's transform
    state.dummy.position.copy(spawnPosition);
    state.dummy.scale.set(1, 1, 1); // Make it visible
    state.dummy.updateMatrix();
    instancedMesh.setMatrixAt(instanceId, state.dummy.matrix);
    instancedMesh.instanceMatrix.needsUpdate = true;

    // 4. Set the instance's color (reset to default)
    instancedMesh.setColorAt(instanceId, instancedMesh.userData.baseColor);
    instancedMesh.instanceColor.needsUpdate = true;

    // 5. Create the ENEMY DATA object
    let finalHealth = (6 + (state.playerLevel * 2.0) + (state.gameTime * 0.020)) * (typeData.healthMultiplier || 1.0);
    let finalXp = (4 + state.playerLevel * 1.5 + state.gameTime * 0.012) * (typeData.xpMultiplier || 1.0);

    const enemyData = {
        type: typeId,
        instanceId: instanceId, // CRITICAL: Link to the instanced mesh
        position: spawnPosition, // Store its logical position
        radius: instancedMesh.userData.radius,
        ...typeData,
        health: Math.max(1, finalHealth),
        xpValue: Math.max(1, Math.floor(finalXp)),
        currentSpeed: typeData.speed ?? 1.0,
        spawnTimestamp: state.gameTime,
    };

    // 6. Add the DATA to the main enemy list
    state.shapes.push(enemyData);
}

export function spawnSplitterOffspring(position, generation) {
    if (generation >= 3) return;

    const typeId = 'GLITCH_HORROR';
    const typeData = ENEMY_TYPES[typeId];

    // 1. Get InstancedMesh and index
    const instancedMesh = state.instancedMeshes[typeId];
    const poolName = `pool_${typeId}`;
    const pool = state.objectPools[poolName];

    if (!instancedMesh || !pool || pool.length === 0) {
        return;
    }

    const instanceId = pool.pop();
    instancedMesh.count = Math.max(instancedMesh.count, instanceId + 1);

    // 2. Calculate new properties
    const newWidth = Math.max(0.5, (typeData.size[0] / (generation + 1)));
    const originalRadius = instancedMesh.userData.radius;
    const scale = newWidth / (typeData.size[0] * 0.5);

    const health = Math.max(2, (4 + state.playerLevel * 1.2 + state.gameTime * 0.015) * (typeData.healthMultiplier || 1) / (generation * 1.8 + 1));
    const xp = Math.max(1, (3 + state.playerLevel + state.gameTime * 0.005) * typeData.xpMultiplier / (generation * 1.5 + 1));
    const speed = typeData.speed * (1 + generation * 0.15);

    // 3. Set transform with new scale
    const spawnPosition = position.clone();
    spawnPosition.y = 0.1;
    spawnPosition.x += (Math.random() - 0.5) * 0.6;
    spawnPosition.z += (Math.random() - 0.5) * 0.6;

    state.dummy.position.copy(spawnPosition);
    state.dummy.scale.set(scale, scale, scale);
    state.dummy.updateMatrix();
    instancedMesh.setMatrixAt(instanceId, state.dummy.matrix);
    instancedMesh.instanceMatrix.needsUpdate = true;

    // 4. Reset color
    instancedMesh.setColorAt(instanceId, instancedMesh.userData.baseColor);
    instancedMesh.instanceColor.needsUpdate = true;

    // 5. Create data object
    const enemyData = {
        type: typeId,
        instanceId: instanceId,
        position: spawnPosition,
        radius: (typeData.size[0] * 0.5) * scale,
        health,
        xpValue: xp,
        speed,
        currentSpeed: speed,
        dropsCache: false,
        generation: generation + 1,
        damageMultiplier: typeData.damageMultiplier * 0.7,
        spawnTimestamp: state.gameTime,
    };

    // 6. Add to main enemy list
    state.shapes.push(enemyData); // Or state.enemies.push(enemyData)
}

// This function REPLACES the logic for returning enemies to a pool.
// You must call this from your main game loop when an enemy's health <= 0.
export function returnEnemyToPool(enemy) {
    if (!enemy || enemy.instanceId === undefined) return;

    const typeId = enemy.type;
    const instanceId = enemy.instanceId;

    const instancedMesh = state.instancedMeshes[typeId];
    const pool = state.objectPools[`pool_${typeId}`];

    if (!instancedMesh || !pool) return;

    // 1. "Hide" the instance by moving it far off-screen AND setting scale to 0
    // IMPORTANT: Reset position to prevent stale data in the matrix
    state.dummy.position.set(0, -1000, 0); // Move far below the world
    state.dummy.scale.set(0, 0, 0);
    state.dummy.rotation.set(0, 0, 0);
    state.dummy.updateMatrix();
    instancedMesh.setMatrixAt(instanceId, state.dummy.matrix);
    instancedMesh.instanceMatrix.needsUpdate = true;

    // 2. Return its index to the pool for reuse
    pool.push(instanceId);
}

// Chest rarity tiers with colors and reward counts
const CHEST_RARITIES = {
    COMMON: { name: 'Common', color: 0x8B4513, glowColor: 0xD2691E, emissive: 0x3D1F00, rewards: 1, weight: 60 },
    RARE: { name: 'Rare', color: 0x4169E1, glowColor: 0x00BFFF, emissive: 0x001166, rewards: 3, weight: 30 },
    EPIC: { name: 'Epic', color: 0x9932CC, glowColor: 0xFF00FF, emissive: 0x330033, rewards: 4, weight: 8 },
    LEGENDARY: { name: 'Legendary', color: 0xFFD700, glowColor: 0xFFD700, emissive: 0x664400, rewards: 5, weight: 2 }
};

function rollChestRarity() {
    const totalWeight = Object.values(CHEST_RARITIES).reduce((sum, r) => sum + r.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const [key, rarity] of Object.entries(CHEST_RARITIES)) {
        roll -= rarity.weight;
        if (roll <= 0) return { key, ...rarity };
    }
    return { key: 'COMMON', ...CHEST_RARITIES.COMMON };
}

export function spawnGeometricCache(position, forcedRarityKey = null) {
    const cacheSize = CONSTANTS.CACHE_RADIUS * 1.5;

    // Determine rarity: use forced key if provided, otherwise roll randomly
    let rarity;
    if (forcedRarityKey && CHEST_RARITIES[forcedRarityKey]) {
        rarity = { key: forcedRarityKey, ...CHEST_RARITIES[forcedRarityKey] };
    } else {
        rarity = rollChestRarity();
    }

    // Create a chest group with base and lid
    const chestGroup = new THREE.Group();
    chestGroup.position.copy(position);
    const baseY = cacheSize * 0.5;
    chestGroup.position.y = baseY;

    // Scale based on rarity (legendary is bigger)
    const rarityScale = 1 + (rarity.rewards - 1) * 0.15;

    // Chest base (bottom half)
    const baseGeometry = new THREE.BoxGeometry(cacheSize * 1.2 * rarityScale, cacheSize * 0.6 * rarityScale, cacheSize * 0.8 * rarityScale);
    const baseMaterial = new THREE.MeshStandardMaterial({
        color: rarity.color,
        emissive: rarity.emissive,
        emissiveIntensity: 0.3 + rarity.rewards * 0.1,
        roughness: 0.3,
        metalness: 0.6
    });
    const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
    baseMesh.position.y = -cacheSize * 0.15 * rarityScale;
    chestGroup.add(baseMesh);

    // Chest lid (top half)
    const lidGeometry = new THREE.BoxGeometry(cacheSize * 1.2 * rarityScale, cacheSize * 0.4 * rarityScale, cacheSize * 0.8 * rarityScale);
    const lidMaterial = new THREE.MeshStandardMaterial({
        color: rarity.color,
        emissive: rarity.glowColor,
        emissiveIntensity: 0.4 + rarity.rewards * 0.15,
        roughness: 0.2,
        metalness: 0.7
    });
    const lidMesh = new THREE.Mesh(lidGeometry, lidMaterial);

    // Lid pivot point (hinge at the back)
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, cacheSize * 0.15 * rarityScale, -cacheSize * 0.4 * rarityScale);
    lidMesh.position.set(0, cacheSize * 0.2 * rarityScale, cacheSize * 0.4 * rarityScale);
    lidPivot.add(lidMesh);
    chestGroup.add(lidPivot);

    // Glow ring around chest (brighter for higher rarity)
    const glowGeometry = new THREE.RingGeometry(cacheSize * 0.8 * rarityScale, cacheSize * 1.4 * rarityScale, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: rarity.glowColor,
        transparent: true,
        opacity: 0.3 + rarity.rewards * 0.1,
        side: THREE.DoubleSide
    });
    const glowRing = new THREE.Mesh(glowGeometry, glowMaterial);
    glowRing.rotation.x = -Math.PI / 2;
    glowRing.position.y = -cacheSize * 0.4 * rarityScale;
    chestGroup.add(glowRing);

    chestGroup.castShadow = true;
    chestGroup.userData.isOpeningCache = false;
    chestGroup.userData.lidPivot = lidPivot;
    chestGroup.userData.glowRing = glowRing;
    chestGroup.userData.baseMesh = baseMesh;
    chestGroup.userData.lidMesh = lidMesh;
    chestGroup.userData.rarity = rarity;

    const cache = {
        mesh: chestGroup,
        baseY: baseY,
        bobTimer: Math.random() * Math.PI * 2,
        pulseTimer: 0,
        rarity: rarity
    };
    state.geometricCaches.push(cache);
    state.scene.add(chestGroup);
}

export function spawnDataFragment(position, value) {
    const orbGeometry = new THREE.TetrahedronGeometry(CONSTANTS.DATA_FRAGMENT_RADIUS, 0);
    const orbMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true });
    const orbMesh = new THREE.Mesh(orbGeometry, orbMaterial);
    orbMesh.position.set(position.x, CONSTANTS.DATA_FRAGMENT_RADIUS * 1.2, position.z);
    const fragment = { mesh: orbMesh, xpValue: Math.max(1, Math.floor(value)) };
    state.dataFragments.push(fragment);
    state.scene.add(orbMesh);
}

export function spawnMegaDataFragment(xpAmount) {
    if (!state.player || xpAmount <= 0) return;
    const orbGeometry = new THREE.IcosahedronGeometry(CONSTANTS.PROJECTILE_RADIUS * 2.5, 0);
    const orbMaterial = new THREE.MeshStandardMaterial({ color: 0xFF8C00, emissive: 0xFF8C00, emissiveIntensity: 0.5 });
    const orbMesh = new THREE.Mesh(orbGeometry, orbMaterial);
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = 4 + Math.random() * 2;
    orbMesh.position.set(state.player.position.x + Math.cos(angle) * spawnDist, CONSTANTS.PROJECTILE_RADIUS * 2.5, state.player.position.z + Math.sin(angle) * spawnDist);
    const fragment = { mesh: orbMesh, xpValue: Math.max(1, Math.floor(xpAmount)), isMega: true };
    state.megaDataFragments.push(fragment);
    state.scene.add(orbMesh);
    playSoundSynth('cache_open', 0.35);
}

export function spawnRepairNode() {
    const pickupSize = CONSTANTS.REPAIR_NODE_RADIUS * 2;
    const barWidth = pickupSize * 0.25;
    const geometry1 = new THREE.BoxGeometry(pickupSize, barWidth, barWidth);
    const geometry2 = new THREE.BoxGeometry(barWidth, pickupSize, barWidth);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.85 });
    const group = new THREE.Group();
    group.add(new THREE.Mesh(geometry1, material), new THREE.Mesh(geometry2, material));
    const angle = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * (CONSTANTS.WORLD_BOUNDARY * 0.85 - 10);
    group.position.set(state.player.position.x + Math.cos(angle) * dist, pickupSize * 0.5 + 0.2, state.player.position.z + Math.sin(angle) * dist);
    const pickup = { mesh: group, shieldValue: 35 };
    state.repairNodes.push(pickup);
    state.scene.add(group);
}

export function spawnEnergyCore() {
    const geometry = new THREE.OctahedronGeometry(CONSTANTS.ENERGY_CORE_RADIUS, 0);
    const material = new THREE.MeshBasicMaterial({ color: 0xcc00cc, wireframe: true, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geometry, material);
    const angle = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * (CONSTANTS.WORLD_BOUNDARY * 0.85 - 10);
    mesh.position.set(state.player.position.x + Math.cos(angle) * dist, CONSTANTS.ENERGY_CORE_RADIUS + 0.2, state.player.position.z + Math.sin(angle) * dist);
    const pickup = { mesh: mesh, xpValue: 50 + state.playerLevel * 15 };
    state.energyCores.push(pickup);
    state.scene.add(mesh);
}


// =================================================================================
// --- POOLED VISUAL EFFECTS ---
// =================================================================================

// In src/game/spawner.js

// ... (keep all your other imports and functions) ...

// =================================================================================
// --- POOLED VISUAL EFFECTS ---
// =================================================================================

// MODIFICATION: Add the 'tempVisualEffects' pool here
export function initializeEffectPools() {
    const particleGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    // Pool for burst particles
    const burstPoolName = 'burstParticles';
    state.objectPools[burstPoolName] = [];
    for (let i = 0; i < 600; i++) {
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const mesh = new THREE.Mesh(particleGeometry, material);
        mesh.visible = false;
        state.scene.add(mesh);
        state.objectPools[burstPoolName].push(mesh);
    }

    // --- NEW POOL FOR TEMPORARY EFFECTS ---
    // This pool will hold more generic meshes for things like boss shockwaves.
    const tempEffectPoolName = 'tempVisualEffects';
    state.objectPools[tempEffectPoolName] = [];
    const tempEffectGeometry = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 100; i++) {
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, wireframe: true });
        const mesh = new THREE.Mesh(tempEffectGeometry.clone(), material); // Clone geometry to be safe
        mesh.visible = false;
        state.scene.add(mesh);
        state.objectPools[tempEffectPoolName].push(mesh);
    }
}


// ... (keep createBurstEffect and other functions as they are) ...


// --- FULLY REPLACED AND CORRECTED FUNCTION ---
export function createTemporaryVisualEffect(position, radius, color, duration, wireframe = false, geometry = null) {
    // 1. Get a reusable mesh from the pool.
    const effectMesh = getFromPool('tempVisualEffects', () => null); // Don't create new ones if pool is empty
    if (!effectMesh) return; // Fail gracefully if pool is exhausted

    // 2. Configure the mesh for this specific effect.
    if (geometry) {
        // This is advanced, but allows for custom shapes like the evolved Repulsor Wave torus
        // For now, we'll assume the default Icosahedron is sufficient for most cases.
    }
    effectMesh.position.copy(position);
    effectMesh.scale.set(0.1, 0.1, 0.1); // Start small for a "pop-in" effect

    // Configure material properties
    const mat = effectMesh.material;
    mat.color.setHex(color);
    mat.wireframe = wireframe;
    mat.opacity = 1.0;

    // --- 3. THE CRITICAL FIX: Add self-destruction logic ---
    const life = duration;
    let elapsed = 0;

    effectMesh.userData.update = (p, deltaTime) => {
        elapsed += deltaTime;
        const progress = Math.min(1.0, elapsed / life);

        // Animate scale and opacity over the effect's lifetime
        const currentScale = radius * progress;
        p.scale.set(currentScale, currentScale, currentScale);
        mat.opacity = 1.0 - progress;

        if (progress >= 1.0) {
            // Life is over. Remove the update function and return to the pool.
            p.userData.update = null; // This stops it from being processed further
            returnToPool('tempVisualEffects', p);
        }
    };

    // 4. Add the effect to the main update loop so its brain can run.
    state.effectsToUpdate.push(effectMesh);
}

export function createBurstEffect(position, count = 10, color = 0xffffff, speed = 4, duration = 0.5) {
    for (let i = 0; i < count; i++) {
        const particle = getFromPool('burstParticles', () => null);
        if (!particle) continue;
        particle.material.color.setHex(color);
        particle.position.copy(position);
        const life = duration * (0.7 + Math.random() * 0.6);
        const velocity = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize().multiplyScalar(speed * (0.8 + Math.random() * 0.4));
        particle.userData.life = life;
        particle.userData.update = (p, deltaTime) => {
            p.position.addScaledVector(velocity, deltaTime);
            p.userData.life -= deltaTime;
            if (p.userData.life <= 0) {
                p.userData.update = null;
                returnToPool('burstParticles', p);
            }
        };
        state.effectsToUpdate.push(particle);
    }
}

export function initializeDamageNumberPool() {
    if (!ui.damageNumbersContainer) return;
    const poolName = 'damageNumbers';
    state.objectPools[poolName] = [];
    for (let i = 0; i < 100; i++) {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.display = 'none';
        ui.damageNumbersContainer.appendChild(el);
        state.objectPools[poolName].push(el);
    }
}

// REPLACE your old createDamageNumber function with this one.



export function createHitEffect(enemyData, hitColor = 0xffffff, duration = 0.15) {
    // We now pass the ENEMY DATA object, not the mesh
    if (!enemyData || enemyData.instanceId === undefined || enemyData.isHit) return;

    const instancedMesh = state.instancedMeshes[enemyData.type];
    if (!instancedMesh) return;

    enemyData.isHit = true; // Flag on the data object
    const instanceId = enemyData.instanceId;

    // Get the instance's original base color
    const originalColor = instancedMesh.userData.baseColor;

    // Set the hit color
    state.tempColor.setHex(hitColor);
    instancedMesh.setColorAt(instanceId, state.tempColor);
    instancedMesh.instanceColor.needsUpdate = true;

    const effect = {
        life: duration,
        update: (eff, deltaTime) => {
            eff.life -= deltaTime;
            if (eff.life <= 0) {
                // Restore original color
                instancedMesh.setColorAt(instanceId, originalColor);
                instancedMesh.instanceColor.needsUpdate = true;
                enemyData.isHit = false;
                eff.update = null;
            }
        }
    };
    state.effectsToUpdate.push(effect);
}



// =================================================================================
// --- HELPER FUNCTIONS ---
// =================================================================================

function worldToScreen(position) {
    if (!state.camera || !state.renderer) return null;
    const vector = position.clone().project(state.camera);
    const canvas = state.renderer.domElement;
    if (vector.z > 1) return null;
    return {
        x: (vector.x * (canvas.clientWidth / 2)) + (canvas.clientWidth / 2),
        y: -(vector.y * (canvas.clientHeight / 2)) + (canvas.clientHeight / 2)
    };
}

export function getScreenEdgesInWorldSpace() {
    // Guard clause: Ensure all necessary Three.js objects are initialized.
    if (!state.camera || !state.raycaster || !state.groundPlane) {
        console.error("getScreenEdgesInWorldSpace requires camera, raycaster, and groundPlane to be initialized in the state.");
        return { valid: false };
    }

    // These are the four corners of the screen in Normalized Device Coordinates (NDC),
    // which range from -1 to 1 on both axes.
    const ndcCorners = [
        new THREE.Vector2(-1, 1), // Top-left
        new THREE.Vector2(1, 1),  // Top-right
        new THREE.Vector2(1, -1), // Bottom-right
        new THREE.Vector2(-1, -1) // Bottom-left
    ];

    const worldCorners = [];

    // Project each screen corner into the 3D world.
    for (const corner of ndcCorners) {
        // Set the raycaster to shoot a ray from the camera through the screen corner.
        state.raycaster.setFromCamera(corner, state.camera);

        const intersectPoint = new THREE.Vector3();

        // Find the point where this ray intersects the infinite ground plane.
        if (state.raycaster.ray.intersectPlane(state.groundPlane, intersectPoint)) {
            worldCorners.push(intersectPoint);
        }
    }

    // If we couldn't find all four intersection points, the result is invalid.
    if (worldCorners.length < 4) {
        return { valid: false };
    }

    // Now, find the minimum and maximum X and Z values from the four world corners.
    // This gives us a 2D bounding box in world space that represents the screen.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    worldCorners.forEach(point => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
    });

    // Return the complete, valid bounding box.
    return { minX, maxX, minZ, maxZ, valid: true };
}

