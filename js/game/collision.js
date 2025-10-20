import * as THREE from 'three';
import { state, GameState, CONSTANTS } from '../state.js';
import { gameOver, winGame, collectXP, openGeometricCache } from '../ui/manager.js';
import { playSoundSynth } from '../utils/audio.js';
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

export function checkCollisions() {
    if (!state.player || state.isPaused) return;

    const projectilesToRemove = new Set();
    const shapesToRemove = new Set();
    const repairNodesToRemove = new Set();
    const energyCoresToRemove = new Set();
    const dataFragmentsToRemove = new Set();
    const megaDataFragmentsToRemove = new Set();

    // --- 1. PROJECTILE vs. ENTITY COLLISIONS ---
    state.projectiles.forEach((projectile, pIndex) => {
        if (!projectile || !projectile.mesh || projectilesToRemove.has(pIndex)) return;

        // A. Enemy projectile vs. Player
        if (projectile.isEnemyProjectile) {
            if (state.player.position.distanceTo(projectile.mesh.position) < CONSTANTS.PLAYER_RADIUS + (projectile.radius || CONSTANTS.PROJECTILE_RADIUS)) {
                state.playerShield -= projectile.damage;
                playSoundSynth('player_hit', 0.6);
                projectilesToRemove.add(pIndex);
                if (state.playerShield <= 0 && state.currentGameState === GameState.Playing) {
                    gameOver();
                }
            }
            return;
        }

        // B. Player projectile vs. Enemy
        const nearbyEnemies = state.spatialGrid.getObjectsNear(projectile.mesh.position, 2);

        for (const gridObject of nearbyEnemies) {
            // **FIX**: Correctly reference the enemy data object and its index from the grid
            const enemyData = gridObject.enemy;
            const enemyIndex = gridObject.index;

            // --- LEGACY FEATURE RESTORED: SINGLE-HIT LOGIC ---
            // If this projectile has already hit this specific enemy, skip it.
            if (!enemyData || shapesToRemove.has(enemyIndex) || projectile.hitEnemies.has(enemyIndex)) {
                continue;
            }

            const distance = projectile.mesh.position.distanceTo(enemyData.position);
            const collisionThreshold = (projectile.radius || CONSTANTS.PROJECTILE_RADIUS) + enemyData.radius;

            if (distance < collisionThreshold) {
                // --- COLLISION DETECTED! ---

                // **LEGACY FEATURE RESTORED**: Add enemy to the projectile's "hit list" immediately.
                // This prevents this same projectile from hitting this same enemy again in the next frame.
                projectile.hitEnemies.add(enemyIndex);

                let damageDealt = projectile.damage * state.baseDamageMultiplier;
                const isCrit = Math.random() < state.playerCritChance;
                if (isCrit) {
                    damageDealt *= state.playerCritDamageMultiplier;
                }

                enemyData.health -= damageDealt;
                playSoundSynth('enemy_hit', 0.3, { pitch: 220 + Math.random() * 50 });
                createDamageNumber(enemyData.position, damageDealt, isCrit);
                createHitEffect(enemyData, 0xffffff, 0.15); // Pass data object

                if (projectile.onHit) {
                    projectile.onHit(enemyData, projectile);
                }

                if (!projectile.tags?.includes('piercing')) {
                    projectilesToRemove.add(pIndex);
                }

                if (enemyData.health <= 0) {
                    shapesToRemove.add(enemyIndex);
                    state.score += Math.max(1, Math.floor((enemyData.xpValue || 1) * 0.7));

                    if (enemyData.isBoss) { winGame(); }

                    if (enemyData.dropsCache) {
                        spawnGeometricCache(enemyData.position);
                    } else if (enemyData.type === 'SPHERE_SPLITTER') {
                        spawnSplitterOffspring(enemyData.position, enemyData.generation || 1);
                        spawnSplitterOffspring(enemyData.position, enemyData.generation || 1);
                    } else {
                        spawnDataFragment(enemyData.position, enemyData.xpValue);
                    }

                    const killingWeapon = state.playerWeapons.find(w => w.id === projectile.weaponId);
                    if (killingWeapon?.id === 'ENERGY_SIPHON' && killingWeapon.getShieldRestore) {
                        state.playerShield = Math.min(state.MAX_PLAYER_SHIELD, state.playerShield + killingWeapon.getShieldRestore());
                    }

                    if (!projectile.tags?.includes('piercing')) {
                        break;
                    }
                }
            }
        }
    });

    // --- 2. PLAYER vs. ENTITY COLLISIONS (Damage & Effects) ---
    const nearbyToPlayer = state.spatialGrid.getObjectsNear(state.player.position, 5);
    for (const gridObject of nearbyToPlayer) {

        // A. Player vs. Enemy
        if (gridObject.enemy && !shapesToRemove.has(gridObject.index)) {
            const enemyData = gridObject.enemy;
            const typeData = ENEMY_TYPES[enemyData.type];
            if (!typeData) continue;

            const distance = state.player.position.distanceTo(enemyData.position);
            if (distance < CONSTANTS.PLAYER_RADIUS + enemyData.radius) {
                const damageToPlayer = (typeData.damageMultiplier || 1.0) * (5 + Math.floor(state.gameTime / 60));
                state.playerShield -= damageToPlayer;
                playSoundSynth('player_hit', 0.6);

                const knockbackDir = new THREE.Vector3().subVectors(state.player.position, enemyData.position).normalize().setY(0);
                state.player.position.add(knockbackDir.clone().multiplyScalar(0.3));
                enemyData.position.add(knockbackDir.clone().multiplyScalar(-0.8));

                if (enemyData.type === 'TETRA_SWARMER') {
                    shapesToRemove.add(gridObject.index);
                }
                if (typeData.specialAbility === 'corrupt_touch') {
                    state.corruptionEffectTimer = Math.max(state.corruptionEffectTimer, 5.0);
                }

                if (state.playerShield <= 0 && state.currentGameState === GameState.Playing) {
                    gameOver();
                    return;
                }
            }
        }

        // B. Player vs. Pickups (This logic remains the same)
        else if (gridObject.dataFragment && !dataFragmentsToRemove.has(gridObject.index) && state.player.position.distanceTo(gridObject.dataFragment.mesh.position) < state.xpCollectionRadius) {
            dataFragmentsToRemove.add(gridObject.index);
            collectXP(gridObject.dataFragment.xpValue);
            playSoundSynth('pickup_xp', 0.2, { pitch: 880 + Math.random() * 200 });
        } else if (gridObject.megaDataFragment && !megaDataFragmentsToRemove.has(gridObject.index) && state.player.position.distanceTo(gridObject.megaDataFragment.mesh.position) < state.xpCollectionRadius) {
            megaDataFragmentsToRemove.add(gridObject.index);
            collectXP(gridObject.megaDataFragment.xpValue);
            playSoundSynth('pickup_xp', 0.45, { pitch: 330 + Math.random() * 80 });
            createBurstEffect(gridObject.megaDataFragment.mesh.position, 35, 0xFF8C00, 4.5, 0.6);
        } else if (gridObject.geometricCache && state.player.position.distanceTo(gridObject.geometricCache.mesh.position) < CONSTANTS.PICKUP_COLLECTION_RADIUS + CONSTANTS.CACHE_RADIUS) {
            openGeometricCache(gridObject.geometricCache.mesh);
        } else if (gridObject.repairNode && !repairNodesToRemove.has(gridObject.index) && state.player.position.distanceTo(gridObject.repairNode.mesh.position) < CONSTANTS.PICKUP_COLLECTION_RADIUS) {
            repairNodesToRemove.add(gridObject.index);
            state.playerShield = Math.min(state.MAX_PLAYER_SHIELD, state.playerShield + gridObject.repairNode.shieldValue);
            playSoundSynth('pickup_health', 0.5);
        } else if (gridObject.energyCore && !energyCoresToRemove.has(gridObject.index) && state.player.position.distanceTo(gridObject.energyCore.mesh.position) < CONSTANTS.PICKUP_COLLECTION_RADIUS) {
            energyCoresToRemove.add(gridObject.index);
            collectXP(gridObject.energyCore.xpValue);
            playSoundSynth('pickup_xp', 0.25, { pitch: 660 + Math.random() * 150 });
        }
    }

    // --- 4. PROCESS REMOVALS ---
    if (shapesToRemove.size > 0) {
        const sortedIndices = Array.from(shapesToRemove).sort((a, b) => b - a);
        for (const index of sortedIndices) {
            const enemy = state.shapes[index];
            if (enemy) {
                const typeData = ENEMY_TYPES[enemy.type] || {};
                const deathColor = new THREE.Color(typeData.color || 0xffffff).getHex();
                createBurstEffect(enemy.position, 15, deathColor, 3, 0.4);
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