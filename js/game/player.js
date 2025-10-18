import { state, CONSTANTS } from '../state.js';
import { metaUpgrades, getItemModifier } from '../config/items.js';
import { checkEvolution } from './evolution.js';
import { ui } from '/js/ui/dom.js';
import { updateWeaponUI, updateItemUI } from '../ui/manager.js';

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

export function updatePlayer(deltaTime) {
    if (!state.player) return;

    const moveSpeed = state.playerSpeed * deltaTime;
    const moveVector = new THREE.Vector3();

    if (state.joystickActive && state.isTouchDevice) {
        const dx = parseFloat(ui.joystickKnob.style.left) + state.knobRadius - state.joystickRadius;
        const dy = parseFloat(ui.joystickKnob.style.top) + state.knobRadius - state.joystickRadius;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
            const maxKnobTravel = state.joystickRadius - state.knobRadius;
            moveVector.x = dx / maxKnobTravel;
            moveVector.z = dy / maxKnobTravel;
        }
    } else {
        if (state.moveState.forward) moveVector.z -= 1;
        if (state.moveState.backward) moveVector.z += 1;
        if (state.moveState.left) moveVector.x -= 1;
        if (state.moveState.right) moveVector.x += 1;
    }

    if (moveVector.lengthSq() > 0) {
        moveVector.normalize().multiplyScalar(moveSpeed);
        state.player.position.add(moveVector);
    }

    // --- OBSTACLE COLLISION LOGIC (RESTORED) ---
    state.staticLevelObjects.forEach(obstacle => {
        if (obstacle.userData.isObstacle) {
            const distance = state.player.position.distanceTo(obstacle.position);
            const collisionThreshold = CONSTANTS.PLAYER_RADIUS + (obstacle.userData.obstacleRadius || 0.5);

            if (distance < collisionThreshold) {
                const overlap = collisionThreshold - distance;
                const pushDirection = new THREE.Vector3().subVectors(state.player.position, obstacle.position).normalize();
                pushDirection.y = 0; // Ensure push is only horizontal
                state.player.position.add(pushDirection.multiplyScalar(overlap));
            }
        }
    });
    // --- END OF RESTORED LOGIC ---

    // World boundary checks
    state.player.position.x = Math.max(-CONSTANTS.WORLD_BOUNDARY + CONSTANTS.PLAYER_RADIUS, Math.min(CONSTANTS.WORLD_BOUNDARY - CONSTANTS.PLAYER_RADIUS, state.player.position.x));
    state.player.position.z = Math.max(-CONSTANTS.WORLD_BOUNDARY + CONSTANTS.PLAYER_RADIUS, Math.min(CONSTANTS.WORLD_BOUNDARY - CONSTANTS.PLAYER_RADIUS, state.player.position.z));
    state.player.position.y = CONSTANTS.PLAYER_HEIGHT / 2;

    // Keep persistent weapon meshes synced
    Object.values(state.persistentWeaponMeshes).forEach(mesh => mesh.position.copy(state.player.position));
}

export function updateAimTarget() {
    if (!state.player) return;

    let closestEnemy = null;
    let minDistanceSq = Infinity;
    const autoAimRangeSq = 40 * 40;

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
    } else {
        const moveDir = new THREE.Vector3();
        if (state.moveState.forward) moveDir.z -= 1;
        if (state.moveState.backward) moveDir.z += 1;
        if (state.moveState.left) moveDir.x -= 1;
        if (state.moveState.right) moveDir.x += 1;

        if (moveDir.lengthSq() > 0.01) {
            moveDir.normalize();
        } else {
            state.player.getWorldDirection(moveDir);
            moveDir.y = 0;
            if (moveDir.lengthSq() < 0.01) moveDir.set(0, 0, -1);
            moveDir.normalize();
        }
        state.aimTarget.copy(state.player.position).add(moveDir.multiplyScalar(15));
    }
}

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