import * as THREE from 'three';
import { state, CONSTANTS } from '../state.js';
import { metaUpgrades, getItemModifier } from '../config/items.js';
import { ui } from '/js/ui/dom.js';

export function createPlayer() {
    const playerGeometry = new THREE.IcosahedronGeometry(CONSTANTS.PLAYER_RADIUS, 1);
    const playerMaterial = new THREE.MeshStandardMaterial({
        color: 0x44AAFF, emissive: 0x2266aa, emissiveIntensity: 0.4,
        roughness: 0.4, metalness: 0.3, flatShading: false
    });
    state.player = new THREE.Mesh(playerGeometry, playerMaterial);
    state.player.position.y = CONSTANTS.PLAYER_HEIGHT / 2;
    state.player.castShadow = true;
    state.scene.add(state.player);
}

/**
 * Updates the player's position based on `state.moveState` and handles aiming.
 * This function now uses a single source of truth for both keyboard and touch input.
 */
export function updatePlayer(deltaTime) {
    if (!state.player) return;

    // --- 1. CALCULATE MOVEMENT DIRECTION FROM UNIVERSAL INPUT STATE ---
    const moveVector = new THREE.Vector3();

    // `state.moveState` is updated by both keyboard (onKeyUp/Down) and touch (handleTouchMove)
    moveVector.z = state.moveState.backward - state.moveState.forward;
    moveVector.x = state.moveState.right - state.moveState.left;

    // --- 2. APPLY MOVEMENT ---
    if (moveVector.lengthSq() > 0) {
        // Normalize to prevent faster diagonal movement and apply speed
        moveVector.normalize().multiplyScalar(state.playerSpeed * deltaTime);
        state.player.position.add(moveVector);
    }

    if (state.socket) {
        state.socket.emit('playerInput', state.moveState);
    }


    // --- 3. AIMING (ROTATION) ---
    // Make the player look towards the aim target.
    // The aimTarget is updated by the `updateAimTarget` function.
    if (state.aimTarget.lengthSq() > 0) {
        // We create a new target on the same Y-plane as the player to prevent them from tilting up or down.
        const lookAtTarget = new THREE.Vector3(state.aimTarget.x, state.player.position.y, state.aimTarget.z);
        state.player.lookAt(lookAtTarget);
    }

    // --- 4. COLLISION & BOUNDARY CHECKS ---
    // Obstacle collision (your existing logic is good)
    state.staticLevelObjects.forEach(obstacle => {
        if (obstacle.userData.isObstacle) {
            const distance = state.player.position.distanceTo(obstacle.position);
            const collisionThreshold = CONSTANTS.PLAYER_RADIUS + (obstacle.userData.obstacleRadius || 0.5);
            if (distance < collisionThreshold) {
                const overlap = collisionThreshold - distance;
                const pushDirection = new THREE.Vector3().subVectors(state.player.position, obstacle.position).setY(0).normalize();
                state.player.position.add(pushDirection.multiplyScalar(overlap));
            }
        }
    });

    // World boundary checks
    const boundary = CONSTANTS.WORLD_BOUNDARY - CONSTANTS.PLAYER_RADIUS;
    state.player.position.x = THREE.MathUtils.clamp(state.player.position.x, -boundary, boundary);
    state.player.position.z = THREE.MathUtils.clamp(state.player.position.z, -boundary, boundary);

    // Ensure player doesn't sink into the ground
    state.player.position.y = CONSTANTS.PLAYER_HEIGHT / 2;

    // Sync persistent weapon meshes
    Object.values(state.persistentWeaponMeshes).forEach(mesh => mesh.position.copy(state.player.position));
}


export function updateAimTarget() {
    if (!state.player) return;

    // --- 1. TWIN-STICK AIMING (PRIORITY 1) ---
    // If the aim touch is active, the aimTarget has already been set by `handleTouchMove`.
    // We don't need to do anything else.
    if (state.aimPointerId !== null) {
        // The aimTarget is being actively controlled by the player's second finger.
        return;
    }

    // --- 2. AUTO-AIMING (PRIORITY 2) ---
    // If no manual aim is active, find the closest enemy within range.
    let closestEnemy = null;
    let minDistanceSq = Infinity;
    const autoAimRangeSq = 40 * 40; // 40 units range

    state.shapes.forEach(shape => {
        if (shape?.userData?.health > 0 && shape.parent) {
            const distanceSq = state.player.position.distanceToSquared(shape.position);
            if (distanceSq < minDistanceSq && distanceSq < autoAimRangeSq) {
                minDistanceSq = distanceSq;
                closestEnemy = shape;
            }
        }
    });

    if (closestEnemy) {
        state.aimTarget.copy(closestEnemy.position);
        return;
    }

    // --- 3. FORWARD AIMING (FALLBACK) ---
    // If no manual aim and no enemies in range, aim in the direction of movement.
    const moveDir = new THREE.Vector3(
        state.moveState.right - state.moveState.left,
        0,
        state.moveState.backward - state.moveState.forward
    );

    if (moveDir.lengthSq() > 0.01) {
        // If moving, aim forward in that direction.
        moveDir.normalize();
    } else {
        // If standing still, aim in the direction the player is already facing.
        state.player.getWorldDirection(moveDir);
        moveDir.y = 0; // Don't aim up or down
        if (moveDir.lengthSq() < 0.01) moveDir.set(0, 0, -1); // Failsafe if direction is zero
        moveDir.normalize();
    }

    // Set the aim target to be a point 15 units in front of the player.
    state.aimTarget.copy(state.player.position).add(moveDir.multiplyScalar(15));
}

// Your recalculatePlayerStats function is fine and does not need changes.
export function recalculatePlayerStats() {
    const speedMod = getItemModifier('MOVE_SPEED');
    state.playerSpeed = state.BASE_PLAYER_SPEED * speedMod.percent + speedMod.flat;

    const radiusMod = getItemModifier('XP_PICKUP_RADIUS');
    state.xpCollectionRadius = state.BASE_XP_COLLECTION_RADIUS * radiusMod.percent + radiusMod.flat;

    let baseRunCritChance = 0.05 + (metaUpgrades.luck.level * metaUpgrades.luck.valuePerLevel);
    const critChanceMod = getItemModifier('CRIT_CHANCE_PERCENT');
    state.playerCritChance = Math.max(0, Math.min(1, baseRunCritChance * critChanceMod.percent + critChanceMod.flat));

    let baseRunCritDamageMultiplier = 1.5;
    const critDamageMod = getItemModifier('CRIT_DAMAGE_MULTIPLIER_PERCENT');
    state.playerCritDamageMultiplier = Math.max(1.0, baseRunCritDamageMultiplier * critDamageMod.percent + critDamageMod.flat);
}