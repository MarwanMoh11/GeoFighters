import { state, CONSTANTS } from '../state.js';
import { updatePlayer, updateAimTarget } from '../game/player.js';
import { checkCollisions } from '../game/collision.js';
import { handleSpawning, handleXPOrbConsolidation, createTemporaryVisualEffect, createHitEffect, returnToPool, spawnEnemyByType, spawnSplitterOffspring } from '../game/spawner.js';
import { updateUI, gameOver, grantCacheRewards } from '../ui/manager.js';
import { updateCamera } from './renderer.js';
import { ENEMY_TYPES } from '../config/enemies.js';
import { getItemModifier } from '../config/items.js';

// Initialize spatial grid on state if it doesn't exist.
if (!state.spatialGrid) {
    class SpatialGrid {
        constructor(cellSize = 10, worldSize = CONSTANTS.WORLD_BOUNDARY * 2) { this.cellSize = cellSize; this.worldSize = worldSize; this.grid = {}; this.gridSize = Math.ceil(worldSize / cellSize); }
        clear() { this.grid = {}; }
        getCellKey(x, z) { const cellX = Math.floor((x + this.worldSize / 2) / this.cellSize); const cellZ = Math.floor((z + this.worldSize / 2) / this.cellSize); return `${cellX},${cellZ}`; }
        addObject(object, position) { const key = this.getCellKey(position.x, position.z); if (!this.grid[key]) { this.grid[key] = []; } this.grid[key].push(object); }
        getObjectsNear(position, radius = 0) { const cells = new Set(); const r = Math.ceil(radius / this.cellSize); const cX = Math.floor((position.x + this.worldSize / 2) / this.cellSize); const cZ = Math.floor((position.z + this.worldSize / 2) / this.cellSize); for (let x = cX - r; x <= cX + r; x++) { for (let z = cZ - r; z <= cZ + r; z++) { if (x >= 0 && x < this.gridSize && z >= 0 && z < this.gridSize) cells.add(`${x},${z}`); } } const nearby = []; cells.forEach(key => { if (this.grid[key]) nearby.push(...this.grid[key]); }); return nearby; }
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
    if (state.shapes.length > 0 && Math.random() < 0.01) {
    if (state.shapes.length > 0) {
        console.log(`[UPDATE_PLAYING] Calling updateEnemies. state.shapes count: ${state.shapes.length}`);
    }}
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

// This REPLACES your old 'updateShapes' function
function updateEnemies(deltaTime) {
    // --- DEBUG LOG ---
    if (state.shapes.length > 0 && Math.random() < 0.05) { // Log 5% of frames to avoid spam
        console.log(`[UPDATE_ENEMIES] Loop running. Processing ${state.shapes.length} enemies.`);
    }
    // --- NEW: Reverse loop to allow for easy removal ---
    for (let i = state.shapes.length - 1; i >= 0; i--) {
        const enemy = state.shapes[i]; // 'enemy' is now a data object, not a mesh

        // --- NEW: Health check / Death logic ---
        // We check for death first.
        if (enemy.health <= 0) {
            // Spawn XP orbs, handle death effects, etc.
            spawnDataFragment(enemy.position, enemy.xpValue); // Use enemy.position

            // Handle death effects (like splitting)
            if (enemy.type === 'SPHERE_SPLITTER' && enemy.generation < 3) {
                // We need to import spawnSplitterOffspring at the top of this file
                spawnSplitterOffspring(enemy.position, enemy.generation);
                spawnSplitterOffspring(enemy.position, enemy.generation);
            }
            if (enemy.type === 'CONE_CASTER') {
                // Death burst logic (if you want)
            }

            // Return the instance to the pool
            returnEnemyToPool(enemy); // This is the new function from spawner.js

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

        let targetPosition = state.player.position.clone();
        let currentSpeed = enemy.currentSpeed ?? typeData.speed;
        let executeDefaultMovement = true;
        let lookAtPosition = null; // --- NEW: Used to tell the instance where to face

        // --- REFACTORED: All AI logic now mutates the 'enemy' data object ---
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
                    enemy.dashDir = new THREE.Vector3().subVectors(enemy.dashTargetPos, enemy.position).normalize();
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
                        enemy.position.add(enemy.dashDir.clone().multiplyScalar(enemy.currentSpeed * deltaTime));
                    }
                }
                lookAtPosition = state.player.position; // Make it face the player
                break;
            case 'CYLINDER_CORRUPTER':
                const dirToPlayerCorrupt = new THREE.Vector3().subVectors(state.player.position, enemy.position).normalize();
                const perpendicularDir = new THREE.Vector3(-dirToPlayerCorrupt.z, 0, dirToPlayerCorrupt.x);
                enemy.weaveTimer = (enemy.weaveTimer || 0) + deltaTime * 5;
                const weaveOffset = perpendicularDir.multiplyScalar(Math.sin(enemy.weaveTimer));
                targetPosition = state.player.position.clone().add(weaveOffset);
                break;
            case 'SPHERE_SPLITTER':
                // Note: The scale is handled in the matrix update at the end
                if (enemy.generation === 1) {
                    enemy.bounceTimer = (enemy.bounceTimer || 0) + deltaTime * 6;
                    enemy.position.y = enemy.radius + Math.abs(Math.sin(enemy.bounceTimer)) * 0.4;
                }
                break;
            case 'DODECAHEDRON_DRIFTER':
                const playerLookDir = new THREE.Vector3();
                state.player.getWorldDirection(playerLookDir).setY(0).normalize();
                if (playerLookDir.lengthSq() < 0.01) playerLookDir.set(0, 0, -1);

                enemy.shiftTimer = (enemy.shiftTimer || typeData.shiftCooldown) - deltaTime;
                if (enemy.shiftTimer <= 0) {
                    const behindPos = state.player.position.clone().add(playerLookDir.clone().multiplyScalar(-(6 + Math.random() * 4)));
                    createTemporaryVisualEffect(enemy.position, 1.5, typeData.color, 0.2);
                    enemy.position.set(behindPos.x, enemy.position.y, behindPos.z);
                    createTemporaryVisualEffect(enemy.position, 1.5, typeData.color, 0.2);
                    enemy.shiftTimer = typeData.shiftCooldown + Math.random() * 2;
                }
                break;
            case 'CONE_CASTER':
                enemy.shardTimer = (enemy.shardTimer || typeData.shardCooldown) - deltaTime;
                if (enemy.shardTimer <= 0 && enemy.position.distanceTo(state.player.position) < 18) {
                    const shardDirection = new THREE.Vector3().subVectors(state.player.position, enemy.position).normalize();
                    const enemyProjectile = {
                        velocity: shardDirection.clone().multiplyScalar(CONSTANTS.BASE_PROJECTILE_SPEED * 0.6),
                        damage: typeData.deathBurstDamage || 10,
                        isEnemyProjectile: true,
                        radius: CONSTANTS.PROJECTILE_RADIUS * 0.8
                    };
                    const projMesh = new THREE.Mesh(new THREE.ConeGeometry(enemyProjectile.radius, enemyProjectile.radius * 3, 4), new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffcc33, emissiveIntensity: 0.5 }));
                    projMesh.position.copy(enemy.position).add(shardDirection.clone().multiplyScalar(enemy.radius + enemyProjectile.radius));
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
                            // playSoundSynth('shoot_basic', 0.7, { pitch: 150 }); // You'll need to import playSoundSynth if you want sounds
                            if (state.player.position.distanceTo(enemy.position) < bossParams.pulseRadius + CONSTANTS.PLAYER_RADIUS) {
                                state.playerShield -= bossParams.pulseDamage;
                                // createHitEffect for player is different, this is fine
                                // playSoundSynth('player_hit', 0.6);
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
                            state.projectiles.push({ mesh: projMeshBoss, velocity: fireDirBoss.multiplyScalar(CONSTANTS.BASE_PROJECTILE_SPEED * 1.5), damage: bossParams.damageMultiplier || 1, isEnemyProjectile: true, radius: CONSTANTS.PROJECTILE_RADIUS * 1.2 });
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
                                // createHitEffect for player...
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
                            for(let j = 0; j < bossParams.summonCount; j++) {
                                const angle = (j / bossParams.summonCount) * Math.PI * 2;
                                const spawnPos = enemy.position.clone().add(new THREE.Vector3(Math.cos(angle) * 2, 0, Math.sin(angle) * 2));
                                // --- THIS IS THE MISSING CALL ---
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
                const direction = new THREE.Vector3().subVectors(targetPosition, enemy.position).setY(0);
                if (direction.lengthSq() > 0.01) {
                    direction.normalize();
                    enemy.position.add(direction.clone().multiplyScalar(currentSpeed * deltaTime));
                    // --- NEW: Set lookAt for default movement ---
                    lookAtPosition = enemy.position.clone().add(direction);
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

        // --- NEW: (CRITICAL) UPDATE THE INSTANCEDMESH ---
        // After all logic, update the mesh's matrix
        // In core/sceneUpdates.js, inside updateEnemies
        const instancedMesh = state.instancedMeshes[enemy.type];
        if (instancedMesh) {
            state.dummy.position.copy(enemy.position);

            // Re-apply scale if it's a splitter offspring
            if (enemy.generation > 1) {
                const originalRadius = instancedMesh.userData.radius;
                const scale = enemy.radius / originalRadius;
                state.dummy.scale.set(scale, scale, scale);
            } else {
                state.dummy.scale.set(1, 1, 1);
            }

            // Apply rotation if needed
            if (lookAtPosition) {
                state.dummy.lookAt(lookAtPosition.x, enemy.position.y, lookAtPosition.z);
            } else {
                state.dummy.rotation.set(0, 0, 0); // Reset rotation
            }

            state.dummy.updateMatrix();
            instancedMesh.setMatrixAt(enemy.instanceId, state.dummy.matrix);
            instancedMesh.instanceMatrix.needsUpdate = true;

            // --- CORRECTED LOGGING ---
            if (i === 0 && Math.random() < 0.1) {
                console.log(`[UPDATE_MATRIX] ID: ${enemy.instanceId} for ${enemy.type} set to pos [${enemy.position.x.toFixed(1)}, ${enemy.position.z.toFixed(1)}]`);
            }
            // --- END OF CORRECTION ---

        } else {
            // --- THIS IS THE REAL ERROR LOG ---
            console.error(`[UPDATE_FAIL] No instancedMesh found for enemy type: ${enemy.type}!`);
        }
    }
}

function updateProjectiles(deltaTime) {
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        if (!p || !p.mesh) { state.projectiles.splice(i, 1); continue; }
        p.mesh.position.add(p.velocity.clone().multiplyScalar(deltaTime));
        if (p.mesh.position.distanceTo(state.player.position) > CONSTANTS.WORLD_BOUNDARY * 1.5 || (p.duration && (p.duration -= deltaTime) <= 0)) {
            state.scene.remove(p.mesh);
            returnToPool('projectiles', p.mesh, (mesh) => { mesh.visible = false; });
            state.projectiles.splice(i, 1);
        }
    }
}

function updateDataFragments(deltaTime) {
    if (!state.player) return;
    for (let i = state.dataFragments.length - 1; i >= 0; i--) {
        const fragment = state.dataFragments[i];
        if (!fragment?.mesh) { state.dataFragments.splice(i, 1); continue; }
        const distanceToPlayer = fragment.mesh.position.distanceTo(state.player.position);
        if (distanceToPlayer > CONSTANTS.XP_CONSOLIDATION_DISTANCE) {
            state.accumulatedOffScreenXP += fragment.xpValue;
            state.scene.remove(fragment.mesh);
            fragment.mesh.geometry?.dispose();
            fragment.mesh.material?.dispose();
            state.dataFragments.splice(i, 1);
            continue;
        }
        if (distanceToPlayer < state.xpCollectionRadius * 1.8) {
            const direction = new THREE.Vector3().subVectors(state.player.position, fragment.mesh.position).normalize();
            const speedMultiplier = Math.max(1, 3 * (1 - distanceToPlayer / (state.xpCollectionRadius * 1.8)));
            fragment.mesh.position.add(direction.multiplyScalar(CONSTANTS.BASE_DATA_FRAGMENT_SPEED * speedMultiplier * deltaTime));
        }
    }
}

function updateMegaDataFragments(deltaTime) {
    if (!state.player) return;
    for (let i = state.megaDataFragments.length - 1; i >= 0; i--) {
        const fragment = state.megaDataFragments[i];
        if (!fragment?.mesh) { state.megaDataFragments.splice(i, 1); continue; }
        const distanceToPlayer = fragment.mesh.position.distanceTo(state.player.position);
        if (distanceToPlayer < state.xpCollectionRadius * 2.2) {
            const direction = new THREE.Vector3().subVectors(state.player.position, fragment.mesh.position).normalize();
            const speedMultiplier = Math.max(0.7, 3.5 * (1 - distanceToPlayer / (state.xpCollectionRadius * 2.2)));
            fragment.mesh.position.add(direction.multiplyScalar(CONSTANTS.BASE_DATA_FRAGMENT_SPEED * 0.8 * speedMultiplier * deltaTime));
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
                    else if(mat.color) mat.color.setHex(effect.originalColor);
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

function updatePickups(deltaTime) {
    for (let i = state.geometricCaches.length - 1; i >= 0; i--) {
        const cache = state.geometricCaches[i];
        if (!cache?.mesh) { state.geometricCaches.splice(i, 1); continue; }
        if (cache.mesh.userData.isOpeningCache) {
            cache.mesh.userData.openAnimationTimer += deltaTime;
            const progress = cache.mesh.userData.openAnimationTimer / cache.mesh.userData.openAnimationDuration;
            if (progress >= 1) {
                grantCacheRewards();
                state.scene.remove(cache.mesh);
                cache.mesh.geometry?.dispose();
                cache.mesh.material?.dispose();
                state.geometricCaches.splice(i, 1);
            }
        }
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