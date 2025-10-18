import { state, GameState, CONSTANTS } from '../state.js';
import { updatePlayer, updateAimTarget } from '../game/player.js';
import { checkCollisions } from '../game/collision.js';
import { handleSpawning, handleXPOrbConsolidation, createTemporaryVisualEffect, createBurstEffect, createHitEffect, returnToPool, getFromPool, spawnEnemyByType, getScreenEdgesInWorldSpace } from '../game/spawner.js';
import { updateUI, gameOver, grantCacheRewards } from '../ui/manager.js';
import { updateCamera } from './renderer.js';
import { playSoundSynth } from '../utils/audio.js';
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
    state.shapes.forEach((s, i) => s?.parent && state.spatialGrid.addObject({ shape: s, index: i }, s.position));
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
    updateShapes(deltaTime);
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
    const playerPos = state.player.position;
    state.shapes.forEach(shape => { if (shape?.parent) { shape.visible = shape.position.distanceToSquared(playerPos) < 400 || isVisible(shape); } });
    state.projectiles.forEach(p => { if (p?.mesh?.parent) p.mesh.visible = isVisible(p.mesh); });
    state.particles.forEach(p => { if (p?.mesh?.parent) p.mesh.visible = isVisible(p.mesh); });
    state.dataFragments.forEach(f => { if (f?.mesh?.parent) f.mesh.visible = isVisible(f.mesh); });
    state.megaDataFragments.forEach(f => { if (f?.mesh?.parent) f.mesh.visible = isVisible(f.mesh); });
}

function updateShapes(deltaTime) {
    for (let i = state.shapes.length - 1; i >= 0; i--) {
        const shape = state.shapes[i];
        if (!shape || !shape.userData || !shape.parent) { if (shape && !shape.parent) state.shapes.splice(i, 1); continue; }
        const typeData = ENEMY_TYPES[shape.userData.type];
        if (!typeData) { state.scene.remove(shape); shape.geometry?.dispose(); shape.material?.dispose(); state.shapes.splice(i, 1); continue; }

        let targetPosition = state.player.position.clone();
        let currentSpeed = shape.userData.currentSpeed ?? typeData.speed;
        let executeDefaultMovement = true;

        switch (shape.userData.type) {
            case 'ICOSAHEDRON_INVADER':
                shape.userData.distortTimer = (shape.userData.distortTimer || typeData.distortCooldown) - deltaTime;
                if (shape.userData.distortTimer <= 0) {
                    createTemporaryVisualEffect(shape.position, 3, typeData.color || 0x4B5320, 0.5, true);
                    shape.userData.distortTimer = typeData.distortCooldown + Math.random() * 5;
                }
                break;
            case 'PRISM_DASHER':
                executeDefaultMovement = false;
                shape.userData.dashTimer = (shape.userData.dashTimer || typeData.dashCooldown) - deltaTime;
                if (!shape.userData.isDashing && shape.userData.dashTimer <= 0) {
                    shape.userData.isDashing = true;
                    shape.userData.dashTargetPos = state.player.position.clone();
                    shape.userData.dashDir = new THREE.Vector3().subVectors(shape.userData.dashTargetPos, shape.position).normalize();
                    shape.userData.dashTimeLeft = typeData.dashDuration;
                    shape.userData.currentSpeed = typeData.dashSpeed;
                }
                if (shape.userData.isDashing) {
                    shape.userData.dashTimeLeft -= deltaTime;
                    if (shape.userData.dashTimeLeft <= 0) {
                        shape.userData.isDashing = false;
                        shape.userData.dashTimer = typeData.dashCooldown + Math.random();
                        shape.userData.currentSpeed = typeData.speed;
                    } else {
                        shape.position.add(shape.userData.dashDir.clone().multiplyScalar(shape.userData.currentSpeed * deltaTime));
                    }
                } else {
                    shape.lookAt(state.player.position.x, shape.position.y, state.player.position.z);
                }
                break;
            case 'CYLINDER_CORRUPTER':
                const dirToPlayerCorrupt = new THREE.Vector3().subVectors(state.player.position, shape.position).normalize();
                const perpendicularDir = new THREE.Vector3(-dirToPlayerCorrupt.z, 0, dirToPlayerCorrupt.x);
                shape.userData.weaveTimer = (shape.userData.weaveTimer || 0) + deltaTime * 5;
                const weaveOffset = perpendicularDir.multiplyScalar(Math.sin(shape.userData.weaveTimer) * 1.0);
                targetPosition = state.player.position.clone().add(weaveOffset);
                break;
            case 'SPHERE_SPLITTER':
                if (shape.userData.generation === 1) {
                    shape.userData.bounceTimer = (shape.userData.bounceTimer || 0) + deltaTime * 6;
                    shape.position.y = (shape.radius || 0.5) + Math.abs(Math.sin(shape.userData.bounceTimer)) * 0.4;
                }
                break;
            case 'DODECAHEDRON_DRIFTER':
                const playerLookDir = new THREE.Vector3();
                state.player.getWorldDirection(playerLookDir).setY(0).normalize();
                if (playerLookDir.lengthSq() < 0.01) playerLookDir.set(0, 0, -1);

                shape.userData.shiftTimer = (shape.userData.shiftTimer || typeData.shiftCooldown) - deltaTime;
                if (shape.userData.shiftTimer <= 0) {
                    const behindPos = state.player.position.clone().add(playerLookDir.clone().multiplyScalar(-(6 + Math.random() * 4)));
                    createTemporaryVisualEffect(shape.position, 1.5, typeData.color, 0.2);
                    shape.position.set(behindPos.x, shape.position.y, behindPos.z);
                    createTemporaryVisualEffect(shape.position, 1.5, typeData.color, 0.2);
                    shape.userData.shiftTimer = typeData.shiftCooldown + Math.random() * 2;
                }
                break;
            case 'CONE_CASTER':
                shape.userData.shardTimer = (shape.userData.shardTimer || typeData.shardCooldown) - deltaTime;
                if (shape.userData.shardTimer <= 0 && shape.position.distanceTo(state.player.position) < 18) {
                    const shardDirection = new THREE.Vector3().subVectors(state.player.position, shape.position).normalize();
                    const enemyProjectile = {
                        velocity: shardDirection.clone().multiplyScalar(CONSTANTS.BASE_PROJECTILE_SPEED * 0.6),
                        damage: typeData.deathBurstDamage || 10,
                        isEnemyProjectile: true,
                        radius: CONSTANTS.PROJECTILE_RADIUS * 0.8
                    };
                    const projMesh = new THREE.Mesh(new THREE.ConeGeometry(enemyProjectile.radius, enemyProjectile.radius * 3, 4), new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffcc33, emissiveIntensity: 0.5 }));
                    projMesh.position.copy(shape.position).add(shardDirection.clone().multiplyScalar((shape.radius || 0.5) + enemyProjectile.radius));
                    enemyProjectile.mesh = projMesh;
                    state.projectiles.push(enemyProjectile);
                    state.scene.add(projMesh);
                    shape.userData.shardTimer = typeData.shardCooldown + Math.random() * 2;
                }
                break;
            case 'BOSS_OCTA_PRIME':
                executeDefaultMovement = false;
                const bossData = shape.userData;
                const bossParams = typeData;
                if (bossData.attackState === 'MOVING') { bossData.attackCooldownTimer -= deltaTime; }

                switch (bossData.attackState) {
                    case 'MOVING':
                        const dirToPlayerBoss = new THREE.Vector3().subVectors(targetPosition, shape.position).setY(0);
                        if (dirToPlayerBoss.lengthSq() > 0.1) shape.position.add(dirToPlayerBoss.normalize().multiplyScalar(bossParams.speed * deltaTime));
                        shape.lookAt(state.player.position.x, shape.position.y, state.player.position.z);
                        if (bossData.attackCooldownTimer <= 0) {
                            bossData.currentAttackPattern = bossParams.attackPatterns[Math.floor(Math.random() * bossParams.attackPatterns.length)];
                            switch (bossData.currentAttackPattern) {
                                case 'PULSE': bossData.attackState = 'CHARGING_PULSE'; bossData.attackStateTimer = bossParams.pulseChargeTime; break;
                                case 'RAPID_FIRE': bossData.attackState = 'CHARGING_RAPID'; bossData.attackStateTimer = 0.5; bossData.rapidFireTargetPos = state.player.position.clone(); break;
                                case 'DASH_SLAM': bossData.attackState = 'CHARGING_DASH'; bossData.attackStateTimer = bossParams.dashChargeTime; break;
                                case 'SUMMON': bossData.attackState = 'CHARGING_SUMMON'; bossData.attackStateTimer = bossParams.summonChargeTime; break;
                            }
                        }
                        break;
                    case 'CHARGING_PULSE':
                        bossData.attackStateTimer -= deltaTime;
                        if (bossData.attackStateTimer <= 0) {
                            bossData.attackState = 'PULSING';
                            createTemporaryVisualEffect(shape.position, bossParams.pulseRadius, bossParams.pulseColor, 0.4, true);
                            playSoundSynth('shoot_basic', 0.7, { pitch: 150 });
                            if (state.player.position.distanceTo(shape.position) < bossParams.pulseRadius + CONSTANTS.PLAYER_RADIUS) {
                                state.playerShield -= bossParams.pulseDamage;
                                createHitEffect(state.player, bossParams.pulseColor, 0.2);
                                playSoundSynth('player_hit', 0.6);
                                if (state.playerShield <= 0) { gameOver(); return; }
                            }
                        }
                        break;
                    case 'PULSING':
                        bossData.attackState = 'MOVING';
                        bossData.attackCooldownTimer = bossParams.attackCooldown;
                        break;
                    case 'CHARGING_RAPID':
                        bossData.attackStateTimer -= deltaTime;
                        if (bossData.rapidFireTargetPos) { shape.lookAt(bossData.rapidFireTargetPos.x, shape.position.y, bossData.rapidFireTargetPos.z); }
                        if (bossData.attackStateTimer <= 0) { bossData.attackState = 'FIRING_RAPID'; bossData.rapidFireBursts = 5; bossData.rapidFireBurstTimer = 0.12; }
                        break;
                    case 'FIRING_RAPID':
                        bossData.rapidFireBurstTimer -= deltaTime;
                        if (bossData.rapidFireBurstTimer <= 0 && bossData.rapidFireBursts > 0) {
                            bossData.rapidFireBursts--;
                            bossData.rapidFireBurstTimer = 0.12;
                            const fireDirBoss = new THREE.Vector3().subVectors(bossData.rapidFireTargetPos || state.player.position, shape.position).normalize();
                            const projMeshBoss = new THREE.Mesh(new THREE.SphereGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.2, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
                            projMeshBoss.position.copy(shape.position).add(fireDirBoss.clone().multiplyScalar((shape.radius || 1.5) + 0.2));
                            state.projectiles.push({ mesh: projMeshBoss, velocity: fireDirBoss.multiplyScalar(CONSTANTS.BASE_PROJECTILE_SPEED * 1.5), damage: (bossParams.damageMultiplier || 1) * 15, isEnemyProjectile: true, radius: CONSTANTS.PROJECTILE_RADIUS * 1.2 });
                            state.scene.add(projMeshBoss);
                        }
                        if (bossData.rapidFireBursts <= 0) {
                            bossData.attackState = 'MOVING';
                            bossData.attackCooldownTimer = bossParams.attackCooldown;
                        }
                        break;
                    case 'CHARGING_DASH':
                        bossData.attackStateTimer -= deltaTime;
                        shape.lookAt(state.player.position.x, shape.position.y, state.player.position.z);
                        if (bossData.attackStateTimer <= 0) {
                            bossData.attackState = 'DASHING';
                            bossData.attackStateTimer = bossParams.dashDuration;
                            bossData.dashDir = new THREE.Vector3().subVectors(state.player.position, shape.position).normalize();
                        }
                        break;
                    case 'DASHING':
                        bossData.attackStateTimer -= deltaTime;
                        shape.position.add(bossData.dashDir.clone().multiplyScalar(bossParams.speed * bossParams.dashSpeedMultiplier * deltaTime));
                        if (bossData.attackStateTimer <= 0) {
                            bossData.attackState = 'SLAMMING';
                            createTemporaryVisualEffect(shape.position, bossParams.slamRadius, 0x00FFFF, 0.5, true);
                            if (state.player.position.distanceTo(shape.position) < bossParams.slamRadius + CONSTANTS.PLAYER_RADIUS) {
                                state.playerShield -= bossParams.slamDamage;
                                createHitEffect(state.player, 0x00FFFF, 0.3);
                                if (state.playerShield <= 0) { gameOver(); return; }
                            }
                        }
                        break;
                    case 'SLAMMING':
                        bossData.attackState = 'MOVING';
                        bossData.attackCooldownTimer = bossParams.attackCooldown;
                        break;
                    case 'CHARGING_SUMMON':
                        bossData.attackStateTimer -= deltaTime;
                        if (bossData.attackStateTimer <= 0) {
                            bossData.attackState = 'SUMMONING';
                            for(let j = 0; j < bossParams.summonCount; j++) {
                                const angle = (j / bossParams.summonCount) * Math.PI * 2;
                                const spawnPos = shape.position.clone().add(new THREE.Vector3(Math.cos(angle) * 2, 0, Math.sin(angle) * 2));
                                spawnEnemyByType(bossParams.summonType, spawnPos);
                            }
                        }
                        break;
                    case 'SUMMONING':
                        bossData.attackState = 'MOVING';
                        bossData.attackCooldownTimer = bossParams.attackCooldown;
                        break;
                }
                break;
        }

        if (executeDefaultMovement) {
            if (currentSpeed > 0) {
                const direction = new THREE.Vector3().subVectors(targetPosition, shape.position).setY(0);
                if (direction.lengthSq() > 0.01) {
                    direction.normalize();
                    shape.position.add(direction.multiplyScalar(currentSpeed * deltaTime));
                }
            }
        }

        const DESPAWN_THRESHOLD = 85;
        if (!typeData.isBoss && state.player.position.distanceTo(shape.position) > DESPAWN_THRESHOLD) {
            state.scene.remove(shape);
            shape.geometry?.dispose();
            shape.material?.dispose();
            state.shapes.splice(i, 1);
            continue;
        }

        shape.position.x = Math.max(-CONSTANTS.WORLD_BOUNDARY + (shape.radius || 0), Math.min(CONSTANTS.WORLD_BOUNDARY - (shape.radius || 0), shape.position.x));
        shape.position.z = Math.max(-CONSTANTS.WORLD_BOUNDARY + (shape.radius || 0), Math.min(CONSTANTS.WORLD_BOUNDARY - (shape.radius || 0), shape.position.z));
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