import { state } from '../state.js';

export const metaUpgrades = {
    maxShield: { name: "Max Shield", level: 0, maxLevel: 10, costBase: 50, costIncrease: 1.5, valuePerLevel: 10 },
    baseDamage: { name: "Base Damage", level: 0, maxLevel: 10, costBase: 75, costIncrease: 1.6, valuePerLevel: 0.05 },
    moveSpeed: { name: "Move Speed", level: 0, maxLevel: 5, costBase: 60, costIncrease: 1.8, valuePerLevel: 0.15 },
    pickupRadius: { name: "Pickup Radius", level: 0, maxLevel: 5, costBase: 40, costIncrease: 1.7, valuePerLevel: 0.2 },
    luck: { name: "Luck", level: 0, maxLevel: 10, costBase: 100, costIncrease: 1.8, valuePerLevel: 0.03 },
};

export const ITEMS = {
    SPEED_MATRIX: { id: 'SPEED_MATRIX', name: 'Speed Matrix', icon: '⏩', level: 0, maxLevel: 5, shortDescription: "Increases movement speed.", buffType: 'MOVE_SPEED', valuePerLevel: 0.4 },
    DAMAGE_CRYSTAL: { id: 'DAMAGE_CRYSTAL', name: 'Damage Crystal', icon: '💥', level: 0, maxLevel: 8, shortDescription: "Increases all damage dealt by 5% per level.", buffType: 'GLOBAL_DAMAGE_PERCENT', valuePerLevel: 0.05 },
    RATE_ACCELERATOR: { id: 'RATE_ACCELERATOR', name: 'Rate Accelerator', icon: '⏱️', level: 0, maxLevel: 8, shortDescription: "Increases global fire rate by 4% per level.", buffType: 'GLOBAL_FIRERATE_PERCENT', valuePerLevel: 0.04 },
    AREA_EXPANDER: { id: 'AREA_EXPANDER', name: 'Area Expander', icon: '↔️', level: 0, maxLevel: 5, shortDescription: "Increases Area of Effect size by 8% per level.", buffType: 'AOE_RADIUS_PERCENT', valuePerLevel: 0.08 },
    PROJECTILE_BOOSTER: { id: 'PROJECTILE_BOOSTER', name: 'Projectile Booster', icon: '🚀', level: 0, maxLevel: 5, synergyWeaponId: 'VECTOR_LANCE', shortDescription: "Increases projectile speed by 10% per level.", buffType: 'PROJECTILE_SPEED_PERCENT', valuePerLevel: 0.10 },
    SHIELD_RECHARGER: { id: 'SHIELD_RECHARGER', name: 'Shield Recharger', icon: '🔋', level: 0, maxLevel: 5, shortDescription: "Regenerates 0.1 shield per second per level.", buffType: 'SHIELD_REGEN', valuePerLevel: 0.1 },
    DATA_COLLECTOR: { id: 'DATA_COLLECTOR', name: 'Data Collector', icon: '🧲', level: 0, maxLevel: 5, shortDescription: "Increases XP pickup radius by 0.3 per level.", buffType: 'XP_PICKUP_RADIUS', valuePerLevel: 0.3 },
    FOCUS_LENS: { id: 'FOCUS_LENS', name: 'Focus Lens', icon: '◎', level: 0, maxLevel: 5, synergyWeaponId: 'AXIS_BOLTER', shortDescription: "Increases damage of single-shot weapons by 8% per level.", buffType: 'SINGLE_SHOT_DAMAGE_PERCENT', valuePerLevel: 0.08 },
    SCATTER_MODULE: { id: 'SCATTER_MODULE', name: 'Scatter Module', icon: '░', level: 0, maxLevel: 3, synergyWeaponId: 'SHARD_SCATTER', shortDescription: "Adds +1 projectile to scatter weapons per level.", buffType: 'SCATTER_COUNT', valuePerLevel: 1 },
    KINETIC_AMPLIFIER: { id: 'KINETIC_AMPLIFIER', name: 'Kinetic Amplifier', icon: '〰', level: 0, maxLevel: 5, synergyWeaponId: 'REPULSOR_WAVE', shortDescription: "Increases radius/damage of pulse weapons by 10% per level.", buffType: 'PULSE_EFFECT_PERCENT', valuePerLevel: 0.10 },
    DURATION_COIL: { id: 'DURATION_COIL', name: 'Duration Coil', icon: '⏳', level: 0, maxLevel: 5, synergyWeaponId: 'GEOMETRIC_FLUX', shortDescription: "Increases duration of effects by 15% per level.", buffType: 'DURATION_PERCENT', valuePerLevel: 0.15 },
    HEAVY_CALIBRATOR: { id: 'HEAVY_CALIBRATOR', name: 'Heavy Calibrator', icon: '⚙️', level: 0, maxLevel: 5, synergyWeaponId: 'CUBE_CANNON', shortDescription: "Increases damage of heavy weapons by 10% per level.", buffType: 'HEAVY_DAMAGE_PERCENT', valuePerLevel: 0.10 },
    ORBITAL_ENHANCER: { id: 'ORBITAL_ENHANCER', name: 'Orbital Enhancer', icon: '💫', level: 0, maxLevel: 5, synergyWeaponId: 'ORBITAL_SHIELD', shortDescription: "Increases damage/count of orbitals by 10% per level.", buffType: 'ORBITAL_EFFECT_PERCENT', valuePerLevel: 0.10 },
    KINETIC_ACCELERATOR: { id: 'KINETIC_ACCELERATOR', name: 'Kinetic Accelerator', icon: '⚙️', level: 0, maxLevel: 1, synergyWeaponId: 'POLY_BURST', shortDescription: "Unlocks Poly Burst evolution. (Max Lvl 1)", buffType: 'EVO_CATALYST', valuePerLevel: 1 }
};

export const GENERIC_UPGRADES = {
    SHIELD_REPAIR: { id: 'SHIELD_REPAIR', name: 'Repair 30 Shield', icon: '✚', shortDescription: "Instantly restores 30 shield points." },
    SPEED_BOOST: { id: 'SPEED_BOOST', name: 'Increase Move Speed', icon: '⏩', shortDescription: "Permanently increases movement speed." }
};

export function getItemModifier(buffType) {
    let modifier = { percent: 1.0, flat: 0.0, count: 0 };
    state.playerItems.forEach(item => {
        if (item.level > 0 && item.buffType === buffType) {
            const value = item.level * item.valuePerLevel;
            if (buffType.includes('_PERCENT')) {
                modifier.percent += value;
            } else if (buffType.includes('_COUNT')) {
                modifier.count += Math.floor(value);
            } else {
                modifier.flat += value;
            }
        }
    });
    return modifier;
}