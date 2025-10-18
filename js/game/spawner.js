import { state, CONSTANTS } from '../state.js';
import { ENEMY_TYPES } from '../config/enemies.js';
import { playSoundSynth } from '../utils/audio.js';
import { ui } from '../ui/dom.js';

// --- Object Pooling ---
export function getFromPool(poolName, createFunc) {
    if (state.objectPools[poolName] && state.objectPools[poolName].length > 0) {
        return state.objectPools[poolName].pop();
    }
    return createFunc();
}

export function returnToPool(poolName, object, resetFunc) {
    if (!state.objectPools[poolName]) return;
    if (resetFunc) resetFunc(object);

    if (state.objectPools[poolName].length < CONSTANTS.MAX_POOL_SIZE[poolName]) {
        state.objectPools[poolName].push(object);
    } else {
        object.geometry?.dispose();
        if (object.material) {
            if (Array.isArray(object.material)) {
                object.material.forEach(m => m?.dispose());
            } else {
                object.material.dispose();
            }
        }
    }
}

// --- Spawning Orchestration ---
export function handleSpawning(deltaTime) {
    if (state.isBossWave) {
        handleBossWave(deltaTime);
    } else {
        handleBossSpawnTrigger();
        handleRegularSpawning(deltaTime);
    }
}

function handleBossWave(deltaTime) {
    const bossExists = state.shapes.some(s => s.userData?.type === 'BOSS_OCTA_PRIME' && s.parent);
    if (!bossExists) {
        spawnEnemyByType('BOSS_OCTA_PRIME');
    }
    // Also handle pickups during boss wave
    state.pickupSpawnTimer += deltaTime;
    if (state.pickupSpawnTimer > 12) { // Slower pickup spawn during boss
        state.pickupSpawnTimer = 0;
        if (Math.random() < 0.7) spawnRepairNode();
    }
}

function handleBossSpawnTrigger() {
    if (state.gameTime >= state.nextBossTime && !state.isBossWave) {
        state.isBossWave = true;
        spawnEnemyByType('BOSS_OCTA_PRIME');
    }
}

function handleRegularSpawning(deltaTime) {
    const timeFactor = Math.min(1, state.gameTime / (60 * 5)); // Reaches max effect at 5 minutes

    // Regular shape spawning gets faster over time
    state.shapeSpawnInterval = Math.max(0.15, 2.0 - (state.gameTime * 0.0035));
    state.shapeSpawnTimer += deltaTime;
    if (state.shapeSpawnTimer > state.shapeSpawnInterval) {
        state.shapeSpawnTimer = 0;
        spawnShapeWave();
    }

    // Elite spawning also gets faster over time and with player level
    const eliteBaseInterval = 25;
    const currentEliteInterval = Math.max(12, eliteBaseInterval - state.playerLevel * 0.5 - timeFactor * 5);
    state.eliteSpawnTimer += deltaTime;
    if (state.eliteSpawnTimer > currentEliteInterval) {
        state.eliteSpawnTimer = 0;
        if (state.gameTime > 90 && Math.random() < Math.min(0.6, 0.10 + state.playerLevel * 0.02 + timeFactor * 0.12)) {
            spawnEnemyByType('PYRAMID_PIERCER');
        }
        if (state.gameTime > 240 && Math.random() < Math.min(0.45, 0.07 + state.playerLevel * 0.015 + timeFactor * 0.10)) {
            spawnEnemyByType('OCTAHEDRON_OBSTACLE');
        }
    }

    // Pickup spawning gets faster over time
    const currentPickupInterval = Math.max(2.5, 8 - state.gameTime * 0.020);
    state.pickupSpawnTimer += deltaTime;
    if (state.pickupSpawnTimer > currentPickupInterval) {
        state.pickupSpawnTimer = 0;
        if (Math.random() < 0.6) spawnRepairNode();
        else spawnEnergyCore();
    }
}
function spawnShapeWave() {
    // This budget formula scales with both game time and player level for increasing difficulty
    let spawnPointsBudget = Math.min(8 + Math.floor(state.gameTime / 10) + state.playerLevel * 1.8, 55);
    const maxEnemiesPerWave = state.gameTime < 300 ? 15 : 22;

    let spawnedThisWave = 0;
    while (spawnPointsBudget > 0 && spawnedThisWave < maxEnemiesPerWave) {
        const enemyTypeId = selectEnemyTypeForHorde(spawnPointsBudget);
        if (!enemyTypeId) break;

        const typeData = ENEMY_TYPES[enemyTypeId];
        if (typeData && typeData.cost <= spawnPointsBudget) {
            spawnEnemyByType(enemyTypeId);
            spawnPointsBudget -= typeData.cost;
            spawnedThisWave++;
        } else {
            // Failsafe to prevent infinite loop if budget is too small for any available enemy
            break;
        }
    }
}

function selectEnemyTypeForHorde(budget) {
    // Gentler enemy introduction curve
    const timeThresholds = {
        TETRA_SWARMER: 30,      // Later start (was 20)
        ICOSAHEDRON_INVADER: 90,  // Later (was 75)
        SPHERE_SPLITTER: 180,    // Later (was 150)
        PRISM_DASHER: 270,       // Later (was 240)
        CYLINDER_CORRUPTER: 360, // Much later (was 330)
        CONE_CASTER: 450,        // Much later (was 420)
        DODECAHEDRON_DRIFTER: 540 // Much later (was 510)
    };
    const available = Object.keys(timeThresholds).filter(typeId =>
        state.gameTime >= timeThresholds[typeId] && ENEMY_TYPES[typeId].cost <= budget
    );

    // Always allow CUBE_CRUSHER as a basic enemy
    if (ENEMY_TYPES.CUBE_CRUSHER.cost <= budget) {
        available.push('CUBE_CRUSHER');
    }

    if (available.length > 0) {
        return available[Math.floor(Math.random() * available.length)];
    }
    return null;
}

// --- XP Orb Consolidation ---
export function handleXPOrbConsolidation() {
    if (state.accumulatedOffScreenXP >= CONSTANTS.MEGA_XP_THRESHOLD) {
        spawnMegaDataFragment(state.accumulatedOffScreenXP);
        state.accumulatedOffScreenXP = 0;
    }
}

// --- Object Spawners ---

export function spawnEnemyByType(typeId, forcedPosition = null) {
    const typeData = ENEMY_TYPES[typeId];
    if (!typeData) return;

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
    material.originalEmissiveHex = material.emissive ? material.emissive.getHex() : 0x000000;

    const enemyMesh = new THREE.Mesh(geometry, material);

    if (forcedPosition) {
        enemyMesh.position.copy(forcedPosition);
    } else {
        const spawnRadius = 35;
        const angle = Math.random() * Math.PI * 2;

        let x = state.player.position.x + Math.cos(angle) * spawnRadius;
        let z = state.player.position.z + Math.sin(angle) * spawnRadius;

        const enemyRadius = geometry.parameters.radius || 1.0;
        x = THREE.MathUtils.clamp(x, -CONSTANTS.WORLD_BOUNDARY + enemyRadius, CONSTANTS.WORLD_BOUNDARY - enemyRadius);
        z = THREE.MathUtils.clamp(z, -CONSTANTS.WORLD_BOUNDARY + enemyRadius, CONSTANTS.WORLD_BOUNDARY - enemyRadius);

        enemyMesh.position.set(x, 0, z);
    }

    geometry.computeBoundingSphere();
    enemyMesh.radius = geometry.boundingSphere.radius;
    enemyMesh.position.y = enemyMesh.radius;

    // Reduced enemy scaling for easier early game
    let finalHealth = (6 + (state.playerLevel * 2.0) + (state.gameTime * 0.020)) * (typeData.healthMultiplier || 1.0);
    let finalXp = (4 + state.playerLevel * 1.5 + state.gameTime * 0.012) * (typeData.xpMultiplier || 1.0);

    enemyMesh.userData = {
        type: typeId,
        ...typeData,
        health: Math.max(1, finalHealth),
        xpValue: Math.max(1, Math.floor(finalXp)),
        currentSpeed: typeData.speed ?? 1.0,
        spawnTimestamp: state.gameTime
    };

    state.scene.add(enemyMesh);
    state.shapes.push(enemyMesh);
}

export function spawnGeometricCache(position) {
    const cacheSize = CONSTANTS.CACHE_RADIUS * 1.5;
    const geometry = new THREE.DodecahedronGeometry(cacheSize, 0);
    const material = new THREE.MeshStandardMaterial({
        color: 0xDAA520,
        emissive: 0x443300,
        emissiveIntensity: 0.3,
        roughness: 0.3,
        metalness: 0.4
    });
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
    const orbMaterial = new THREE.MeshStandardMaterial({
        color: 0xFF8C00,
        emissive: 0xFF8C00,
        emissiveIntensity: 0.5
    });
    const orbMesh = new THREE.Mesh(orbGeometry, orbMaterial);
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = 4 + Math.random() * 2;
    orbMesh.position.set(
        state.player.position.x + Math.cos(angle) * spawnDist,
        CONSTANTS.PROJECTILE_RADIUS * 2.5,
        state.player.position.z + Math.sin(angle) * spawnDist
    );
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
    group.position.set(
        state.player.position.x + Math.cos(angle) * dist,
        pickupSize * 0.5 + 0.2,
        state.player.position.z + Math.sin(angle) * dist
    );
    const pickup = { mesh: group, shieldValue: 35 }; // Increased from 30
    state.repairNodes.push(pickup);
    state.scene.add(group);
}

export function spawnEnergyCore() {
    const geometry = new THREE.OctahedronGeometry(CONSTANTS.ENERGY_CORE_RADIUS, 0);
    const material = new THREE.MeshBasicMaterial({
        color: 0xcc00cc,
        wireframe: true,
        transparent: true,
        opacity: 0.9
    });
    const mesh = new THREE.Mesh(geometry, material);
    const angle = Math.random() * Math.PI * 2;
    const dist = 10 + Math.random() * (CONSTANTS.WORLD_BOUNDARY * 0.85 - 10);
    mesh.position.set(
        state.player.position.x + Math.cos(angle) * dist,
        CONSTANTS.ENERGY_CORE_RADIUS + 0.2,
        state.player.position.z + Math.sin(angle) * dist
    );
    const pickup = { mesh: mesh, xpValue: 50 + state.playerLevel * 15 }; // More generous XP
    state.energyCores.push(pickup);
    state.scene.add(mesh);
}

export function getScreenEdgesInWorldSpace() {
    if (!state.camera) return { valid: false };
    const points = [new THREE.Vector2(-1, 1), new THREE.Vector2(1, 1), new THREE.Vector2(-1, -1), new THREE.Vector2(1, -1)];
    const worldPoints = [];
    for (const p of points) {
        state.raycaster.setFromCamera(p, state.camera);
        const intersectPoint = new THREE.Vector3();
        if (state.raycaster.ray.intersectPlane(state.groundPlane, intersectPoint)) {
            worldPoints.push(intersectPoint);
        }
    }
    if (worldPoints.length < 4) return { valid: false };
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    worldPoints.forEach(p => {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    });
    return { minX, maxX, minZ, maxZ, valid: true };
}

export function spawnSplitterOffspring(position, generation) {
    if (generation >= 3) return;
    const typeData = ENEMY_TYPES.SPHERE_SPLITTER;
    const newRadius = Math.max(0.2, (typeData.size[0] / (generation + 1)));
    // Reduced offspring health
    const health = Math.max(2, (4 + state.playerLevel * 1.2 + state.gameTime * 0.015) * (typeData.healthMultiplier || 1) / (generation * 1.8 + 1));
    const xp = Math.max(1, (3 + state.playerLevel + state.gameTime * 0.005) * typeData.xpMultiplier / (generation * 1.5 + 1));
    const speed = typeData.speed * (1 + generation * 0.15);
    const geometry = new THREE.SphereGeometry(newRadius, 8, 6);
    const material = new THREE.MeshStandardMaterial({
        color: typeData.color,
        transparent: true,
        opacity: 0.65 + generation * 0.1
    });
    const slimeMesh = new THREE.Mesh(geometry, material);
    slimeMesh.position.copy(position);
    slimeMesh.position.y = newRadius;
    slimeMesh.position.x += (Math.random() - 0.5) * 0.6;
    slimeMesh.position.z += (Math.random() - 0.5) * 0.6;
    slimeMesh.userData = {
        type: 'SPHERE_SPLITTER',
        health,
        xpValue: xp,
        speed,
        currentSpeed: speed,
        dropsCache: false,
        generation: generation + 1,
        damageMultiplier: typeData.damageMultiplier * 0.7, // Reduced damage
        spawnTimestamp: state.gameTime
    };
    slimeMesh.radius = newRadius;
    state.scene.add(slimeMesh);
    state.shapes.push(slimeMesh);
}

export function createHitEffect(targetMesh, hitColor = 0xffffff, duration = 0.15) {
    if (!targetMesh || !targetMesh.material) return;
    const mat = Array.isArray(targetMesh.material) ? targetMesh.material[0] : targetMesh.material;
    if (!mat) return;
    let originalColor, isEmissive = false;
    if (mat.emissive && mat.emissive.isColor) {
        isEmissive = true;
        originalColor = mat.originalEmissiveHex ?? mat.emissive.getHex();
        mat.originalEmissiveHex = originalColor;
        mat.emissive.setHex(hitColor);
    } else if (mat.color?.isColor) {
        originalColor = mat.originalColorHex ?? mat.color.getHex();
        mat.originalColorHex = originalColor;
        mat.color.setHex(hitColor);
    } else { return; }
    state.hitEffects.push({ target: targetMesh, originalColor, timer: duration, isEmissive });
}

export function createBurstEffect(position, count = 20, color = 0xffffff, speed = 3, duration = 0.5) {
    const particleSystem = getFromPool('particles', () => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
        const mat = new THREE.PointsMaterial({
            color,
            size: 0.15,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        return new THREE.Points(geo, mat);
    });
    const positions = particleSystem.geometry.attributes.position;
    for (let i = 0; i < count; i++) positions.setXYZ(i, position.x, position.y, position.z);
    positions.needsUpdate = true;
    if (!particleSystem.parent) state.scene.add(particleSystem);
    const velocities = [];
    for (let i = 0; i < count; i++) {
        velocities.push(
            new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
                .normalize()
                .multiplyScalar(speed * (0.5 + Math.random()))
        );
    }
    state.particles.push({ mesh: particleSystem, velocities, life: duration });
}

export function createTemporaryVisualEffect(position, radius, color, duration, wireframe = false, geometry = null) {
    const geo = geometry || new THREE.IcosahedronGeometry(radius, 1);
    const mat = new THREE.MeshBasicMaterial({ color, wireframe, transparent: true });
    const effectMesh = new THREE.Mesh(geo, mat);
    effectMesh.position.copy(position);
    state.scene.add(effectMesh);
    let time = 0;
    function animate() {
        time += 1 / 60;
        if (time >= duration) {
            state.scene.remove(effectMesh);
            geo.dispose();
            mat.dispose();
            return;
        }
        effectMesh.material.opacity = 1.0 - (time / duration);
        requestAnimationFrame(animate);
    }
    animate();
}

export function createDamageNumber(position, amount, isCritical = false) {
    if (!ui.damageNumbersContainer) return;
    const screenPos = worldToScreen(position);
    if (!screenPos) return;
    const el = document.createElement('div');
    el.classList.add('damage-number');
    if (isCritical) {
        el.classList.add('critical');
        el.textContent = `${Math.round(amount)}!!`;
    } else {
        el.textContent = Math.round(amount);
    }
    el.style.left = `${screenPos.x}px`;
    el.style.top = `${screenPos.y}px`;
    ui.damageNumbersContainer.appendChild(el);
    setTimeout(() => el.remove(), 800);
}

function worldToScreen(position) {
    if (!state.camera || !state.renderer) return null;
    const vector = position.clone().project(state.camera);
    const canvas = state.renderer.domElement;
    const widthHalf = canvas.width / 2;
    const heightHalf = canvas.height / 2;
    return {
        x: (vector.x * widthHalf) + widthHalf,
        y: -(vector.y * heightHalf) + heightHalf
    };
}