import * as THREE from 'three';
import { state, CONSTANTS } from '../state.js';
import { metaUpgrades, getItemModifier } from '../config/items.js';
import { ui } from '/js/ui/dom.js';

export function createPlayer() {
    // 1. Load the Vampire Survivors inspired texture
    const textureLoader = new THREE.TextureLoader();
    const playerTexture = textureLoader.load('assets/player_skin_vs.png');

    // Use sRGB for high definition colors
    playerTexture.colorSpace = THREE.SRGBColorSpace;

    // Sharp pixel art look
    playerTexture.magFilter = THREE.NearestFilter;
    playerTexture.minFilter = THREE.NearestFilter;
    playerTexture.wrapS = THREE.RepeatWrapping; // Required for mirroring texture offset

    // 2. Create the Sprite Material
    const spriteMaterial = new THREE.SpriteMaterial({
        map: playerTexture,
        transparent: true,
        color: 0xffffff
    });

    // 3. Create the Sprite
    const playerSprite = new THREE.Sprite(spriteMaterial);

    // Scale the sprite to feel proportional (1.5x1.5 is small but visible)
    playerSprite.scale.set(2.95, 2.95, 1);

    // Baseline Y position to ensure feet stay above ground during bobbing
    // Reduced for smaller player
    playerSprite.position.y = 1.55;

    state.player = playerSprite;
    state.scene.add(state.player);

    // Add a simple shadow blob under the 2D sprite for better grounding
    const shadowGeom = new THREE.CircleGeometry(0.25, 16);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -1.52; // Anchored slightly below the sprite's bottom
    playerSprite.add(shadowMesh);
}

/**
 * Updates the player's position based on `state.moveState` and handles aiming.
 */
export function updatePlayer(deltaTime) {
    if (!state.player) return;

    // --- 1. CALCULATE MOVEMENT DIRECTION FROM UNIVERSAL INPUT STATE ---
    const moveVector = new THREE.Vector3();
    moveVector.z = state.moveState.backward - state.moveState.forward;
    moveVector.x = state.moveState.right - state.moveState.left;

    // --- 2. APPLY MOVEMENT ---
    if (moveVector.lengthSq() > 0) {
        moveVector.normalize().multiplyScalar(state.playerSpeed * deltaTime);
        state.player.position.add(moveVector);

        // Flip sprite texture based on horizontal movement
        if (state.player.material.map) {
            if (moveVector.x > 0.01) {
                state.player.material.map.repeat.x = 1;
                state.player.material.map.offset.x = 0;
            } else if (moveVector.x < -0.01) {
                state.player.material.map.repeat.x = -1;
                state.player.material.map.offset.x = 1;
            }
        }
    }

    // --- 3. AIMING (The sprite is billboarded, but keep the logic for weapons) ---
    if (state.aimTarget.lengthSq() > 0) {
        const lookAtTarget = new THREE.Vector3(state.aimTarget.x, state.player.position.y, state.aimTarget.z);
        // Weapons sync to this
    }

    // --- 4. COLLISION & BOUNDARY CHECKS ---
    // Precise 2D Rectangle vs Circle Collision for Skyscraper obstacles
    state.staticLevelObjects.forEach(obstacle => {
        if (obstacle.userData.isObstacle) {
            const halfW = obstacle.userData.width / 2;
            const halfD = obstacle.userData.depth / 2;

            // Vector from building center to player (ignoring Y)
            const dx = state.player.position.x - obstacle.position.x;
            const dz = state.player.position.z - obstacle.position.z;

            // Find closest point on building rectangle to player circle
            const closestX = Math.max(-halfW, Math.min(halfW, dx));
            const closestZ = Math.max(-halfD, Math.min(halfD, dz));

            // Distance from closest point to player center
            const distX = dx - closestX;
            const distZ = dz - closestZ;
            const distanceSq = (distX * distX) + (distZ * distZ);

            if (distanceSq < CONSTANTS.PLAYER_RADIUS * CONSTANTS.PLAYER_RADIUS) {
                const distance = Math.sqrt(distanceSq);
                const overlap = CONSTANTS.PLAYER_RADIUS - distance;

                // Push out along collision normal
                if (distance > 0.0001) {
                    state.player.position.x += (distX / distance) * overlap;
                    state.player.position.z += (distZ / distance) * overlap;
                } else {
                    state.player.position.x += overlap;
                }
            }
        }
    });

    // World boundary checks
    const boundary = CONSTANTS.WORLD_BOUNDARY - CONSTANTS.PLAYER_RADIUS;
    state.player.position.x = THREE.MathUtils.clamp(state.player.position.x, -boundary, boundary);
    state.player.position.z = THREE.MathUtils.clamp(state.player.position.z, -boundary, boundary);

    // --- SUBTLE ANIMATION & GROUND CLIPPING FIX ---
    // Baseline is 1.55. Sine wave adds ±0.04.
    state.player.position.y = 1.55 + Math.sin(state.gameTime * 2.5) * 0.04;

    // Very subtle Z-tilt (wobble)
    state.player.rotation.z = Math.sin(state.gameTime * 2.0) * 0.02;

    // Sync persistent weapon meshes
    Object.values(state.persistentWeaponMeshes).forEach(mesh => mesh.position.copy(state.player.position));
}

export function updateAimTarget() {
    if (!state.player) return;

    if (state.aimPointerId !== null) return;

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
        return;
    }

    const moveDir = new THREE.Vector3(
        state.moveState.right - state.moveState.left,
        0,
        state.moveState.backward - state.moveState.forward
    );

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