import * as THREE from 'three';
import { state, GameState, CONSTANTS } from '../state.js';
import { gameOver, winGame, collectXP, openGeometricCache } from '../ui/manager.js';
import { playSoundSynth } from '../utils/audio.js';
import { triggerHaptic } from '../utils/input.js';
import {
    createHitEffect,
    createBurstEffect,
    spawnGeometricCache,
    spawnDataFragment,
    spawnSplitterOffspring,
    createDamageNumber,
    returnEnemyToPool,
    returnToPool
} from './spawner.js';
import { ENEMY_TYPES } from '../config/enemies.js';


const _knockbackDir = new THREE.Vector3();
const _tempVec0 = new THREE.Vector3();
const _tempVec1 = new THREE.Vector3();

// --- OPTIMIZATION: Pooled Sets to prevent GC pressure during heavy load ---
const _projectilesToRemove = new Set();
const _shapesToRemove = new Set();
const _repairNodesToRemove = new Set();
const _energyCoresToRemove = new Set();
const _dataFragmentsToRemove = new Set();
const _megaDataFragmentsToRemove = new Set();
const _projectilesConsumedThisFrame = new Set();

export function checkCollisions() {
    if (!state.player || state.isPaused) return;

    // Early exit if nothing to process
    if (state.shapes.length === 0 && state.projectiles.length === 0) return;

    // Clear pooled Sets (faster than creating new ones)
    _projectilesToRemove.clear();
    _shapesToRemove.clear();
    _repairNodesToRemove.clear();
    _energyCoresToRemove.clear();
    _dataFragmentsToRemove.clear();
    _megaDataFragmentsToRemove.clear();
    _projectilesConsumedThisFrame.clear();

    // Use pooled Sets
    const projectilesToRemove = _projectilesToRemove;
    const shapesToRemove = _shapesToRemove;
    const repairNodesToRemove = _repairNodesToRemove;
    const energyCoresToRemove = _energyCoresToRemove;
    const dataFragmentsToRemove = _dataFragmentsToRemove;
    const megaDataFragmentsToRemove = _megaDataFragmentsToRemove;
    const projectilesConsumedThisFrame = _projectilesConsumedThisFrame;

    // --- 1. HIGH-PERFORMANCE COLLISION CHECK: ENEMY-CENTRIC LOOP ---
    // This is much faster than looping through every projectile.
    state.shapes.forEach((enemyData, enemyIndex) => {
        if (!enemyData || shapesToRemove.has(enemyIndex)) return;

        // Get all projectiles near this specific enemy just once.
        const nearbyProjectiles = state.spatialGrid.getObjectsNear(enemyData.position, 5);

        for (const gridObject of nearbyProjectiles) {
            // We only care about player projectiles.
            if (!gridObject.projectile || gridObject.projectile.isEnemyProjectile) continue;

            const projectile = gridObject.projectile;
            const pIndex = gridObject.index;

            // Skip if projectile is already used up or has already hit this specific enemy.
            if (projectilesConsumedThisFrame.has(pIndex) || projectile.hitEnemies.has(enemyIndex)) continue;

            // OPTIMIZATION: Use squared distances. Use 2D distance to support floating player/projectiles.
            _tempVec0.copy(enemyData.position).setY(0);
            _tempVec1.copy(projectile.mesh.position).setY(0);
            const distanceSq = _tempVec0.distanceToSquared(_tempVec1);
            const collisionThreshold = enemyData.radius + (projectile.radius || CONSTANTS.PROJECTILE_RADIUS);
            const collisionThresholdSq = collisionThreshold * collisionThreshold;

            if (distanceSq < collisionThresholdSq) {
                // --- COLLISION DETECTED! ---
                projectile.hitEnemies.add(enemyIndex); // Prevents multi-hits from this projectile.

                let damageDealt = projectile.damage * state.baseDamageMultiplier;
                const isCrit = Math.random() < state.playerCritChance;
                if (isCrit) damageDealt *= state.playerCritDamageMultiplier;

                enemyData.health -= damageDealt;
                createDamageNumber(enemyData.position, damageDealt, isCrit);
                createHitEffect(enemyData, 0xffffff, 0.15);
                playSoundSynth('enemy_hit', 0.3, { pitch: 220 + Math.random() * 50 });

                if (!projectile.tags?.includes('piercing')) {
                    projectilesToRemove.add(pIndex);
                    projectilesConsumedThisFrame.add(pIndex);
                }

                if (enemyData.health <= 0) {
                    shapesToRemove.add(enemyIndex);
                    state.score += Math.max(1, Math.floor((enemyData.xpValue || 1) * 0.7));
                    if (enemyData.isBoss) winGame();

                    // Cache drop logic - Only Cyber-Hydra has a chance to drop
                    let dropChest = false;
                    if (enemyData.type === 'CYBER_HYDRA') {
                        dropChest = Math.random() < 0.5; // 50% chance to drop a cache
                    }

                    if (dropChest) {
                        spawnGeometricCache(enemyData.position);
                    } else if (enemyData.type === 'GLITCH_HORROR') {
                        spawnSplitterOffspring(enemyData.position, enemyData.generation || 1);
                        spawnSplitterOffspring(enemyData.position, enemyData.generation || 1);
                    } else {
                        spawnDataFragment(enemyData.position, enemyData.xpValue);
                    }
                }
                // If the projectile was consumed, stop checking this enemy against other projectiles.
                if (projectilesConsumedThisFrame.has(pIndex)) break;
            }
        }
    });

    // --- 2. PLAYER-CENTRIC COLLISIONS (This is already efficient) ---
    const nearbyToPlayer = state.spatialGrid.getObjectsNear(state.player.position, Math.max(state.xpCollectionRadius, 5));
    for (const gridObject of nearbyToPlayer) {

        // A. Player vs. Enemy
        if (gridObject.enemy && !shapesToRemove.has(gridObject.index)) {
            const enemyData = gridObject.enemy;
            const typeData = ENEMY_TYPES[enemyData.type];
            const playerCollisionThreshold = CONSTANTS.PLAYER_RADIUS + enemyData.radius;

            // Use 2D distance for robust collision with floating player
            _tempVec0.copy(state.player.position).setY(0);
            _tempVec1.copy(enemyData.position).setY(0);

            if (typeData && _tempVec0.distanceToSquared(_tempVec1) < playerCollisionThreshold * playerCollisionThreshold) {
                state.playerShield -= (typeData.damageMultiplier || 1.0) * (5 + Math.floor(state.gameTime / 60));
                playSoundSynth('player_hit', 0.6);
                triggerHaptic('medium');

                state.screenShakeIntensity = 0.3;
                state.screenShakeTime = 0.2;
                state.vignetteFlashTime = 0.3;

                _knockbackDir.subVectors(state.player.position, enemyData.position).setY(0);
                const kbDistSq = _knockbackDir.lengthSq();
                if (kbDistSq > 0.0001) {
                    _knockbackDir.normalize();
                    state.player.position.add(_tempVec0.copy(_knockbackDir).multiplyScalar(0.3));
                    enemyData.position.add(_tempVec0.copy(_knockbackDir).multiplyScalar(-0.8));
                }

                if (enemyData.type === 'SEC_DRONE') shapesToRemove.add(gridObject.index);
                if (typeData.specialAbility === 'corrupt_touch') state.corruptionEffectTimer = Math.max(state.corruptionEffectTimer, 5.0);
                if (state.playerShield <= 0 && state.currentGameState === GameState.Playing) { gameOver(); return; }
            }
        }

        // B. Player vs. Enemy Projectile
        else if (gridObject.projectile && gridObject.projectile.isEnemyProjectile && !projectilesToRemove.has(gridObject.index)) {
            const enemyProjCollisionThreshold = CONSTANTS.PLAYER_RADIUS + (gridObject.projectile.radius || CONSTANTS.PROJECTILE_RADIUS);

            _tempVec0.copy(state.player.position).setY(0);
            _tempVec1.copy(gridObject.projectile.mesh.position).setY(0);

            if (_tempVec0.distanceToSquared(_tempVec1) < enemyProjCollisionThreshold * enemyProjCollisionThreshold) {
                state.playerShield -= gridObject.projectile.damage;
                playSoundSynth('player_hit', 0.6);
                projectilesToRemove.add(gridObject.index);
                if (state.playerShield <= 0 && state.currentGameState === GameState.Playing) { gameOver(); return; }
            }
        }

        // C. Player vs. Pickups (Ignoring Y for all)
        else if (gridObject.dataFragment && !dataFragmentsToRemove.has(gridObject.index)) {
            _tempVec0.copy(state.player.position).setY(0);
            _tempVec1.copy(gridObject.dataFragment.mesh.position).setY(0);
            if (_tempVec0.distanceToSquared(_tempVec1) < state.xpCollectionRadius * state.xpCollectionRadius) {
                dataFragmentsToRemove.add(gridObject.index);
                collectXP(gridObject.dataFragment.xpValue);
            }
        } else if (gridObject.megaDataFragment && !megaDataFragmentsToRemove.has(gridObject.index)) {
            _tempVec0.copy(state.player.position).setY(0);
            _tempVec1.copy(gridObject.megaDataFragment.mesh.position).setY(0);
            if (_tempVec0.distanceToSquared(_tempVec1) < state.xpCollectionRadius * state.xpCollectionRadius) {
                megaDataFragmentsToRemove.add(gridObject.index);
                collectXP(gridObject.megaDataFragment.xpValue);
                createBurstEffect(gridObject.megaDataFragment.mesh.position, 35, 0xFF8C00, 4.5, 0.6);
            }
        } else if (gridObject.geometricCache) {
            _tempVec0.copy(state.player.position).setY(0);
            _tempVec1.copy(gridObject.geometricCache.mesh.position).setY(0);
            if (_tempVec0.distanceToSquared(_tempVec1) < Math.pow(CONSTANTS.PICKUP_COLLECTION_RADIUS + CONSTANTS.CACHE_RADIUS, 2)) {
                openGeometricCache(gridObject.geometricCache.mesh);
            }
        } else if (gridObject.repairNode && !repairNodesToRemove.has(gridObject.index)) {
            _tempVec0.copy(state.player.position).setY(0);
            _tempVec1.copy(gridObject.repairNode.mesh.position).setY(0);
            if (_tempVec0.distanceToSquared(_tempVec1) < CONSTANTS.PICKUP_COLLECTION_RADIUS * CONSTANTS.PICKUP_COLLECTION_RADIUS) {
                repairNodesToRemove.add(gridObject.index);
                state.playerShield = Math.min(state.MAX_PLAYER_SHIELD, state.playerShield + gridObject.repairNode.shieldValue);
            }
        } else if (gridObject.energyCore && !energyCoresToRemove.has(gridObject.index)) {
            _tempVec0.copy(state.player.position).setY(0);
            _tempVec1.copy(gridObject.energyCore.mesh.position).setY(0);
            if (_tempVec0.distanceToSquared(_tempVec1) < CONSTANTS.PICKUP_COLLECTION_RADIUS * CONSTANTS.PICKUP_COLLECTION_RADIUS) {
                energyCoresToRemove.add(gridObject.index);
                collectXP(gridObject.energyCore.xpValue);
            }
        }
    }

    // --- 4. PROCESS ALL REMOVALS AT THE END OF THE FRAME ---
    if (shapesToRemove.size > 0) {
        const sortedIndices = Array.from(shapesToRemove).sort((a, b) => b - a);
        for (const index of sortedIndices) {
            const enemy = state.shapes[index];
            if (enemy) {
                returnEnemyToPool(enemy);
                state.shapes.splice(index, 1);
            }
        }
    }

    function processMeshRemovals(set, array, poolName) {
        if (set.size === 0) return;
        const sorted = Array.from(set).sort((a, b) => b - a);
        for (const index of sorted) {
            const item = array[index];
            if (item) {
                const mesh = item.mesh || item;
                if (poolName && !item.is2D) {
                    returnToPool(poolName, mesh);
                }
                else {
                    state.scene.remove(mesh);
                    if (item.is2D) {
                        if (mesh.geometry) mesh.geometry.dispose();
                        if (mesh.material) mesh.material.dispose();
                    } else {
                        mesh.geometry?.dispose();
                        if (mesh.material) {
                            if (Array.isArray(mesh.material)) mesh.material.forEach(m => m?.dispose());
                            else mesh.material.dispose();
                        }
                    }
                }
                array.splice(index, 1);
            }
        }
    }

    processMeshRemovals(projectilesToRemove, state.projectiles, 'projectiles');
    processMeshRemovals(dataFragmentsToRemove, state.dataFragments, 'dataFragments');
    processMeshRemovals(megaDataFragmentsToRemove, state.megaDataFragments);
    processMeshRemovals(repairNodesToRemove, state.repairNodes);
    processMeshRemovals(energyCoresToRemove, state.energyCores);
}