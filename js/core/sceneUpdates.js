import { state, CONSTANTS } from '../state.js';
import { updatePlayer, updateAimTarget } from '../game/player.js';
import { checkCollisions } from '../game/collision.js';
import { handleSpawning, handleXPOrbConsolidation, createTemporaryVisualEffect, createHitEffect, returnToPool, spawnEnemyByType, spawnSplitterOffspring } from '../game/spawner.js';
import { updateUI, gameOver, grantCacheRewards } from '../ui/manager.js';
import { updateCamera } from './renderer.js';
import { ENEMY_TYPES } from '../config/enemies.js';
import { getItemModifier } from '../config/items.js';
import { spawnDataFragment, returnEnemyToPool } from '../game/spawner.js';
import * as THREE from 'three';
// Initialize spatial grid on state if it doesn't exist.
if (!state.spatialGrid) {
    class SpatialGrid {
        constructor(cellSize = 10, worldSize = CONSTANTS.WORLD_BOUNDARY * 2) {
            this.cellSize = cellSize;
            this.worldSize = worldSize;
            this.grid = new Map();
            this.gridSize = Math.ceil(worldSize / cellSize);
        }
        clear() { this.grid.clear(); }
        getCellKeyNumeric(x, z) {
            if (isNaN(x) || isNaN(z)) return -1;
            const cellX = Math.floor((x + this.worldSize / 2) / this.cellSize);
            const cellZ = Math.floor((z + this.worldSize / 2) / this.cellSize);
            if (cellX < 0 || cellX >= this.gridSize || cellZ < 0 || cellZ >= this.gridSize) return -1;
            return cellX + cellZ * this.gridSize;
        }
        addObject(object, position) {
            const key = this.getCellKeyNumeric(position.x, position.z);
            if (key === -1) return;
            let cell = this.grid.get(key);
            if (!cell) { cell = []; this.grid.set(key, cell); }
            cell.push(object);
        }
        getObjectsNear(position, radius = 0) {
            const r = Math.ceil(radius / this.cellSize);
            const cX = Math.floor((position.x + this.worldSize / 2) / this.cellSize);
            const cZ = Math.floor((position.z + this.worldSize / 2) / this.cellSize);
            const nearby = [];
            if (isNaN(cX) || isNaN(cZ)) return nearby;
            for (let x = cX - r; x <= cX + r; x++) {
                for (let z = cZ - r; z <= cZ + r; z++) {
                    if (x >= 0 && x < this.gridSize && z >= 0 && z < this.gridSize) {
                        const key = x + z * this.gridSize;
                        const cell = this.grid.get(key);
                        if (cell) nearby.push(...cell);
                    }
                }
            }
            return nearby;
        }
    }
    state.spatialGrid = new SpatialGrid(10, CONSTANTS.WORLD_BOUNDARY * 2);
}

export function updatePlaying(deltaTime) {
    if (!state.player || state.isPaused) return;

    state.spatialGrid.clear();
    state.shapes.forEach((enemy, i) => state.spatialGrid.addObject({ enemy: enemy, index: i }, enemy.position));
    state.projectiles.forEach((p, i) => p?.mesh && state.spatialGrid.addObject({ projectile: p, index: i }, p.mesh.position));
    state.dataFragments.forEach((f, i) => f?.mesh && state.spatialGrid.addObject({ dataFragment: f, index: i }, f.mesh.position));
    state.megaDataFragments.forEach((f, i) => f?.mesh && state.spatialGrid.addObject({ megaDataFragment: f, index: i }, f.mesh.position));
    state.repairNodes.forEach((n, i) => n?.mesh && state.spatialGrid.addObject({ repairNode: n, index: i }, n.mesh.position));
    state.energyCores.forEach((c, i) => c?.mesh && state.spatialGrid.addObject({ energyCore: c, index: i }, c.mesh.position));
    state.geometricCaches.forEach((c, i) => c?.mesh && !c.mesh.userData.isOpeningCache && state.spatialGrid.addObject({ geometricCache: c, index: i }, c.mesh.position));

    const shieldRegenMod = getItemModifier('SHIELD_REGEN');
    if (shieldRegenMod.flat > 0) {
        state.shieldRegenTimer += deltaTime;
        if (state.shieldRegenTimer >= 1.0) { state.playerShield = Math.min(state.MAX_PLAYER_SHIELD, state.playerShield + shieldRegenMod.flat); state.shieldRegenTimer -= 1.0; }
    }
    if (state.corruptionEffectTimer > 0) {
        state.corruptionEffectTimer -= deltaTime;
        state.playerCorruptionTimer += deltaTime;
        if (state.playerCorruptionTimer >= CONSTANTS.CORRUPTION_INTERVAL) { state.playerCorruptionTimer = 0; state.playerShield -= CONSTANTS.CORRUPTION_DAMAGE; createHitEffect(state.player, 0x00ff00, 0.1); if (state.playerShield <= 0) { gameOver(); return; } }
    } else { state.playerCorruptionTimer = 0; }

    updatePlayer(deltaTime);
    updateCamera();
    updateAimTarget();
    updateEnemies(deltaTime);
    updateProjectiles(deltaTime);
    updateWeapons(deltaTime);
    updateDataFragments(deltaTime);
    updateMegaDataFragments(deltaTime);
    updateHitEffects(deltaTime);
    updatePickups(deltaTime);
    updateParticles(deltaTime);
    handleSpawning(deltaTime);
    handleXPOrbConsolidation(deltaTime);
    checkCollisions();
    updateUI();
}

function updateFrustum() {
    if (!state.camera) return;
    state.camera.updateMatrixWorld();
    state.projScreenMatrix.multiplyMatrices(state.camera.projectionMatrix, state.camera.matrixWorldInverse);
    state.frustum.setFromProjectionMatrix(state.projScreenMatrix);
}

function isVisible(object) {
    if (!object?.position) return false;
    return state.frustum.containsPoint(object.position);
}

export function applyFrustumCulling() {
    updateFrustum();
    if (!state.camera || !state.player) return;

    // --- REMOVED --- The state.shapes.forEach loop is gone.
    // InstancedMesh handles its own culling.

    // --- These are fine, as they are still individual meshes ---
    state.projectiles.forEach(p => { if (p?.mesh?.parent) p.mesh.visible = isVisible(p.mesh); });
    state.particles.forEach(p => { if (p?.mesh?.parent) p.mesh.visible = isVisible(p.mesh); });
    state.dataFragments.forEach(f => { if (f?.mesh?.parent) f.mesh.visible = isVisible(f.mesh); });
    state.megaDataFragments.forEach(f => { if (f?.mesh?.parent) f.mesh.visible = isVisible(f.mesh); });
}

// --- PRE-ALLOCATED VECTORS FOR REDUCED GC PRESSURE ---
const _tempVec0 = new THREE.Vector3();
const _tempVec1 = new THREE.Vector3();
const _tempVec2 = new THREE.Vector3();
const _targetPos = new THREE.Vector3();

// This REPLACES your old 'updateShapes' function
function updateEnemies(deltaTime) {
    // Track which instance types need matrix updates (batched)
    const typesNeedingMatrixUpdate = new Set();

    // --- Reverse loop to allow for easy removal ---
    for (let i = state.shapes.length - 1; i >= 0; i--) {
        const enemy = state.shapes[i];

        if (enemy.health <= 0) {
            // Get enemy color for death effect
            const typeData = ENEMY_TYPES[enemy.type];
            const enemyColor = typeData?.color || 0xff0000;

            // Spawn death explosion particles
            spawnDeathExplosion(enemy.position, enemyColor, enemy.radius || 1);

            // Increment kill count
            state.killCount = (state.killCount || 0) + 1;

            // Spawn XP orbs, handle death effects, etc.
            spawnDataFragment(enemy.position, enemy.xpValue); // Use enemy.position

            // Handle death effects (like splitting)
            if (enemy.type === 'SPHERE_SPLITTER' && enemy.generation < 3) {
                spawnSplitterOffspring(enemy.position, enemy.generation);
                spawnSplitterOffspring(enemy.position, enemy.generation);
            }
            if (enemy.type === 'CONE_CASTER') {
                // Death burst logic (if you want)
            }

            // Return the instance to the pool
            returnEnemyToPool(enemy);

            // Remove the data object from the active list
            state.shapes.splice(i, 1);
            continue; // Go to the next enemy
        }

        // --- REFACTORED: Get type data ---
        // All 'userData' is now at the top level of the 'enemy' object
        const typeData = ENEMY_TYPES[enemy.type];
        if (!typeData) {
            returnEnemyToPool(enemy); // Clean up bad data
            state.shapes.splice(i, 1);
            continue;
        }

        _targetPos.copy(state.player.position);
        let currentSpeed = enemy.currentSpeed ?? typeData.speed;
        let executeDefaultMovement = true;
        let lookAtPosition = null;

        // AI logic
        switch (enemy.type) {
            case 'ICOSAHEDRON_INVADER':
                enemy.distortTimer = (enemy.distortTimer || typeData.distortCooldown) - deltaTime;
                if (enemy.distortTimer <= 0) {
                    createTemporaryVisualEffect(enemy.position, 3, typeData.color || 0x4B5320, 0.5, true);
                    enemy.distortTimer = typeData.distortCooldown + Math.random() * 5;
                }
                break;
            case 'PRISM_DASHER':
                executeDefaultMovement = false;
                enemy.dashTimer = (enemy.dashTimer || typeData.dashCooldown) - deltaTime;
                if (!enemy.isDashing && enemy.dashTimer <= 0) {
                    enemy.isDashing = true;
                    enemy.dashTargetPos = state.player.position.clone();
                    enemy.dashDir = new THREE.Vector3().subVectors(enemy.dashTargetPos, enemy.position);
                    if (enemy.dashDir.lengthSq() > 0.0001) enemy.dashDir.normalize();
                    else enemy.dashDir.set(0, 0, 1);
                    enemy.dashTimeLeft = typeData.dashDuration;
                    enemy.currentSpeed = typeData.dashSpeed;
                }
                if (enemy.isDashing) {
                    enemy.dashTimeLeft -= deltaTime;
                    if (enemy.dashTimeLeft <= 0) {
                        enemy.isDashing = false;
                        enemy.dashTimer = typeData.dashCooldown + Math.random();
                        enemy.currentSpeed = typeData.speed;
                    } else {
                        enemy.position.add(_tempVec0.copy(enemy.dashDir).multiplyScalar(enemy.currentSpeed * deltaTime));
                    }
                }
                lookAtPosition = state.player.position;
                break;
            case 'CYLINDER_CORRUPTER':
                _tempVec0.subVectors(state.player.position, enemy.position);
                if (_tempVec0.lengthSq() > 0.0001) {
                    _tempVec0.normalize();
                    _tempVec1.set(-_tempVec0.z, 0, _tempVec0.x);
                    enemy.weaveTimer = (enemy.weaveTimer || 0) + deltaTime * 5;
                    _tempVec1.multiplyScalar(Math.sin(enemy.weaveTimer));
                    _targetPos.add(_tempVec1);
                }
                break;
            case 'SPHERE_SPLITTER':
                if (enemy.generation === 1) {
                    enemy.bounceTimer = (enemy.bounceTimer || 0) + deltaTime * 6;
                    enemy.position.y = enemy.radius + Math.abs(Math.sin(enemy.bounceTimer)) * 0.4;
                }
                break;
            case 'DODECAHEDRON_DRIFTER':
                const playerLookDir = _tempVec0;
                state.player.getWorldDirection(playerLookDir).setY(0);
                if (playerLookDir.lengthSq() < 0.01) playerLookDir.set(0, 0, -1);
                else playerLookDir.normalize();

                enemy.shiftTimer = (enemy.shiftTimer || typeData.shiftCooldown) - deltaTime;
                if (enemy.shiftTimer <= 0) {
                    _tempVec1.copy(playerLookDir).multiplyScalar(-(6 + Math.random() * 4));
                    createTemporaryVisualEffect(enemy.position, 1.5, typeData.color, 0.2);
                    enemy.position.copy(state.player.position).add(_tempVec1);
                    createTemporaryVisualEffect(enemy.position, 1.5, typeData.color, 0.2);
                    enemy.shiftTimer = typeData.shiftCooldown + Math.random() * 2;
                }
                break;
            case 'CONE_CASTER':
                enemy.shardTimer = (enemy.shardTimer || typeData.shardCooldown) - deltaTime;
                if (enemy.shardTimer <= 0 && enemy.position.distanceToSquared(state.player.position) < 324) { // 18^2
                    const shardDirection = _tempVec0.subVectors(state.player.position, enemy.position).normalize();
                    const enemyProjectile = {
                        velocity: shardDirection.clone().multiplyScalar(CONSTANTS.BASE_PROJECTILE_SPEED * 0.6),
                        damage: typeData.deathBurstDamage || 10,
                        isEnemyProjectile: true,
                        radius: CONSTANTS.PROJECTILE_RADIUS * 0.8
                    };
                    const projMesh = new THREE.Mesh(new THREE.ConeGeometry(enemyProjectile.radius, enemyProjectile.radius * 3, 4), new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffcc33, emissiveIntensity: 0.5 }));
                    projMesh.position.copy(enemy.position).add(_tempVec1.copy(shardDirection).multiplyScalar(enemy.radius + enemyProjectile.radius));
                    enemyProjectile.mesh = projMesh;
                    state.projectiles.push(enemyProjectile);
                    state.scene.add(projMesh);
                    enemy.shardTimer = typeData.shardCooldown + Math.random() * 2;
                }
                break;
            // ... inside updateEnemies, inside the switch (enemy.type) ...

            case 'BOSS_OCTA_PRIME':
                executeDefaultMovement = false;
                const bossParams = typeData; // 'enemy' is the bossData
                if (enemy.attackState === 'MOVING') { enemy.attackCooldownTimer -= deltaTime; }

                switch (enemy.attackState) {
                    case 'MOVING':
                        const dirToPlayerBoss = new THREE.Vector3().subVectors(targetPosition, enemy.position).setY(0);
                        if (dirToPlayerBoss.lengthSq() > 0.1) enemy.position.add(dirToPlayerBoss.normalize().multiplyScalar(bossParams.speed * deltaTime));
                        lookAtPosition = state.player.position; // Face the player

                        if (enemy.attackCooldownTimer <= 0) {
                            enemy.currentAttackPattern = bossParams.attackPatterns[Math.floor(Math.random() * bossParams.attackPatterns.length)];
                            switch (enemy.currentAttackPattern) {
                                case 'PULSE': enemy.attackState = 'CHARGING_PULSE'; enemy.attackStateTimer = bossParams.pulseChargeTime; break;
                                case 'RAPID_FIRE': enemy.attackState = 'CHARGING_RAPID'; enemy.attackStateTimer = 0.5; enemy.rapidFireTargetPos = state.player.position.clone(); break;
                                case 'DASH_SLAM': enemy.attackState = 'CHARGING_DASH'; enemy.attackStateTimer = bossParams.dashChargeTime; break;
                                case 'SUMMON': enemy.attackState = 'CHARGING_SUMMON'; enemy.attackStateTimer = bossParams.summonChargeTime; break;
                            }
                        }
                        break;
                    case 'CHARGING_PULSE':
                        enemy.attackStateTimer -= deltaTime;
                        if (enemy.attackStateTimer <= 0) {
                            enemy.attackState = 'PULSING';
                            createTemporaryVisualEffect(enemy.position, bossParams.pulseRadius, bossParams.pulseColor, 0.4, true);
                            if (state.player.position.distanceTo(enemy.position) < bossParams.pulseRadius + CONSTANTS.PLAYER_RADIUS) {
                                state.playerShield -= bossParams.pulseDamage;
                                if (state.playerShield <= 0) { gameOver(); return; }
                            }
                        }
                        break;
                    case 'PULSING':
                        enemy.attackState = 'MOVING';
                        enemy.attackCooldownTimer = bossParams.attackCooldown;
                        break;
                    case 'CHARGING_RAPID':
                        enemy.attackStateTimer -= deltaTime;
                        if (enemy.rapidFireTargetPos) { lookAtPosition = enemy.rapidFireTargetPos; }
                        if (enemy.attackStateTimer <= 0) { enemy.attackState = 'FIRING_RAPID'; enemy.rapidFireBursts = 5; enemy.rapidFireBurstTimer = 0.12; }
                        break;
                    case 'FIRING_RAPID':
                        enemy.rapidFireBurstTimer -= deltaTime;
                        if (enemy.rapidFireBurstTimer <= 0 && enemy.rapidFireBursts > 0) {
                            enemy.rapidFireBursts--;
                            enemy.rapidFireBurstTimer = 0.12;
                            const fireDirBoss = new THREE.Vector3().subVectors(enemy.rapidFireTargetPos || state.player.position, enemy.position).normalize();
                            const projMeshBoss = new THREE.Mesh(new THREE.SphereGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.2, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
                            projMeshBoss.position.copy(enemy.position).add(fireDirBoss.clone().multiplyScalar(enemy.radius + 0.2));
                            state.projectiles.push({ mesh: projMeshBoss, velocity: fireDirBoss.multiplyScalar(CONSTANTS.BASE_PROJECTILE_SPEED * 1.5), damage: bossParams.damageMultiplier || 1, isEnemyProjectile: true, radius: CONSTANTS.PROJECTILE_RADIUS * 1.2, is2D: false });
                            state.scene.add(projMeshBoss);
                        }
                        if (enemy.rapidFireBursts <= 0) {
                            enemy.attackState = 'MOVING';
                            enemy.attackCooldownTimer = bossParams.attackCooldown;
                        }
                        break;
                    case 'CHARGING_DASH':
                        enemy.attackStateTimer -= deltaTime;
                        lookAtPosition = state.player.position;
                        if (enemy.attackStateTimer <= 0) {
                            enemy.attackState = 'DASHING';
                            enemy.attackStateTimer = bossParams.dashDuration;
                            enemy.dashDir = new THREE.Vector3().subVectors(state.player.position, enemy.position).normalize();
                        }
                        break;
                    case 'DASHING':
                        enemy.attackStateTimer -= deltaTime;
                        enemy.position.add(enemy.dashDir.clone().multiplyScalar(bossParams.speed * bossParams.dashSpeedMultiplier * deltaTime));
                        if (enemy.attackStateTimer <= 0) {
                            enemy.attackState = 'SLAMMING';
                            createTemporaryVisualEffect(enemy.position, bossParams.slamRadius, 0x00FFFF, 0.5, true);
                            if (state.player.position.distanceTo(enemy.position) < bossParams.slamRadius + CONSTANTS.PLAYER_RADIUS) {
                                state.playerShield -= bossParams.slamDamage;
                                if (state.playerShield <= 0) { gameOver(); return; }
                            }
                        }
                        break;
                    case 'SLAMMING':
                        enemy.attackState = 'MOVING';
                        enemy.attackCooldownTimer = bossParams.attackCooldown;
                        break;
                    case 'CHARGING_SUMMON':
                        enemy.attackStateTimer -= deltaTime;
                        if (enemy.attackStateTimer <= 0) {
                            enemy.attackState = 'SUMMONING';
                            for (let j = 0; j < bossParams.summonCount; j++) {
                                const angle = (j / bossParams.summonCount) * Math.PI * 2;
                                const spawnPos = enemy.position.clone().add(new THREE.Vector3(Math.cos(angle) * 2, 0, Math.sin(angle) * 2));
                                spawnEnemyByType(bossParams.summonType, spawnPos);
                            }
                        }
                        break;
                    case 'SUMMONING':
                        enemy.attackState = 'MOVING';
                        enemy.attackCooldownTimer = bossParams.attackCooldown;
                        break;
                }
                break;
        }

        // --- REFACTORED: Default Movement ---
        if (executeDefaultMovement) {
            if (currentSpeed > 0) {
                const direction = _tempVec0.subVectors(_targetPos, enemy.position).setY(0);
                if (direction.lengthSq() > 0.01) {
                    direction.normalize();
                    enemy.position.add(direction.multiplyScalar(currentSpeed * deltaTime));
                    lookAtPosition = _tempVec1.copy(enemy.position).add(direction);
                }
            }
        }

        // --- NEW: Despawn Logic ---
        const DESPAWN_THRESHOLD = 85;
        if (!typeData.isBoss && state.player.position.distanceTo(enemy.position) > DESPAWN_THRESHOLD) {
            returnEnemyToPool(enemy);
            state.shapes.splice(i, 1);
            continue;
        }

        // --- REFACTORED: Boundary Clamping ---
        enemy.position.x = Math.max(-CONSTANTS.WORLD_BOUNDARY + enemy.radius, Math.min(CONSTANTS.WORLD_BOUNDARY - enemy.radius, enemy.position.x));
        enemy.position.z = Math.max(-CONSTANTS.WORLD_BOUNDARY + enemy.radius, Math.min(CONSTANTS.WORLD_BOUNDARY - enemy.radius, enemy.position.z));

        // --- OPTIMIZED: UPDATE THE INSTANCEDMESH (batched) ---
        const instancedMesh = state.instancedMeshes[enemy.type];
        if (instancedMesh) {
            state.dummy.position.copy(enemy.position);

            // Re-apply scale if it's a splitter offspring
            let baseScale = 1;
            if (enemy.generation > 1) {
                const originalRadius = instancedMesh.userData.radius;
                baseScale = enemy.radius / originalRadius;
            }

            // === 2D SPRITE BILLBOARDING & ANIMATIONS ===
            // 1. Core Billboarding: Face the camera
            state.dummy.quaternion.copy(state.camera.quaternion);

            // 2. Horizontal Flipping: Face the direction of movement (towards player)
            let flipScale = 1;
            if (state.player.position.x < enemy.position.x - 0.1) {
                flipScale = -1;
            }

            // 3. Perfect Grounding (No Bobbing)
            state.dummy.position.y = 0.01;

            state.dummy.scale.set(baseScale * flipScale, baseScale, baseScale);

            state.dummy.updateMatrix();
            instancedMesh.setMatrixAt(enemy.instanceId, state.dummy.matrix);
            // Mark type as needing update (batched - set once after loop)
            typesNeedingMatrixUpdate.add(enemy.type);
        } else {
            console.error(`[UPDATE_FAIL] No instancedMesh found for enemy type: ${enemy.type}!`);
        }
    }

    // --- BATCHED MATRIX UPDATES (OPTIMIZATION) ---
    // Set needsUpdate once per type instead of once per enemy
    for (const typeId of typesNeedingMatrixUpdate) {
        const mesh = state.instancedMeshes[typeId];
        if (mesh) {
            mesh.instanceMatrix.needsUpdate = true;
        }
    }
}

function updateProjectiles(deltaTime) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        if (!p || !p.mesh) { state.projectiles.splice(i, 1); continue; }

        _tempVec0.copy(p.velocity).multiplyScalar(deltaTime);
        p.mesh.position.add(_tempVec0);

        // Dynamic Sprite Rotation (if enabled or 2D)
        if (p.is2D && p.mesh instanceof THREE.Sprite) {
            // Correctly calculate rotation: -atan2(z, x) maps world direction to sprite rotation
            // assuming the base sprite in the sheet points Right (0 degrees).
            p.mesh.material.rotation = -Math.atan2(p.velocity.z, p.velocity.x);
        }

        if (p.mesh.position.distanceToSquared(state.player.position) > (CONSTANTS.WORLD_BOUNDARY * 1.5) ** 2 || (p.duration && (p.duration -= deltaTime) <= 0)) {
            state.scene.remove(p.mesh);
            // Return to appropriate pool or dispose
            if (p.is2D) {
                // For now, just remove. Sprites are lightweight but poolable in future.
                if (p.mesh.geometry) p.mesh.geometry.dispose();
                if (p.mesh.material) p.mesh.material.dispose();
            } else {
                returnToPool('projectiles', p.mesh, (mesh) => { mesh.visible = false; });
            }
            state.projectiles.splice(i, 1);
        }
    }
}

function updateDataFragments(deltaTime) {
    if (!state.player) return;
    for (let i = state.dataFragments.length - 1; i >= 0; i--) {
        const fragment = state.dataFragments[i];
        if (!fragment?.mesh) { state.dataFragments.splice(i, 1); continue; }
        const distanceToPlayerSq = fragment.mesh.position.distanceToSquared(state.player.position);

        if (distanceToPlayerSq > CONSTANTS.XP_CONSOLIDATION_DISTANCE ** 2) {
            state.accumulatedOffScreenXP += fragment.xpValue;
            state.scene.remove(fragment.mesh);
            fragment.mesh.geometry?.dispose();
            fragment.mesh.material?.dispose();
            state.dataFragments.splice(i, 1);
            continue;
        }

        const collectionRangeSq = (state.xpCollectionRadius * 1.8) ** 2;
        if (distanceToPlayerSq < collectionRangeSq) {
            _tempVec0.subVectors(state.player.position, fragment.mesh.position);
            const dist = Math.sqrt(distanceToPlayerSq);
            if (dist > 0.0001) {
                _tempVec0.multiplyScalar(1 / dist); // normalize optimized
                const speedMultiplier = Math.max(1, 3 * (1 - dist / (state.xpCollectionRadius * 1.8)));
                fragment.mesh.position.add(_tempVec0.multiplyScalar(CONSTANTS.BASE_DATA_FRAGMENT_SPEED * speedMultiplier * deltaTime));
            }
        }
    }
}

function updateMegaDataFragments(deltaTime) {
    if (!state.player) return;
    for (let i = state.megaDataFragments.length - 1; i >= 0; i--) {
        const fragment = state.megaDataFragments[i];
        if (!fragment?.mesh) { state.megaDataFragments.splice(i, 1); continue; }
        const distSq = fragment.mesh.position.distanceToSquared(state.player.position);
        const collectionRangeSq = (state.xpCollectionRadius * 2.2) ** 2;

        if (distSq < collectionRangeSq) {
            _tempVec0.subVectors(state.player.position, fragment.mesh.position);
            const dist = Math.sqrt(distSq);
            if (dist > 0.0001) {
                _tempVec0.multiplyScalar(1 / dist); // normalize
                const speedMultiplier = Math.max(0.7, 3.5 * (1 - dist / (state.xpCollectionRadius * 2.2)));
                fragment.mesh.position.add(_tempVec0.multiplyScalar(CONSTANTS.BASE_DATA_FRAGMENT_SPEED * 0.8 * speedMultiplier * deltaTime));
            }
        }
    }
}

function updateHitEffects(deltaTime) {
    for (let i = state.hitEffects.length - 1; i >= 0; i--) {
        const effect = state.hitEffects[i];
        effect.timer -= deltaTime;
        if (effect.timer <= 0) {
            if (effect.target?.material) {
                const mat = Array.isArray(effect.target.material) ? effect.target.material[0] : effect.target.material;
                if (mat) {
                    if (effect.isEmissive && mat.emissive) mat.emissive.setHex(effect.originalColor);
                    else if (mat.color) mat.color.setHex(effect.originalColor);
                }
            }
            state.hitEffects.splice(i, 1);
        }
    }
}

function updateWeapons(deltaTime) {
    if (!state.player) return;
    state.playerWeapons.forEach(weapon => {
        if (weapon.level > 0) {
            weapon.fire?.(deltaTime);
            weapon.updateWeaponSystem?.(weapon, deltaTime);
        }
    });
}

// --- REUSABLE PARTICLE RESOURCES ---
const _sharedTetraGeom = new THREE.TetrahedronGeometry(0.12, 0);
const _sharedSphereGeom = new THREE.SphereGeometry(0.08, 4, 4);
const _particleMaterialsByColor = new Map();

function getParticleMaterial(color) {
    let mat = _particleMaterialsByColor.get(color);
    if (!mat) {
        mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 1 });
        _particleMaterialsByColor.set(color, mat);
    }
    return mat;
}

function updatePickups(deltaTime) {
    for (let i = state.geometricCaches.length - 1; i >= 0; i--) {
        const cache = state.geometricCaches[i];
        if (!cache?.mesh) { state.geometricCaches.splice(i, 1); continue; }

        const chestGroup = cache.mesh;

        if (chestGroup.userData.isOpeningCache) {
            // === OPENING ANIMATION ===
            chestGroup.userData.openAnimationTimer += deltaTime;
            const progress = chestGroup.userData.openAnimationTimer / chestGroup.userData.openAnimationDuration;

            // Lid rotation (swing open like a treasure chest)
            const lidPivot = chestGroup.userData.lidPivot;
            if (lidPivot) {
                const targetRotation = -Math.PI * 0.7; // 126 degrees open
                const easeProgress = 1 - Math.pow(1 - Math.min(progress * 1.5, 1), 3); // Ease out
                lidPivot.rotation.x = targetRotation * easeProgress;
            }

            // Glow expansion and fade
            const glowRing = chestGroup.userData.glowRing;
            if (glowRing) {
                const expandScale = 1 + progress * 2;
                glowRing.scale.set(expandScale, expandScale, 1);
                glowRing.material.opacity = 0.5 * (1 - progress);
            }

            // Scale bounce at start
            if (progress < 0.3) {
                const bounceScale = 1 + Math.sin(progress * Math.PI * 3) * 0.1;
                chestGroup.scale.set(bounceScale, bounceScale, bounceScale);
            }

            // Spawn particles during opening
            if (progress > 0.2 && progress < 0.6 && Math.random() < 0.3) {
                spawnChestParticle(chestGroup.position);
            }

            // Rise and float up slightly
            chestGroup.position.y = cache.baseY + progress * 0.5;

            if (progress >= 1) {
                // Final burst of particles (more for higher rarity)
                const rarity = cache.rarity || { rewards: 1, name: 'Common' };
                for (let p = 0; p < 10 + rarity.rewards * 5; p++) {
                    spawnChestParticle(chestGroup.position);
                }

                grantCacheRewards(rarity.rewards, rarity.name);

                // Cleanup all child geometries/materials
                chestGroup.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(m => m.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
                state.scene.remove(chestGroup);
                state.geometricCaches.splice(i, 1);
            }
        } else {
            // === IDLE ANIMATION ===
            // Bobbing
            cache.bobTimer += deltaTime * 2;
            chestGroup.position.y = cache.baseY + Math.sin(cache.bobTimer) * 0.1;

            // Slow rotation
            chestGroup.rotation.y += deltaTime * 0.5;

            // Pulsing glow
            cache.pulseTimer = (cache.pulseTimer || 0) + deltaTime * 3;
            const glowRing = chestGroup.userData.glowRing;
            if (glowRing && glowRing.material) {
                glowRing.material.opacity = 0.2 + Math.sin(cache.pulseTimer) * 0.15;
            }

            // Emissive pulse on lid
            const lidMesh = chestGroup.userData.lidMesh;
            if (lidMesh && lidMesh.material) {
                lidMesh.material.emissiveIntensity = 0.3 + Math.sin(cache.pulseTimer * 0.7) * 0.2;
            }
        }
    }
}

// Helper function to spawn golden particles from chest
function spawnChestParticle(position) {
    const particle = new THREE.Mesh(_sharedSphereGeom, getParticleMaterial(0xFFD700));

    particle.position.set(
        position.x + (Math.random() - 0.5) * 0.5,
        position.y + Math.random() * 0.5,
        position.z + (Math.random() - 0.5) * 0.5
    );

    const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        2 + Math.random() * 3,
        (Math.random() - 0.5) * 3
    );

    particle.userData.velocity = velocity;
    particle.userData.life = 0.8 + Math.random() * 0.4;
    particle.userData.maxLife = particle.userData.life;
    particle.userData.update = (mesh, dt) => {
        mesh.userData.life -= dt;
        if (mesh.userData.life <= 0) {
            state.scene.remove(mesh);
            const idx = state.effectsToUpdate.indexOf(mesh);
            if (idx > -1) state.effectsToUpdate.splice(idx, 1);
            return;
        }
        _tempVec0.copy(mesh.userData.velocity).multiplyScalar(dt);
        mesh.position.add(_tempVec0);
        mesh.material.opacity = mesh.userData.life / mesh.userData.maxLife;
    };

    state.scene.add(particle);
    state.effectsToUpdate.push(particle);
}

// Enemy death explosion with color-coded particles
export function spawnDeathExplosion(position, color, size = 1) {
    const particleCount = Math.min(10, Math.floor(5 + size * 2));
    const material = getParticleMaterial(color);

    for (let i = 0; i < particleCount; i++) {
        const particle = new THREE.Mesh(_sharedTetraGeom, material);

        particle.position.set(
            position.x + (Math.random() - 0.5) * size * 0.4,
            position.y + (Math.random() - 0.5) * size * 0.4,
            position.z + (Math.random() - 0.5) * size * 0.4
        );

        particle.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);

        const angle = Math.random() * Math.PI * 2;
        const upAngle = (Math.random() - 0.3) * Math.PI;
        const speed = 3 + Math.random() * 3;

        const velocity = new THREE.Vector3(
            Math.cos(angle) * Math.cos(upAngle) * speed,
            Math.sin(upAngle) * speed + 1.5,
            Math.sin(angle) * Math.cos(upAngle) * speed
        );

        const rotationSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8
        );

        particle.userData.velocity = velocity;
        particle.userData.rotationSpeed = rotationSpeed;
        particle.userData.life = 0.4 + Math.random() * 0.3;
        particle.userData.maxLife = particle.userData.life;

        particle.userData.update = (mesh, dt) => {
            mesh.userData.life -= dt;
            if (mesh.userData.life <= 0) {
                state.scene.remove(mesh);
                const idx = state.effectsToUpdate.indexOf(mesh);
                if (idx > -1) state.effectsToUpdate.splice(idx, 1);
                return;
            }

            // Physics (Optimized)
            mesh.userData.velocity.y -= 12 * dt;
            _tempVec0.copy(mesh.userData.velocity).multiplyScalar(dt);
            mesh.position.add(_tempVec0);

            // Rotation
            mesh.rotation.x += mesh.userData.rotationSpeed.x * dt;
            mesh.rotation.y += mesh.userData.rotationSpeed.y * dt;
            mesh.rotation.z += mesh.userData.rotationSpeed.z * dt;

            // Fade and shrink
            const lifeRatio = mesh.userData.life / mesh.userData.maxLife;
            mesh.scale.setScalar(0.4 + lifeRatio * 0.6);
        };

        state.scene.add(particle);
        state.effectsToUpdate.push(particle);
    }
}

function updateParticles(deltaTime) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.life -= deltaTime;
        if (p.life <= 0) {
            state.scene.remove(p.mesh);
            returnToPool('particles', p.mesh, (mesh) => { mesh.visible = false; });
            state.particles.splice(i, 1);
            continue;
        }
        const positions = p.mesh.geometry.attributes.position;
        for (let j = 0; j < positions.count; j++) {
            positions.setXYZ(j, positions.getX(j) + p.velocities[j].x * deltaTime, positions.getY(j) + p.velocities[j].y * deltaTime, positions.getZ(j) + p.velocities[j].z * deltaTime);
        }
        positions.needsUpdate = true;
        p.mesh.material.opacity = Math.max(0, p.life / 0.5);
    }
}