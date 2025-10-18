import * as THREE from 'three';
import { state, CONSTANTS } from '../state.js';
import { ENEMY_TYPES } from '../config/enemies.js';
import { playSoundSynth } from '../utils/audio.js';
import { ui } from '../ui/dom.js';

// --- Horde Progression Timeline ---
// This defines the entire spawning flow for a run.
// In js/systems/spawner.js

// --- Horde Progression Timeline (10-Minute Run) ---
// This timeline introduces overlapping hordes and elite support enemies.
const HORDE_TIMELINE = [
    // === PHASE 1: The Onslaught Begins (0:00 - 2:00) ===
    // Objective: Teach basic movement and dodging.
    { startTime: 5,   duration: 50, type: 'CUBE_CRUSHER',  calmDuration: 15 }, // Standard intro. Ends at 1:10.
    { startTime: 70,  duration: 60, type: 'TETRA_SWARMER', calmDuration: 20 }, // Introduce fast, numerous enemies. Ends at 2:10.

    // === PHASE 2: New Threats (2:10 - 4:30) ===
    // Objective: Introduce special abilities and armor.
    { startTime: 150, duration: 10, type: 'SPHERE_SPLITTER', calmDuration: 25 }, // Short, intense wave to manage performance. Ends at 3:35.
    { startTime: 150,   duration: 100, type: 'CUBE_CRUSHER',  calmDuration: 15 },
    { startTime: 215, duration: 60, type: 'ICOSAHEDRON_INVADER', calmDuration: 25 }, // Introduce the "Tough" enemy type. Ends at 4:20.

    // === PHASE 3: The Gauntlet (4:30 - 7:00) ===
    // Objective: Combine hordes to test player prioritization.
    { startTime: 275, duration: 65, type: 'PRISM_DASHER',  calmDuration: 20 }, // A full wave of dangerous dashers. Ends at 5:40.
    // ** OVERLAP! ** While dashers are still spawning, swarmers return.
    { startTime: 315, duration: 40, type: 'TETRA_SWARMER', calmDuration: 0, isMiniHorde: true }, // Swarmers create chaos for the dashers.

    // === PHASE 4: The Corrupted Zone (7:00 - 9:45) ===
    // Objective: High-stakes survival with area denial and ranged threats.
    { startTime: 420, duration: 70, type: 'CYLINDER_CORRUPTER', calmDuration: 25 }, // Introduce area denial. Ends at 8:15.
    // ** OVERLAP! ** Ranged casters support the corrupters.
    { startTime: 460, duration: 50, type: 'CONE_CASTER', calmDuration: 0, isMiniHorde: true }, // Forces movement while corrupters chase.

    // === FINAL CLIMAX (before the boss) ===
    { startTime: 535, duration: 45, type: 'DODECAHEDRON_DRIFTER', calmDuration: 20 }, // The final, tanky drifters. Ends at 9:40.
    // The game enters a final "Calm" phase from 580s (9:40) to 600s, allowing the player to prepare for the boss.
];

// =================================================================================
// --- DIRECTOR: Main Spawning Orchestration ---
// =================================================================================

export function handleSpawning(deltaTime) {
    if (state.isBossWave) {
        handleBossWave(deltaTime);
        return;
    }

    handleBossSpawnTrigger(); // Checks if it's time for the boss

    // Always check for the next horde, even during a calm phase.
    const nextHorde = HORDE_TIMELINE[state.hordeIndex];
    if (nextHorde && state.gameTime >= nextHorde.startTime) {
        transitionToHorde(nextHorde);
    }

    // Process current state
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
// --- HORDE STATE MACHINE ---
// =================================================================================

function transitionToHorde(hordeConfig) {
    if (hordeConfig.isMiniHorde) {
        console.log(`%c-- Overlapping Mini-Horde: ${hordeConfig.type}`, 'color: red; font-weight: bold;');
        // Don't change the main spawner state for mini-hordes
    } else {
        console.log(`%cStarting Main Horde: ${hordeConfig.type}`, 'color: orange; font-weight: bold;');
        state.spawnerState = 'HORDE_ACTIVE';
        state.hordeTimer = hordeConfig.duration;
    }

    state.currentHordeEnemyType = hordeConfig.type; // This will be used by spawnHordeWave
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
        console.log(`%cHorde complete. Calm phase for ${calmDuration}s.`, 'color: cyan;');
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
        if (Math.random() < 0.65) spawnRepairNode();
        else spawnEnergyCore();
    }

    state.eliteSpawnTimer += deltaTime;
    if (state.eliteSpawnTimer > 18) { // Slower elite spawn in calm
        state.eliteSpawnTimer = 0;
        // Spawn elites based on how far into the game we are
        if (state.gameTime > 400 && Math.random() < 0.3) {
            spawnEnemyByType('OCTAHEDRON_OBSTACLE');
        } else if (state.gameTime > 180 && Math.random() < 0.5) {
            spawnEnemyByType('PYRAMID_PIERCER');
        }
    }
}

function spawnHordeWave() {
    let budget = Math.min(15 + Math.floor(state.gameTime / 20) + state.playerLevel * 2.5, 80);
    const maxSpawns = 18;
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
    const fillerTypeData = ENEMY_TYPES['CUBE_CRUSHER'];
    while (budget >= fillerTypeData.cost && spawnedCount < maxSpawns) {
        spawnEnemyByType('CUBE_CRUSHER');
        budget -= fillerTypeData.cost;
        spawnedCount++;
    }
}

// =================================================================================
// --- BOSS & MISC LOGIC ---
// =================================================================================

function handleBossWave(deltaTime) {
    const bossExists = state.shapes.some(s => s.userData?.type === 'BOSS_OCTA_PRIME' && s.parent);
    if (!bossExists) {
        spawnEnemyByType('BOSS_OCTA_PRIME');
    }
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

    Object.keys(ENEMY_TYPES).forEach(typeId => {
        const poolName = `pool_${typeId}`;
        state.objectPools[poolName] = [];
        const initialSize = (typeId === 'TETRA_SWARMER' || typeId === 'CUBE_CRUSHER') ? 40 : 15;
        for(let i = 0; i < initialSize; i++) {
            const enemy = createEnemyFactory(typeId)();
            if(enemy) {
                enemy.visible = false;
                state.objectPools[poolName].push(enemy);
            }
        }
    });
    console.log("All object pools initialized.");
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

    const poolName = `pool_${typeId}`;
    const enemyMesh = getFromPool(poolName, createEnemyFactory(typeId));
    if (!enemyMesh) return;

    if (forcedPosition) {
        enemyMesh.position.copy(forcedPosition);
    } else {
        const spawnRadius = 35;
        const angle = Math.random() * Math.PI * 2;
        let x = state.player.position.x + Math.cos(angle) * spawnRadius;
        let z = state.player.position.z + Math.sin(angle) * spawnRadius;
        x = THREE.MathUtils.clamp(x, -CONSTANTS.WORLD_BOUNDARY, CONSTANTS.WORLD_BOUNDARY);
        z = THREE.MathUtils.clamp(z, -CONSTANTS.WORLD_BOUNDARY, CONSTANTS.WORLD_BOUNDARY);
        enemyMesh.position.set(x, 0, z);
    }

    enemyMesh.position.y = enemyMesh.radius;

    let finalHealth = (6 + (state.playerLevel * 2.0) + (state.gameTime * 0.020)) * (typeData.healthMultiplier || 1.0);
    let finalXp = (4 + state.playerLevel * 1.5 + state.gameTime * 0.012) * (typeData.xpMultiplier || 1.0);

    enemyMesh.userData = {
        type: typeId,
        ...typeData,
        health: Math.max(1, finalHealth),
        xpValue: Math.max(1, Math.floor(finalXp)),
        currentSpeed: typeData.speed ?? 1.0,
        spawnTimestamp: state.gameTime,
        poolName: poolName
    };

    state.scene.add(enemyMesh);
    state.shapes.push(enemyMesh);
}

export function spawnSplitterOffspring(position, generation) {
    if (generation >= 3) return;

    const typeId = 'SPHERE_SPLITTER';
    const typeData = ENEMY_TYPES[typeId];
    const poolName = `pool_${typeId}`;
    const offspringMesh = getFromPool(poolName, createEnemyFactory(typeId));
    if (!offspringMesh) return;

    const newRadius = Math.max(0.2, (typeData.size[0] / (generation + 1)));

    // We need to rescale the pooled mesh
    const scale = newRadius / offspringMesh.geometry.parameters.radius;
    offspringMesh.scale.set(scale, scale, scale);

    const health = Math.max(2, (4 + state.playerLevel * 1.2 + state.gameTime * 0.015) * (typeData.healthMultiplier || 1) / (generation * 1.8 + 1));
    const xp = Math.max(1, (3 + state.playerLevel + state.gameTime * 0.005) * typeData.xpMultiplier / (generation * 1.5 + 1));
    const speed = typeData.speed * (1 + generation * 0.15);

    offspringMesh.position.copy(position);
    offspringMesh.position.y = newRadius;
    offspringMesh.position.x += (Math.random() - 0.5) * 0.6;
    offspringMesh.position.z += (Math.random() - 0.5) * 0.6;
    offspringMesh.radius = newRadius;

    offspringMesh.userData = {
        type: typeId,
        health,
        xpValue: xp,
        speed,
        currentSpeed: speed,
        dropsCache: false,
        generation: generation + 1,
        damageMultiplier: typeData.damageMultiplier * 0.7,
        spawnTimestamp: state.gameTime,
        poolName: poolName
    };

    state.scene.add(offspringMesh);
    state.shapes.push(offspringMesh);
}

export function spawnGeometricCache(position) {
    const cacheSize = CONSTANTS.CACHE_RADIUS * 1.5;
    const geometry = new THREE.DodecahedronGeometry(cacheSize, 0);
    const material = new THREE.MeshStandardMaterial({ color: 0xDAA520, emissive: 0x443300, roughness: 0.3, metalness: 0.4 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    const baseY = cacheSize * 0.5;
    mesh.position.y = baseY;
    mesh.castShadow = true;
    mesh.userData.isOpeningCache = false;
    const cache = { mesh: mesh, baseY: baseY, bobTimer: Math.random() * Math.PI * 2 };
    state.geometricCaches.push(cache);
    state.scene.add(mesh);
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

export function initializeEffectPools() {
    const particleGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const poolName = 'burstParticles';
    state.objectPools[poolName] = [];
    for (let i = 0; i < 300; i++) {
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const mesh = new THREE.Mesh(particleGeometry, material);
        mesh.visible = false;
        state.scene.add(mesh);
        state.objectPools[poolName].push(mesh);
    }
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
    for (let i = 0; i < 40; i++) {
        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.display = 'none';
        ui.damageNumbersContainer.appendChild(el);
        state.objectPools[poolName].push(el);
    }
}

export function createDamageNumber(position, amount, isCritical = false) {
    if (!ui.damageNumbersContainer) return;
    const el = getFromPool('damageNumbers', () => {
        const newEl = document.createElement('div');
        newEl.style.position = 'absolute';
        ui.damageNumbersContainer.appendChild(newEl);
        return newEl;
    });
    el.className = 'damage-number';
    if (isCritical) {
        el.classList.add('critical');
        el.textContent = `${Math.round(amount)}!!`;
    } else {
        el.textContent = String(Math.round(amount));
    }
    const screenPos = worldToScreen(position);
    if (!screenPos) { returnToPool('damageNumbers', el); return; }
    el.style.left = `${screenPos.x}px`;
    el.style.top = `${screenPos.y}px`;
    el.style.animation = 'damage-anim 0.8s ease-out forwards';
    setTimeout(() => {
        el.style.animation = 'none';
        returnToPool('damageNumbers', el);
    }, 800);
}

export function createHitEffect(targetMesh, hitColor = 0xffffff, duration = 0.15) {
    if (!targetMesh || !targetMesh.material) return;
    const mat = Array.isArray(targetMesh.material) ? targetMesh.material[0] : targetMesh.material;
    if (!mat || mat.userData.isHit) return;
    mat.userData.isHit = true;
    let originalColor, isEmissive = false;
    if (mat.emissive && mat.emissive.isColor) {
        isEmissive = true;
        originalColor = mat.userData.originalEmissiveHex ?? mat.emissive.getHex();
        mat.userData.originalEmissiveHex = originalColor;
        mat.emissive.setHex(hitColor);
    } else if (mat.color?.isColor) {
        originalColor = mat.userData.originalColorHex ?? mat.color.getHex();
        mat.userData.originalColorHex = originalColor;
        mat.color.setHex(hitColor);
    } else { return; }
    const effect = {
        life: duration,
        update: (eff, deltaTime) => {
            eff.life -= deltaTime;
            if (eff.life <= 0) {
                if (isEmissive) mat.emissive.setHex(originalColor);
                else mat.color.setHex(originalColor);
                mat.userData.isHit = false;
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

export function createTemporaryVisualEffect(position, radius, color, duration, wireframe = false) {
    // 1. Get a reusable mesh from the pool
    const effectMesh = getFromPool('tempVisualEffects', () => {
        // Fallback in case the pool is empty (shouldn't happen often)
        const geometry = new THREE.IcosahedronGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({color: 0xffffff, transparent: true});
        const mesh = new THREE.Mesh(geometry, material);
        state.scene.add(mesh);
        return mesh;
    });

    // 2. Configure the mesh for this specific effect
    effectMesh.position.copy(position);
    effectMesh.scale.set(0.1, 0.1, 0.1); // Start small

    // Configure material properties
    const mat = effectMesh.material;
    mat.color.setHex(color);
    mat.wireframe = wireframe;
    mat.opacity = 1.0;

    // 3. Create a unique "brain" (update function) for the effect's animation
    const effect = {
        mesh: effectMesh,
        life: duration,
        totalLife: duration,
        targetRadius: radius,
        update: (eff, deltaTime) => {
            eff.life -= deltaTime;

            // Calculate progress (from 0 to 1)
            const progress = 1.0 - (eff.life / eff.totalLife);

            // Animate scale and opacity
            const currentScale = eff.targetRadius * progress;
            eff.mesh.scale.set(currentScale, currentScale, currentScale);
            eff.mesh.material.opacity = 1.0 - progress;

            // 4. When life is over, return to pool
            if (eff.life <= 0) {
                eff.update = null; // Signal for removal from the update loop
                returnToPool('tempVisualEffects', eff.mesh);
            }
        }
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

