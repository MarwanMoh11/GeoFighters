import { state, GameState, CONSTANTS } from '../state.js';
import { gameOver, winGame, collectXP, openGeometricCache } from '../ui/manager.js'; // Added winGame
import { playSoundSynth } from '../utils/audio.js';
import { createHitEffect, createBurstEffect, spawnGeometricCache, spawnDataFragment, spawnSplitterOffspring, createDamageNumber } from './spawner.js';
import { ENEMY_TYPES } from '../config/enemies.js';

export function checkCollisions() {
    if (!state.player) return;

    const projectilesToRemove = new Set();
    const shapesToRemove = new Set();
    const repairNodesToRemove = new Set();
    const energyCoresToRemove = new Set();
    const dataFragmentsToRemove = new Set();
    const megaDataFragmentsToRemove = new Set();

    // --- 1. PROJECTILE COLLISION LOGIC ---
    state.projectiles.forEach((projectile, pIndex) => {
        if (!projectile || !projectile.mesh || projectilesToRemove.has(pIndex)) return;

        // A. Enemy projectile vs. Player
        if (projectile.isEnemyProjectile) {
            if (state.player.position.distanceTo(projectile.mesh.position) < CONSTANTS.PLAYER_RADIUS + (projectile.radius || CONSTANTS.PROJECTILE_RADIUS)) {
                state.playerShield -= projectile.damage;
                createHitEffect(state.player, 0xff3333, 0.15);
                projectilesToRemove.add(pIndex);
                playSoundSynth('player_hit', 0.6);
                if (state.playerShield <= 0 && state.currentGameState === GameState.Playing) {
                    gameOver();
                }
            }
            return;
        }

        // B. Player projectile vs. Enemy
        const nearbyObjects = state.spatialGrid.getObjectsNear(projectile.mesh.position, CONSTANTS.PROJECTILE_RADIUS * 2);

        for (const obj of nearbyObjects) {
            if (!obj.shape || !obj.shape.userData || shapesToRemove.has(obj.index) || projectile.hitEnemies.has(obj.index) || !obj.shape.parent) {
                continue;
            }

            const shape = obj.shape;
            const sIndex = obj.index;
            const shapeRadius = shape.radius || 0.5;
            const distance = projectile.mesh.position.distanceTo(shape.position);
            const collisionThreshold = CONSTANTS.PROJECTILE_RADIUS + shapeRadius;

            if (distance < collisionThreshold) {
                let damageDealt = projectile.damage * state.baseDamageMultiplier;
                const isCrit = Math.random() < state.playerCritChance;
                if (isCrit) {
                    damageDealt *= state.playerCritDamageMultiplier;
                }

                shape.userData.health -= damageDealt;
                projectile.hitEnemies.add(sIndex);
                playSoundSynth('enemy_hit', 0.3, { pitch: 220 + Math.random() * 50 });
                createDamageNumber(shape.position, damageDealt, isCrit);

                if (projectile.onHit) {
                    projectile.onHit(shape, projectile);
                } else {
                    createHitEffect(shape);
                }

                if (!projectile.tags?.includes('piercing')) {
                    projectilesToRemove.add(pIndex);
                }

                if (shape.userData.health <= 0) {
                    shapesToRemove.add(sIndex);

                    // --- BOSS WIN CONDITION ---
                    if (shape.userData.isBoss) {
                        winGame();
                    }
                    // --------------------------

                    state.score += Math.max(1, Math.floor((shape.userData.xpValue || 1) * 0.7));

                    const typeDataOnDeath = ENEMY_TYPES[shape.userData.type];
                    if (typeDataOnDeath?.currencyDrop > 0) {
                        state.dataCores += typeDataOnDeath.currencyDrop;
                    }

                    if (shape.userData.dropsCache) {
                        spawnGeometricCache(shape.position);
                    } else if (shape.userData.type === 'SPHERE_SPLITTER') {
                        spawnSplitterOffspring(shape.position, shape.userData.generation || 1);
                        spawnSplitterOffspring(shape.position, shape.userData.generation || 1);
                    } else {
                        spawnDataFragment(shape.position, shape.userData.xpValue);
                    }

                    playSoundSynth('enemy_death', 0.4, { isLarge: typeDataOnDeath?.cost >= 5 });

                    const killingWeapon = state.playerWeapons.find(w => w.id === projectile.weaponId);
                    if (killingWeapon?.id === 'ENERGY_SIPHON' && killingWeapon.getShieldRestore) {
                        state.playerShield = Math.min(state.MAX_PLAYER_SHIELD, state.playerShield + killingWeapon.getShieldRestore());
                        createHitEffect(state.player, 0x33ff33, 0.25);
                    }

                    if (!projectile.tags?.includes('piercing')) {
                        break;
                    }
                }
            }
        }
    });

    // --- 2. PLAYER COLLISION LOGIC ---
    const nearbyShapesForPlayer = state.spatialGrid.getObjectsNear(state.player.position, CONSTANTS.PLAYER_RADIUS * 2);
    for (const obj of nearbyShapesForPlayer) {
        if (!obj.shape || !obj.shape.userData || shapesToRemove.has(obj.index) || !obj.shape.parent) continue;

        const shape = obj.shape;
        const typeData = ENEMY_TYPES[shape.userData.type];
        if (!typeData) continue;

        const distance = state.player.position.distanceTo(shape.position);

        if (distance < CONSTANTS.PLAYER_RADIUS + (shape.radius || 0.5)) {
            const damageToPlayer = (typeData.damageMultiplier || 1.0) * (5 + Math.floor(state.gameTime / 60));
            state.playerShield -= damageToPlayer;
            createHitEffect(state.player, 0xff0000, 0.2);
            playSoundSynth('player_hit', 0.6);

            const knockbackDir = new THREE.Vector3().subVectors(state.player.position, shape.position).normalize().setY(0);
            state.player.position.add(knockbackDir.clone().multiplyScalar(0.3));
            shape.position.add(knockbackDir.clone().multiplyScalar(-0.8));

            if (shape.userData.type === 'TETRA_SWARMER') {
                shapesToRemove.add(obj.index);
                createBurstEffect(shape.position, 10, typeData.color, 2, 0.3);
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

    // --- 3. Player vs. Pickups ---
    const nearbyPickups = state.spatialGrid.getObjectsNear(state.player.position, Math.max(state.xpCollectionRadius, CONSTANTS.PICKUP_COLLECTION_RADIUS) * 1.5);
    for (const obj of nearbyPickups) {
        if (obj.dataFragment && !dataFragmentsToRemove.has(obj.index) && state.player.position.distanceTo(obj.dataFragment.mesh.position) < state.xpCollectionRadius) {
            dataFragmentsToRemove.add(obj.index);
            collectXP(obj.dataFragment.xpValue);
            playSoundSynth('pickup_xp', 0.2, { pitch: 880 + Math.random() * 200 });
        } else if (obj.megaDataFragment && !megaDataFragmentsToRemove.has(obj.index) && state.player.position.distanceTo(obj.megaDataFragment.mesh.position) < state.xpCollectionRadius) {
            megaDataFragmentsToRemove.add(obj.index);
            collectXP(obj.megaDataFragment.xpValue);
            playSoundSynth('pickup_xp', 0.45, { pitch: 330 + Math.random() * 80 });
            createBurstEffect(obj.megaDataFragment.mesh.position, 35, 0xFF8C00, 4.5, 0.6);
        } else if (obj.geometricCache && state.player.position.distanceTo(obj.geometricCache.mesh.position) < CONSTANTS.PICKUP_COLLECTION_RADIUS + CONSTANTS.CACHE_RADIUS) {
            openGeometricCache(obj.geometricCache.mesh);
        } else if (obj.repairNode && !repairNodesToRemove.has(obj.index) && state.player.position.distanceTo(obj.repairNode.mesh.position) < CONSTANTS.PICKUP_COLLECTION_RADIUS) {
            repairNodesToRemove.add(obj.index);
            state.playerShield = Math.min(state.MAX_PLAYER_SHIELD, state.playerShield + obj.repairNode.shieldValue);
            createHitEffect(state.player, 0x00cc00, 0.3);
            playSoundSynth('pickup_health', 0.5);
        } else if (obj.energyCore && !energyCoresToRemove.has(obj.index) && state.player.position.distanceTo(obj.energyCore.mesh.position) < CONSTANTS.PICKUP_COLLECTION_RADIUS) {
            energyCoresToRemove.add(obj.index);
            collectXP(obj.energyCore.xpValue);
            createHitEffect(state.player, 0xdd00dd, 0.3);
            playSoundSynth('pickup_xp', 0.25, { pitch: 660 + Math.random() * 150 });
        }
    }

    // --- 4. PROCESS REMOVALS ---
    function processRemovals(set, array) {
        if (set.size === 0) return;
        const sorted = Array.from(set).sort((a, b) => b - a);
        for (const index of sorted) {
            if (array[index]) {
                const item = array[index];
                const mesh = item.mesh || item; // Handle shapes (direct meshes) and wrapped objects
                if (mesh) {
                    if(mesh.children) {
                        mesh.children.forEach(c => {
                            c.geometry?.dispose();
                            if(Array.isArray(c.material)) c.material.forEach(m => m?.dispose());
                            else c.material?.dispose();
                        });
                    }
                    state.scene.remove(mesh);
                    mesh.geometry?.dispose();
                    if(Array.isArray(mesh.material)) mesh.material.forEach(m => m?.dispose());
                    else mesh.material?.dispose();
                }
                array.splice(index, 1);
            }
        }
    }

    Array.from(shapesToRemove).sort((a,b)=>b-a).forEach(i => {
        if (state.shapes[i]) {
            createBurstEffect(state.shapes[i].position, 15, state.shapes[i].material.color.getHex(), 3, 0.4);
        }
    });

    processRemovals(shapesToRemove, state.shapes);
    processRemovals(projectilesToRemove, state.projectiles);
    processRemovals(dataFragmentsToRemove, state.dataFragments);
    processRemovals(megaDataFragmentsToRemove, state.megaDataFragments);
    processRemovals(repairNodesToRemove, state.repairNodes);
    processRemovals(energyCoresToRemove, state.energyCores);
}