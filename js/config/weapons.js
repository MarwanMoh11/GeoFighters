import { state, CONSTANTS } from '../state.js';
import { createHitEffect, createTemporaryVisualEffect, createBurstEffect } from '../game/spawner.js';
import { getItemModifier } from './items.js';
import * as THREE from 'three';

function findNearestEnemy(sourcePosition, maxRange = 50) { // Increased default range
    const nearbyObjects = state.spatialGrid.getObjectsNear(sourcePosition, maxRange);
    let closestEnemy = null;
    let minDistanceSq = Infinity;

    for (const gridObject of nearbyObjects) {
        if (gridObject.enemy) {
            const enemyData = gridObject.enemy;
            const distanceSq = sourcePosition.distanceToSquared(enemyData.position);

            if (distanceSq < minDistanceSq && distanceSq < maxRange * maxRange) {
                minDistanceSq = distanceSq;
                closestEnemy = enemyData;
            }
        }
    }
    return closestEnemy;
}

// DELETE your old fireGenericProjectile function and REPLACE it with this one.

function fireGenericProjectile(weapon, options = {}) {
    if (!state.player) return;
    const projSpeedMod = getItemModifier('PROJECTILE_SPEED_PERCENT');
    const globalDmgMod = getItemModifier('GLOBAL_DAMAGE_PERCENT');
    const heavyDmgMod = getItemModifier('HEAVY_DAMAGE_PERCENT');
    const singleShotDmgMod = getItemModifier('SINGLE_SHOT_DAMAGE_PERCENT');
    const scatterCountMod = getItemModifier('SCATTER_COUNT');

    const speed = (options.speed || CONSTANTS.BASE_PROJECTILE_SPEED) * projSpeedMod.percent;
    let damage = weapon.getDamage?.() || options.damage || 10;
    damage *= globalDmgMod.percent;
    if (weapon.tags?.includes('heavy')) damage *= heavyDmgMod.percent;
    if (weapon.tags?.includes('single_shot')) damage *= singleShotDmgMod.percent;

    let count = weapon.getProjectileCount?.() || options.count || 1;
    if (weapon.tags?.includes('scatter')) count += scatterCountMod.count;

    const projectileRadius = CONSTANTS.PROJECTILE_RADIUS;
    const spread = options.spread || 0;

    // --- GLOBAL AUTO-AIM LOGIC ---
    let baseDir;
    // 1. Check if a direction is manually provided (rare, but good for flexibility).
    if (options.direction) {
        baseDir = options.direction;
    } else {
        // 2. Try to find the nearest enemy to auto-aim at.
        const target = findNearestEnemy(state.player.position, 50); // Search up to 50 units away
        if (target) {
            // If a target is found, aim directly at it.
            baseDir = new THREE.Vector3().subVectors(target.position, state.player.position).normalize();
        } else {
            // 3. If NO target is in range, fallback to aiming at the mouse cursor.
            baseDir = new THREE.Vector3().subVectors(state.aimTarget, state.player.position).normalize();
        }
    }
    baseDir.y = 0; // Ensure all projectiles fire horizontally.
    // --- END OF AUTO-AIM LOGIC ---

    if (state.socket) {
        for (let i = 0; i < count; i++) {
            const currentAngle = (count === 1) ? 0 : (-spread / 2) + (i / (count - 1)) * spread;
            const finalDirection = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), currentAngle);

            // Tell the server to fire a projectile with this specific direction.
            state.socket.emit('shoot', { dx: finalDirection.x, dz: finalDirection.z });
        }
    }

    for (let i = 0; i < count; i++) {
        const currentAngle = (count === 1) ? 0 : (-spread / 2) + (i / (count - 1)) * spread;
        const velocity = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), currentAngle).normalize().multiplyScalar(speed);

        const projectileGeometry = options.geometry || new THREE.SphereGeometry(projectileRadius, 6, 6);
        let projectileMaterial = options.material;
        if (!projectileMaterial) {
            if (options.emissiveColor) {
                projectileMaterial = new THREE.MeshStandardMaterial({
                    color: options.color || 0xffffff,
                    emissive: options.emissiveColor,
                    emissiveIntensity: options.emissiveIntensity || 0.5
                });
            } else {
                projectileMaterial = new THREE.MeshBasicMaterial({ color: options.color || 0xffffff });
            }
        }

        const projectileMesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
        const startOffset = velocity.clone().normalize().multiplyScalar(CONSTANTS.PLAYER_RADIUS + projectileRadius + 0.1);
        projectileMesh.position.copy(state.player.position).add(startOffset);
        projectileMesh.position.y = CONSTANTS.PLAYER_HEIGHT * 0.25;

        const projectileData = {
            mesh: projectileMesh,
            velocity: velocity,
            damage: damage,
            weaponId: weapon.id,
            onHit: options.onHit,
            duration: options.duration,
            tags: weapon.tags,
            hitEnemies: new Set()
        };
        state.projectiles.push(projectileData);
        state.scene.add(projectileData.mesh);
    }
}

export const WEAPONS = {
    POLY_BURST: {
        id: 'POLY_BURST', name: 'Poly Burst', icon: '⬣', level: 0, maxLevel: 5, synergyItemId: 'KINETIC_ACCELERATOR', tags: ['aoe'], shortDescription: "Fires geometric shards radially.", baseFireRate: 0.7, baseDamage: 7, baseProjectileCount: 6, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; this.fireRadialShards(this); } },
        fireRadialShards: function (weapon) {
            const count = weapon.getProjectileCount();
            const damage = weapon.getDamage();
            const shardGeometry = new THREE.TetrahedronGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.5, 0);
            const shardMaterial = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.6 });
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const velocity = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize().multiplyScalar(CONSTANTS.BASE_PROJECTILE_SPEED * 0.9);
                const projectileMesh = new THREE.Mesh(shardGeometry, shardMaterial);
                const startOffset = velocity.clone().normalize().multiplyScalar(CONSTANTS.PLAYER_RADIUS + CONSTANTS.PROJECTILE_RADIUS + 0.1);
                projectileMesh.position.copy(state.player.position).add(startOffset);
                projectileMesh.position.y = state.player.position.y;
                state.projectiles.push({ mesh: projectileMesh, velocity: velocity, damage: damage, weaponId: weapon.id, tags: weapon.tags, hitEnemies: new Set() });
                state.scene.add(projectileMesh);
            }
        },
        getFireRate: function () { return this.baseFireRate * Math.pow(0.9, this.level - 1); }, getDamage: function () { return this.baseDamage + (this.level - 1) * 2; }, getProjectileCount: function () { return this.baseProjectileCount + Math.floor((this.level - 1) * 0.5) * 2; }
    },
    VECTOR_LANCE: {
        id: 'VECTOR_LANCE', name: 'Vector Lance', icon: '➤', level: 0, maxLevel: 5, synergyItemId: 'PROJECTILE_BOOSTER', tags: ['single_shot', 'piercing'], shortDescription: "Fires sharp, piercing vector lines forward.", baseFireRate: 0.4, baseDamage: 12, baseProjectileCount: 1, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; fireGenericProjectile(this, { count: this.getProjectileCount(), damage: this.getDamage(), color: 0xff8800, emissiveColor: 0xffaa00, emissiveIntensity: 0.4, geometry: new THREE.CylinderGeometry(CONSTANTS.PROJECTILE_RADIUS * 0.2, CONSTANTS.PROJECTILE_RADIUS * 0.2, CONSTANTS.PROJECTILE_RADIUS * 6, 4), spread: Math.PI / 18 * (this.getProjectileCount() - 1), tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate * Math.pow(0.92, this.level - 1); }, getDamage: function () { return this.baseDamage + (this.level - 1) * 4; }, getProjectileCount: function () { return this.baseProjectileCount + Math.floor((this.level - 1) / 2); }
    },
    ORBITAL_SHIELD: {
        id: 'ORBITAL_SHIELD', name: 'Orbital Shield', icon: '⟳', level: 0, maxLevel: 5, synergyItemId: 'ORBITAL_ENHANCER', tags: ['aoe', 'orbital'], shortDescription: "Spinning geometric shapes damage nearby enemies.", baseDamage: 5, baseRadius: CONSTANTS.PLAYER_RADIUS + 1.2, baseRotationSpeed: Math.PI * 0.6, baseShapeCount: 3, damageInterval: 0.25, damageTimer: 0, enemiesHitThisInterval: [], isEvolved: false,
        fire: function (deltaTime) {
            this.damageTimer += deltaTime;
            if (this.damageTimer >= this.damageInterval) {
                this.damageTimer = 0;
                // --- THE FIX ---
                // Instead of creating a new array, just reset the length of the existing one.
                this.enemiesHitThisInterval.length = 0;
            }
        }, getRadius: function () { const aoeMod = getItemModifier('AOE_RADIUS_PERCENT'); return (this.baseRadius + (this.level - 1) * 0.25) * aoeMod.percent; },
        getDamage: function () { const orbitalMod = getItemModifier('ORBITAL_EFFECT_PERCENT'); const globalDmgMod = getItemModifier('GLOBAL_DAMAGE_PERCENT'); return (this.baseDamage + (this.level - 1) * 2.5) * orbitalMod.percent * globalDmgMod.percent; },
        getRotationSpeed: function () { return this.baseRotationSpeed + (this.level - 1) * Math.PI * 0.1; },
        getShapeCount: function () { const orbitalMod = getItemModifier('ORBITAL_EFFECT_PERCENT'); return Math.floor((this.baseShapeCount + Math.floor((this.level - 1) / 2)) * orbitalMod.percent); },
        createMesh: function (weapon) { const meshId = weapon.id; if (state.persistentWeaponMeshes[meshId]) state.scene.remove(state.persistentWeaponMeshes[meshId]); const group = new THREE.Group(); const radius = weapon.getRadius(); const count = weapon.getShapeCount(); const shapeGeometry = new THREE.OctahedronGeometry(0.3, 0); const shapeMaterial = new THREE.MeshBasicMaterial({ color: 0xaaaaff, wireframe: true }); for (let i = 0; i < count; i++) { const angle = (i / count) * Math.PI * 2; const mesh = new THREE.Mesh(shapeGeometry, shapeMaterial); mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius); group.add(mesh); } group.position.copy(state.player.position); state.persistentWeaponMeshes[meshId] = group; state.scene.add(group); },
        updateMesh: function (weapon) { weapon.createMesh(weapon); },
        updateWeaponSystem: function (weapon, deltaTime) { const group = state.persistentWeaponMeshes[weapon.id]; if (!group) return; group.position.copy(state.player.position); group.rotation.y += weapon.getRotationSpeed() * deltaTime; if (weapon.damageTimer === 0) { const auraRadius = weapon.getRadius(); const damage = weapon.getDamage(); state.shapes.forEach((shape, sIndex) => { if (!weapon.enemiesHitThisInterval.includes(sIndex)) { const distance = state.player.position.distanceTo(shape.position); if (distance < auraRadius + (shape.radius || 0.5)) { shape.health -= damage; createHitEffect(shape, 0xaaaaff, 0.1); weapon.enemiesHitThisInterval.push(sIndex); } } }); } }
    },
    PRISM_RAY: {
        id: 'PRISM_RAY', name: 'Prism Ray', icon: '💎', level: 0, maxLevel: 5, synergyItemId: null, tags: ['single_shot'], shortDescription: "Fires focused light.", baseFireRate: 0.8, baseDamage: 14, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; fireGenericProjectile(this, { color: 0xFFFFAA, emissiveColor: 0xFFFFCC, emissiveIntensity: 0.5, damage: this.getDamage(), geometry: new THREE.CylinderGeometry(CONSTANTS.PROJECTILE_RADIUS * 0.3, CONSTANTS.PROJECTILE_RADIUS * 0.3, CONSTANTS.PROJECTILE_RADIUS * 5, 6), speed: CONSTANTS.BASE_PROJECTILE_SPEED * 1.1, tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate * Math.pow(0.9, this.level - 1); }, getDamage: function () { return this.baseDamage + (this.level - 1) * 3.5; }
    },
    ENERGY_SIPHON: {
        id: 'ENERGY_SIPHON', name: 'Energy Siphon', icon: '⚡', level: 0, maxLevel: 5, synergyItemId: null, tags: [], shortDescription: "Rapid fire bolts. Restores shield on enemy defeat.", baseFireRate: 0.15, baseDamage: 6, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; fireGenericProjectile(this, { color: 0xff4444, emissiveColor: 0xff6666, emissiveIntensity: 0.3, damage: this.getDamage(), geometry: new THREE.SphereGeometry(CONSTANTS.PROJECTILE_RADIUS * 0.8, 4, 4), tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate * Math.pow(0.95, this.level - 1); }, getDamage: function () { return this.baseDamage + (this.level - 1) * 1.5; }, getShieldRestore: function () { return 1 + Math.floor((this.level - 1) / 2); }
    },
    CUBE_CANNON: {
        id: 'CUBE_CANNON', name: 'Cube Cannon', icon: '🧊', level: 0, maxLevel: 5, synergyItemId: 'HEAVY_CALIBRATOR', tags: ['heavy', 'aoe_on_evolve'], shortDescription: "Launches slow but powerful cubes.", baseFireRate: 1.6, baseDamage: 45, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; fireGenericProjectile(this, { material: new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.6, metalness: 0.2 }), damage: this.getDamage(), geometry: new THREE.BoxGeometry(CONSTANTS.PROJECTILE_RADIUS * 2.5, CONSTANTS.PROJECTILE_RADIUS * 2.5, CONSTANTS.PROJECTILE_RADIUS * 2.5), speed: CONSTANTS.BASE_PROJECTILE_SPEED * 0.8, tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate * Math.pow(0.9, this.level - 1); }, getDamage: function () { return this.baseDamage + (this.level - 1) * 14; }
    },
    SHARD_SCATTER: {
        id: 'SHARD_SCATTER', name: 'Shard Scatter', icon: '✨', level: 0, maxLevel: 5, synergyItemId: 'SCATTER_MODULE', tags: ['scatter'], shortDescription: "Fires a wide spread of sharp shards.", baseFireRate: 1.0, baseDamage: 9, baseProjectileCount: 8, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; fireGenericProjectile(this, { count: this.getProjectileCount(), damage: this.getDamage(), color: 0xFFFFDD, emissiveColor: 0xFFFFFF, emissiveIntensity: 0.2, geometry: new THREE.ConeGeometry(CONSTANTS.PROJECTILE_RADIUS * 0.5, CONSTANTS.PROJECTILE_RADIUS * 3, 4), spread: Math.PI / 4.5, speed: CONSTANTS.BASE_PROJECTILE_SPEED * 0.9, tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate * Math.pow(0.9, this.level - 1); }, getDamage: function () { return this.baseDamage + (this.level - 1) * 2; }, getProjectileCount: function () { return this.baseProjectileCount + (this.level - 1); }
    },
    VERTEX_VOLLEY: {
        id: 'VERTEX_VOLLEY', name: 'Vertex Volley', icon: '▲', level: 0, maxLevel: 5, synergyItemId: null, tags: ['single_shot'], shortDescription: "Fires precise, high-damage vertices.", baseFireRate: 0.7, baseDamage: 22, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; fireGenericProjectile(this, { color: 0xC0C0C0, emissiveColor: 0xE0E0E0, emissiveIntensity: 0.3, damage: this.getDamage(), geometry: new THREE.TetrahedronGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.2, 0), speed: CONSTANTS.BASE_PROJECTILE_SPEED * 1.2, tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate * Math.pow(0.93, this.level - 1); }, getDamage: function () { return this.baseDamage + (this.level - 1) * 5.5; }
    },
    GEOMETRIC_FLUX: {
        id: 'GEOMETRIC_FLUX', name: 'Geometric Flux', icon: '~', level: 0, maxLevel: 5, synergyItemId: 'DURATION_COIL', tags: ['duration'], shortDescription: "Continuous stream of shifting shapes.", baseFireRate: 0.05, baseDamage: 1.5, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; const geometries = [new THREE.TetrahedronGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.5, 0), new THREE.BoxGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.5, CONSTANTS.PROJECTILE_RADIUS * 1.5, CONSTANTS.PROJECTILE_RADIUS * 1.5), new THREE.OctahedronGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.5, 0)]; const fluxGeometry = geometries[Math.floor(Math.random() * geometries.length)]; const durationMod = getItemModifier('DURATION_PERCENT'); fireGenericProjectile(this, { material: new THREE.MeshBasicMaterial({ color: 0x50C878, wireframe: true }), damage: this.getDamage(), speed: CONSTANTS.BASE_PROJECTILE_SPEED * 0.6, spread: Math.PI / 9, duration: (0.65 * durationMod.percent), geometry: fluxGeometry, onHit: (target) => { createHitEffect(target, 0x50C878, 0.3); }, tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate; }, getDamage: function () { return this.baseDamage + Math.floor((this.level - 1) / 2.5); }
    },
    REPULSOR_WAVE: {
        id: 'REPULSOR_WAVE', name: 'Repulsor Wave', icon: '〰️', level: 0, maxLevel: 5, synergyItemId: 'KINETIC_AMPLIFIER', tags: ['aoe', 'pulse'], shortDescription: "Short-range geometric energy blast.", baseFireRate: 0.6, baseDamage: 18, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; const aoeMod = getItemModifier('AOE_RADIUS_PERCENT'); const pulseMod = getItemModifier('PULSE_EFFECT_PERCENT'); const blastRadius = (1.6 + (this.level - 1) * 0.18) * aoeMod.percent * pulseMod.percent; const damage = this.getDamage() * pulseMod.percent; const blastColor = 0x00FFFF; state.shapes.forEach(shape => { const distance = state.player.position.distanceTo(shape.position); if (distance < blastRadius + (shape.radius || 0.5)) { shape.health -= damage; createHitEffect(shape, blastColor, 0.15); } }); createTemporaryVisualEffect(state.player.position, blastRadius, blastColor, 0.15, true); } },
        getFireRate: function () { return this.baseFireRate * Math.pow(0.9, this.level - 1); }, getDamage: function () { return this.baseDamage + (this.level - 1) * 4.5; }
    },
    AXIS_BOLTER: {
        id: 'AXIS_BOLTER', name: 'Axis Bolter', icon: '+', level: 0, maxLevel: 5, synergyItemId: 'FOCUS_LENS', tags: ['single_shot'], shortDescription: "Fires fast, high-damage bolts along axes.", baseFireRate: 1.2, baseDamage: 35, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; fireGenericProjectile(this, { color: 0xFFF8DC, emissiveColor: 0xFFFACD, emissiveIntensity: 0.6, damage: this.getDamage(), geometry: new THREE.CylinderGeometry(CONSTANTS.PROJECTILE_RADIUS * 0.3, CONSTANTS.PROJECTILE_RADIUS * 0.3, CONSTANTS.PROJECTILE_RADIUS * 6, 4), speed: CONSTANTS.BASE_PROJECTILE_SPEED * 1.8, tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate * Math.pow(0.9, this.level - 1); }, getDamage: function () { return this.baseDamage + (this.level - 1) * 9; }
    },
    SONIC_PRISM: {
        id: 'SONIC_PRISM', name: 'Sonic Prism', icon: '🎶', level: 0, maxLevel: 5, synergyItemId: null, tags: ['aoe', 'pulse'], shortDescription: "Damages enemies in an area with resonant energy.", baseFireRate: 1.1, baseDamage: 9, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; const aoeMod = getItemModifier('AOE_RADIUS_PERCENT'); const pulseMod = getItemModifier('PULSE_EFFECT_PERCENT'); const blastRadius = (3.2 + (this.level - 1) * 0.33) * aoeMod.percent * pulseMod.percent; const damage = this.getDamage() * pulseMod.percent; const blastColor = 0xADD8E6; state.shapes.forEach(shape => { const distance = state.player.position.distanceTo(shape.position); if (distance < blastRadius + (shape.radius || 0.5)) { shape.health -= damage; createHitEffect(shape, blastColor, 0.2); } }); createTemporaryVisualEffect(state.player.position, blastRadius, blastColor, 0.25, true, new THREE.IcosahedronGeometry(1, 0)); } },
        getFireRate: function () { return this.baseFireRate * Math.pow(0.92, this.level - 1); }, getDamage: function () { return this.baseDamage + (this.level - 1) * 2.5; }
    },
    SINGULARITY_LAUNCHER: {
        id: 'SINGULARITY_LAUNCHER', name: 'Singularity Launcher', icon: '⚫', level: 0, maxLevel: 5, synergyItemId: null, tags: ['heavy'], shortDescription: "Launches slow, massive damage singularities.", baseFireRate: 2.5, baseDamage: 90, fireTimer: 0, isEvolved: false,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; fireGenericProjectile(this, { material: new THREE.MeshBasicMaterial({ color: 0x111111 }), damage: this.getDamage(), geometry: new THREE.SphereGeometry(CONSTANTS.PROJECTILE_RADIUS * 2.0, 12, 10), speed: CONSTANTS.BASE_PROJECTILE_SPEED * 0.5, tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate * Math.pow(0.95, this.level - 1); }, getDamage: function () { return this.baseDamage + (this.level - 1) * 28; }
    }
};

export const EVOLVED_WEAPONS = {
    POLY_BURST: {
        id: 'POLY_BURST_EVOLVED', name: 'Nova Burst', icon: '💥', isEvolved: true, level: 1, maxLevel: 1, tags: ['aoe', 'evolved'],
        shortDescription: "Massive radial burst of high-energy shards.",
        baseFireRate: 0.45, baseDamage: 18, baseProjectileCount: 24, fireTimer: 0,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; this.fireRadialShards(this); } },
        fireRadialShards: function (weapon) {
            const count = weapon.getProjectileCount();
            const damage = weapon.getDamage();
            const shardGeometry = new THREE.IcosahedronGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.8, 0);
            const shardMaterial = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x88ffff, emissiveIntensity: 0.8 });
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const velocity = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).normalize().multiplyScalar(CONSTANTS.BASE_PROJECTILE_SPEED * 1.1);
                const projectileMesh = new THREE.Mesh(shardGeometry, shardMaterial);
                const startOffset = velocity.clone().normalize().multiplyScalar(CONSTANTS.PLAYER_RADIUS + CONSTANTS.PROJECTILE_RADIUS + 0.1);
                projectileMesh.position.copy(state.player.position).add(startOffset);
                projectileMesh.position.y = state.player.position.y;
                state.projectiles.push({ mesh: projectileMesh, velocity: velocity, damage: damage, weaponId: weapon.id, tags: weapon.tags, hitEnemies: new Set() });
                state.scene.add(projectileMesh);
            }
        },
        getFireRate: function () { return this.baseFireRate; }, getDamage: function () { return this.baseDamage; }, getProjectileCount: function () { return this.baseProjectileCount; }
    },
    VECTOR_LANCE: {
        id: 'VECTOR_LANCE_EVOLVED', name: 'Hyper Lance', icon: '➤➤', isEvolved: true, level: 1, maxLevel: 1, tags: ['single_shot', 'evolved', 'piercing'],
        shortDescription: "Fires piercing hyper-velocity lances.",
        baseFireRate: 0.25, baseDamage: 35, baseProjectileCount: 3, fireTimer: 0,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; fireGenericProjectile(this, { count: this.baseProjectileCount, damage: this.getDamage(), color: 0xffaa00, emissiveColor: 0xffcc33, emissiveIntensity: 0.7, geometry: new THREE.CylinderGeometry(CONSTANTS.PROJECTILE_RADIUS * 0.3, CONSTANTS.PROJECTILE_RADIUS * 0.3, CONSTANTS.PROJECTILE_RADIUS * 8, 4), spread: Math.PI / 30, speed: CONSTANTS.BASE_PROJECTILE_SPEED * 1.6, tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate; }, getDamage: function () { return this.baseDamage; }, getProjectileCount: function () { return this.baseProjectileCount; }
    },
    ORBITAL_SHIELD: {
        id: 'ORBITAL_SHIELD_EVOLVED', name: 'Vortex Shield', icon: '🌀', isEvolved: true, level: 1, maxLevel: 1, tags: ['aoe', 'orbital', 'evolved'],
        shortDescription: "Rapidly spinning vortex damages and pulls enemies.",
        baseDamage: 15, baseRadius: CONSTANTS.PLAYER_RADIUS + 2.2, baseRotationSpeed: Math.PI * 1.6, baseShapeCount: 7, damageInterval: 0.18, damageTimer: 0, enemiesHitThisInterval: [],
        fire: function (deltaTime) {
            this.damageTimer += deltaTime;
            if (this.damageTimer >= this.damageInterval) {
                this.damageTimer = 0;
                // --- THE FIX ---
                // Instead of creating a new array, just reset the length of the existing one.
                this.enemiesHitThisInterval.length = 0;
            }
        },getRadius: function () { const aoeMod = getItemModifier('AOE_RADIUS_PERCENT'); return this.baseRadius * aoeMod.percent; },
        getDamage: function () { const orbitalMod = getItemModifier('ORBITAL_EFFECT_PERCENT'); const globalDmgMod = getItemModifier('GLOBAL_DAMAGE_PERCENT'); return this.baseDamage * orbitalMod.percent * globalDmgMod.percent; },
        getRotationSpeed: function () { return this.baseRotationSpeed; },
        getShapeCount: function () { const orbitalMod = getItemModifier('ORBITAL_EFFECT_PERCENT'); return Math.floor(this.baseShapeCount * orbitalMod.percent); },
        createMesh: function (weapon) { const meshId = weapon.id; if (state.persistentWeaponMeshes[meshId]) state.scene.remove(state.persistentWeaponMeshes[meshId]); const group = new THREE.Group(); const radius = weapon.getRadius(); const count = weapon.getShapeCount(); const shapeGeometry = new THREE.TorusGeometry(0.35, 0.09, 8, 16); const shapeMaterial = new THREE.MeshBasicMaterial({ color: 0xccccff, wireframe: true }); for (let i = 0; i < count; i++) { const angle = (i / count) * Math.PI * 2; const mesh = new THREE.Mesh(shapeGeometry, shapeMaterial); mesh.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius); mesh.rotation.x = Math.PI / 2; group.add(mesh); } group.position.copy(state.player.position); state.persistentWeaponMeshes[meshId] = group; state.scene.add(group); },
        updateMesh: function (weapon) { weapon.createMesh(weapon); },
        updateWeaponSystem: function (weapon, deltaTime) { const group = state.persistentWeaponMeshes[weapon.id]; if (!group) return; group.position.copy(state.player.position); group.rotation.y += weapon.getRotationSpeed() * deltaTime; const auraRadius = weapon.getRadius(); const damage = weapon.getDamage(); state.shapes.forEach((shape, sIndex) => { const distance = state.player.position.distanceTo(shape.position); if (distance < auraRadius + (shape.radius || 0.5)) { if (weapon.damageTimer === 0 && !weapon.enemiesHitThisInterval.includes(sIndex)) { shape.health -= damage; createHitEffect(shape, 0xccccff, 0.1); weapon.enemiesHitThisInterval.push(sIndex); } const pullDir = new THREE.Vector3().subVectors(state.player.position, shape.position).normalize(); shape.position.add(pullDir.multiplyScalar(deltaTime * 2.0 * Math.max(0.1, (auraRadius - distance) / auraRadius))); } }); }
    },
    CUBE_CANNON: {
        id: 'CUBE_CANNON_EVOLVED', name: 'MegaCube Launcher', icon: '🧱', isEvolved: true, level: 1, maxLevel: 1, tags: ['heavy', 'aoe', 'evolved'],
        shortDescription: "Launches huge cubes that explode on impact.",
        baseFireRate: 1.8, baseDamage: 180, fireTimer: 0, explosionRadius: 3.0,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; const cubeGeom = new THREE.BoxGeometry(CONSTANTS.PROJECTILE_RADIUS * 4.5, CONSTANTS.PROJECTILE_RADIUS * 4.5, CONSTANTS.PROJECTILE_RADIUS * 4.5); const cubeMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.5, metalness: 0.3 }); fireGenericProjectile(this, { damage: this.getDamage(), geometry: cubeGeom, material: cubeMat, speed: CONSTANTS.BASE_PROJECTILE_SPEED * 0.6, tags: this.tags, onHit: (target, projectileData) => { createBurstEffect(target.position, 40, 0xFFA500, 6, 0.5); const explosionRadius = EVOLVED_WEAPONS.CUBE_CANNON.explosionRadius * getItemModifier('AOE_RADIUS_PERCENT').percent; state.shapes.forEach(s => { if (s !== target && s.position.distanceTo(target.position) < explosionRadius + (s.radius || 0.5)) { s.userData.health -= projectileData.damage * 0.7; createHitEffect(s, 0xFFA500, 0.2); } }); } }); } },
        getFireRate: function () { return this.baseFireRate; }, getDamage: function () { return this.baseDamage; }
    },
    SHARD_SCATTER: {
        id: 'SHARD_SCATTER_EVOLVED', name: 'Crystal Storm', icon: '❄️', isEvolved: true, level: 1, maxLevel: 1, tags: ['scatter', 'evolved'],
        shortDescription: "Unleashes a blinding storm of crystal shards.",
        baseFireRate: 0.7, baseDamage: 14, baseProjectileCount: 25, fireTimer: 0,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; fireGenericProjectile(this, { count: this.getProjectileCount(), damage: this.getDamage(), color: 0xE0FFFF, emissiveColor: 0xFFFFFF, emissiveIntensity: 0.5, geometry: new THREE.OctahedronGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.2, 0), spread: Math.PI / 3.5, speed: CONSTANTS.BASE_PROJECTILE_SPEED, tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate; }, getDamage: function () { return this.baseDamage; }, getProjectileCount: function () { return this.baseProjectileCount; }
    },
    GEOMETRIC_FLUX: {
        id: 'GEOMETRIC_FLUX_EVOLVED', name: 'Chaos Flux', icon: '☣️', isEvolved: true, level: 1, maxLevel: 1, tags: ['duration', 'aoe', 'evolved'],
        shortDescription: "Spews a wide torrent of unstable chaotic shapes.",
        baseFireRate: 0.035, baseDamage: 5, baseDuration: 1.2, fireTimer: 0,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; const geometries = [new THREE.TetrahedronGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.8, 0), new THREE.BoxGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.8, CONSTANTS.PROJECTILE_RADIUS * 1.8, CONSTANTS.PROJECTILE_RADIUS * 1.8), new THREE.OctahedronGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.8, 0), new THREE.DodecahedronGeometry(CONSTANTS.PROJECTILE_RADIUS * 1.8, 0)]; const fluxGeometry = geometries[Math.floor(Math.random() * geometries.length)]; const durationMod = getItemModifier('DURATION_PERCENT'); const fluxColor = new THREE.Color().setHSL(Math.random(), 0.7, 0.6); fireGenericProjectile(this, { material: new THREE.MeshBasicMaterial({ color: fluxColor, wireframe: true }), damage: this.getDamage(), speed: CONSTANTS.BASE_PROJECTILE_SPEED * 0.7, spread: Math.PI / 5, duration: (this.baseDuration * durationMod.percent), geometry: fluxGeometry, onHit: (target) => { createHitEffect(target, fluxColor.getHex(), 0.3); }, tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate; }, getDamage: function () { return this.baseDamage; }
    },
    REPULSOR_WAVE: {
        id: 'REPULSOR_WAVE_EVOLVED', name: 'Shockwave Pulse', icon: '💥', isEvolved: true, level: 1, maxLevel: 1, tags: ['aoe', 'pulse', 'evolved'],
        shortDescription: "Massive shockwave obliterates nearby shapes.",
        baseFireRate: 0.7, baseDamage: 60, baseRadius: 3.5, fireTimer: 0,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; const aoeMod = getItemModifier('AOE_RADIUS_PERCENT'); const pulseMod = getItemModifier('PULSE_EFFECT_PERCENT'); const blastRadius = this.baseRadius * aoeMod.percent * pulseMod.percent; const damage = this.getDamage() * pulseMod.percent; const blastColor = 0x00FFFF; state.shapes.forEach(shape => { const distance = state.player.position.distanceTo(shape.position); if (distance < blastRadius + (shape.radius || 0.5)) { shape.health -= damage; createHitEffect(shape, blastColor, 0.15); const pushDir = new THREE.Vector3().subVectors(shape.position, state.player.position).normalize(); shape.position.add(pushDir.multiplyScalar(2.0)); } }); createTemporaryVisualEffect(state.player.position, blastRadius, blastColor, 0.25, true, new THREE.TorusGeometry(blastRadius * 0.9, 0.1, 8, 32)); } },
        getFireRate: function () { return this.baseFireRate; }, getDamage: function () { return this.baseDamage; }, getRadius: function () { return this.baseRadius; }
    },
    AXIS_BOLTER: {
        id: 'AXIS_BOLTER_EVOLVED', name: 'Crucible Bolter', icon: '╋', isEvolved: true, level: 1, maxLevel: 1, tags: ['single_shot', 'evolved', 'piercing'],
        shortDescription: "Fires a trio of devastating, piercing energy bolts.",
        baseFireRate: 0.8, baseDamage: 70, baseProjectileCount: 3, fireTimer: 0,
        fire: function (deltaTime) { const fireRateMod = getItemModifier('GLOBAL_FIRERATE_PERCENT'); this.fireTimer += deltaTime; if (this.fireTimer >= this.getFireRate() / fireRateMod.percent) { this.fireTimer = 0; fireGenericProjectile(this, { count: this.baseProjectileCount, color: 0xFFFFE0, emissiveColor: 0xFFFFF0, emissiveIntensity: 0.7, damage: this.getDamage(), geometry: new THREE.CylinderGeometry(CONSTANTS.PROJECTILE_RADIUS * 0.4, CONSTANTS.PROJECTILE_RADIUS * 0.4, CONSTANTS.PROJECTILE_RADIUS * 7, 6), speed: CONSTANTS.BASE_PROJECTILE_SPEED * 2.0, spread: Math.PI / 20, tags: this.tags }); } },
        getFireRate: function () { return this.baseFireRate; }, getDamage: function () { return this.baseDamage; }, getProjectileCount: function () { return this.baseProjectileCount; }
    },
};