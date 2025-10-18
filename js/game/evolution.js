import { state } from '../state.js';
import { EVOLVED_WEAPONS } from '../config/weapons.js';
import { updateWeaponUI, defaultGetUpgradeDescription } from '../ui/manager.js';
import { createBurstEffect } from './spawner.js';

/**
 * Checks if a given weapon is eligible for evolution and performs the evolution if conditions are met.
 * @param {object} weaponToCheck The weapon instance from the player's inventory.
 */
export function checkEvolution(weaponToCheck) {
    if (!weaponToCheck || weaponToCheck.isEvolved || weaponToCheck.level < weaponToCheck.maxLevel || !weaponToCheck.synergyItemId) {
        return;
    }

    const synergisticItem = state.playerItems.find(item => item.id === weaponToCheck.synergyItemId && item.level > 0);

    if (synergisticItem) {
        const evolvedData = EVOLVED_WEAPONS[weaponToCheck.id];

        if (evolvedData) {
            const weaponIndex = state.playerWeapons.findIndex(w => w.id === weaponToCheck.id);

            if (weaponIndex !== -1) {
                const evolvedWeaponInstance = {
                    ...evolvedData,
                    fire: evolvedData.fire,
                    getFireRate: evolvedData.getFireRate,
                    getDamage: evolvedData.getDamage,
                    getProjectileCount: evolvedData.getProjectileCount,
                    getRadius: evolvedData.getRadius,
                    getShapeCount: evolvedData.getShapeCount,
                    getUpgradeDescription: evolvedData.getUpgradeDescription || defaultGetUpgradeDescription,
                    createMesh: evolvedData.createMesh,
                    updateMesh: evolvedData.updateMesh,
                    updateWeaponSystem: evolvedData.updateWeaponSystem,
                    fireTimer: 0,
                    damageTimer: 0,
                    enemiesHitThisInterval: []
                };

                const oldWeaponId = state.playerWeapons[weaponIndex].id;
                if (state.persistentWeaponMeshes[oldWeaponId]) {
                    state.scene.remove(state.persistentWeaponMeshes[oldWeaponId]);
                    delete state.persistentWeaponMeshes[oldWeaponId];
                }

                state.playerWeapons[weaponIndex] = evolvedWeaponInstance;

                evolvedWeaponInstance.createMesh?.(evolvedWeaponInstance);

                updateWeaponUI();

                createBurstEffect(state.player.position, 60, 0xFFD700, 7, 1.0, 'spiral');
            }
        }
    }
}