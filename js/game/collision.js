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


// Reusable vector to prevent creating new objects in the loop (anti-jank)
const _knockbackDir = new THREE.Vector3();

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

            // OPTIMIZATION: Use squared distances to avoid expensive square root calculations.
            const distanceSq = enemyData.position.distanceToSquared(projectile.mesh.position);
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

                    // Chest drop logic - Only Pyramid Piercer has a chance to drop
                    let dropChest = false;
                    if (enemyData.type === 'PYRAMID_PIERCER') {
                        dropChest = Math.random() < 0.5; // 50% chance to drop a cache
                    }

                    if (dropChest) {
                        spawnGeometricCache(enemyData.position);
                    } else if (enemyData.type === 'SPHERE_SPLITTER') {
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

            if (typeData && state.player.position.distanceToSquared(enemyData.position) < playerCollisionThreshold * playerCollisionThreshold) {
                state.playerShield -= (typeData.damageMultiplier || 1.0) * (5 + Math.floor(state.gameTime / 60));
                playSoundSynth('player_hit', 0.6);
                triggerHaptic('medium'); // Haptic feedback for damage

                // Trigger screen effects
                state.screenShakeIntensity = 0.3;
                state.screenShakeTime = 0.2;
                state.vignetteFlashTime = 0.3;

                // OPTIMIZATION: Use the reusable vector for knockback to prevent garbage collection.
                _knockbackDir.subVectors(state.player.position, enemyData.position).normalize().setY(0);
                state.player.position.add(_knockbackDir.clone().multiplyScalar(0.3));
                enemyData.position.add(_knockbackDir.clone().multiplyScalar(-0.8));

                if (enemyData.type === 'TETRA_SWARMER') shapesToRemove.add(gridObject.index);
                if (typeData.specialAbility === 'corrupt_touch') state.corruptionEffectTimer = Math.max(state.corruptionEffectTimer, 5.0);
                if (state.playerShield <= 0 && state.currentGameState === GameState.Playing) { gameOver(); return; }
            }
        }

        // B. Player vs. Enemy Projectile
        else if (gridObject.projectile && gridObject.projectile.isEnemyProjectile && !projectilesToRemove.has(gridObject.index)) {
            const enemyProjCollisionThreshold = CONSTANTS.PLAYER_RADIUS + (gridObject.projectile.radius || CONSTANTS.PROJECTILE_RADIUS);
            if (state.player.position.distanceToSquared(gridObject.projectile.mesh.position) < enemyProjCollisionThreshold * enemyProjCollisionThreshold) {
                state.playerShield -= gridObject.projectile.damage;
                playSoundSynth('player_hit', 0.6);
                projectilesToRemove.add(gridObject.index);
                if (state.playerShield <= 0 && state.currentGameState === GameState.Playing) { gameOver(); return; }
            }
        }

        // C. Player vs. Pickups
        else if (gridObject.dataFragment && !dataFragmentsToRemove.has(gridObject.index) && state.player.position.distanceToSquared(gridObject.dataFragment.mesh.position) < state.xpCollectionRadius * state.xpCollectionRadius) {
            dataFragmentsToRemove.add(gridObject.index);
            collectXP(gridObject.dataFragment.xpValue);
        } else if (gridObject.megaDataFragment && !megaDataFragmentsToRemove.has(gridObject.index) && state.player.position.distanceToSquared(gridObject.megaDataFragment.mesh.position) < state.xpCollectionRadius * state.xpCollectionRadius) {
            megaDataFragmentsToRemove.add(gridObject.index);
            collectXP(gridObject.megaDataFragment.xpValue);
            createBurstEffect(gridObject.megaDataFragment.mesh.position, 35, 0xFF8C00, 4.5, 0.6);
        } else if (gridObject.geometricCache && state.player.position.distanceToSquared(gridObject.geometricCache.mesh.position) < Math.pow(CONSTANTS.PICKUP_COLLECTION_RADIUS + CONSTANTS.CACHE_RADIUS, 2)) {
            openGeometricCache(gridObject.geometricCache.mesh);
        } else if (gridObject.repairNode && !repairNodesToRemove.has(gridObject.index) && state.player.position.distanceToSquared(gridObject.repairNode.mesh.position) < CONSTANTS.PICKUP_COLLECTION_RADIUS * CONSTANTS.PICKUP_COLLECTION_RADIUS) {
            repairNodesToRemove.add(gridObject.index);
            state.playerShield = Math.min(state.MAX_PLAYER_SHIELD, state.playerShield + gridObject.repairNode.shieldValue);
        } else if (gridObject.energyCore && !energyCoresToRemove.has(gridObject.index) && state.player.position.distanceToSquared(gridObject.energyCore.mesh.position) < CONSTANTS.PICKUP_COLLECTION_RADIUS * CONSTANTS.PICKUP_COLLECTION_RADIUS) {
            energyCoresToRemove.add(gridObject.index);
            collectXP(gridObject.energyCore.xpValue);
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
                if (poolName) { returnToPool(poolName, mesh); }
                else {
                    state.scene.remove(mesh);
                    mesh.geometry?.dispose();
                    if (mesh.material) {
                        if (Array.isArray(mesh.material)) mesh.material.forEach(m => m?.dispose());
                        else mesh.material.dispose();
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