import { state } from '../state.js';
import { metaUpgrades } from '../config/items.js';
import { recalculatePlayerStats } from '../game/player.js';
import { updateUI } from '../ui/manager.js';

const SAVE_KEY = 'geometryFightersSaveData';

/**
 * Saves the current meta-progression data (currency, upgrade levels) to localStorage.
 */
export function saveData() {
    try {
        const gameData = {
            dataCores: state.dataCores,
            metaUpgrades: {}
        };
        // Store only the level for each meta upgrade to keep save data small.
        for (const key in metaUpgrades) {
            if (Object.hasOwnProperty.call(metaUpgrades, key)) {
                gameData.metaUpgrades[key] = metaUpgrades[key].level;
            }
        }
        localStorage.setItem(SAVE_KEY, JSON.stringify(gameData));
    } catch (e) {
        console.error("Error saving game data to localStorage:", e);
    }
}

/**
 * Loads meta-progression data from localStorage and applies it to the current game state.
 */
export function loadGameData() {
    try {
        const savedData = localStorage.getItem(SAVE_KEY);
        if (savedData) {
            const gameData = JSON.parse(savedData);
            state.dataCores = gameData.dataCores || 0;

            if (gameData.metaUpgrades) {
                for (const key in metaUpgrades) {
                    if (Object.hasOwnProperty.call(metaUpgrades, key) && Object.hasOwnProperty.call(gameData.metaUpgrades, key)) {
                        // Ensure loaded level is within the defined bounds (0 to maxLevel).
                        metaUpgrades[key].level = Math.max(0, Math.min(gameData.metaUpgrades[key] || 0, metaUpgrades[key].maxLevel));
                    }
                }
            }
        }
    } catch (e) {
        console.error("Error loading or parsing game data from localStorage:", e);
        // Reset to defaults on error to prevent crashes.
        state.dataCores = 0;
        for (const key in metaUpgrades) {
            if (Object.hasOwnProperty.call(metaUpgrades, key)) {
                metaUpgrades[key].level = 0;
            }
        }
    }
    // Always apply the loaded (or default) state to the game stats.
    applyMetaUpgradesToGame();
}

/**
 * Applies the current meta upgrade levels to the base game stats.
 * This function should be called after loading data or after purchasing upgrades.
 */
export function applyMetaUpgradesToGame() {
    // Calculate new base values for the run based on meta upgrades.
    state.BASE_MAX_PLAYER_SHIELD = 100 + (metaUpgrades.maxShield.level * metaUpgrades.maxShield.valuePerLevel);
    state.baseDamageMultiplier = 1.0 + (metaUpgrades.baseDamage.level * metaUpgrades.baseDamage.valuePerLevel);
    state.BASE_PLAYER_SPEED = 5.0 + (metaUpgrades.moveSpeed.level * metaUpgrades.moveSpeed.valuePerLevel);
    state.BASE_XP_COLLECTION_RADIUS = 2.0 + (metaUpgrades.pickupRadius.level * metaUpgrades.pickupRadius.valuePerLevel);

    // Set current max shield for the upcoming run.
    state.MAX_PLAYER_SHIELD = state.BASE_MAX_PLAYER_SHIELD;

    // Immediately apply the new base stats to the player's current stats.
    recalculatePlayerStats();

    // Update any UI elements that might display these base stats.
    updateUI();
}