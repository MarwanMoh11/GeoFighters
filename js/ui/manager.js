import { state, GameState, CONSTANTS, resetGameState } from '../state.js';
import { ui } from './dom.js';
import { gameLevels } from '../config/levels.js';
import { ITEMS, GENERIC_UPGRADES, metaUpgrades } from '../config/items.js';
import { WEAPONS, EVOLVED_WEAPONS } from '../config/weapons.js';
import { saveData, applyMetaUpgradesToGame } from '../utils/saveLoad.js';
import { initializeAudio, playSoundSynth } from '../utils/audio.js';
import { toggleFullScreen, triggerHaptic } from '../utils/input.js';
import { checkEvolution } from '../game/evolution.js';
import { recalculatePlayerStats } from '../game/player.js';
import { ENEMY_TYPES } from '../config/enemies.js';
import { spawnEnemyByType } from '../game/spawner.js';
import * as THREE from 'three';
// ... your existing imports like state, ui, gameLevels, etc. ...


// --- Event Binding ---
export function bindUIEvents() {
    // Wrap each button click with haptic feedback
    const withHaptic = (fn) => () => { triggerHaptic('light'); fn(); };

    ui.startSimulationButton.onclick = withHaptic(showLevelSelect);
    ui.metaUpgradesButton.onclick = withHaptic(showUpgradeMenu);
    ui.settingsButtonMain.onclick = withHaptic(() => showSettings('MainMenu'));
    ui.applyMetaUpgradesButton.onclick = withHaptic(applyMetaUpgradesAndReturn);
    ui.levelSelectBackButton.onclick = withHaptic(hideLevelSelect);
    ui.resumeButton.onclick = withHaptic(resumeGame);
    ui.evolutionsButton.onclick = withHaptic(showEvolutionBook);
    ui.settingsButtonPaused.onclick = withHaptic(() => showSettings('Paused'));
    ui.exitSimulationButton.onclick = withHaptic(quitToMainMenu);
    ui.settingsBackButton.onclick = withHaptic(hideSettings);
    ui.evolutionBookBackButton.onclick = withHaptic(hideEvolutionBook);
    ui.gameOverReturnButton.onclick = withHaptic(quitToMainMenu);
    ui.winScreenReturnButton.onclick = withHaptic(quitToMainMenu);
    ui.fullscreenButton.onclick = withHaptic(toggleFullScreen);
}

// PASTE THIS ENTIRE FUNCTION into src/ui/manager.js

/**
 * Instantly sets up a test environment with maxed-out gear and a horde of enemies.
 * Uses state.stressTestCount for enemy spawn amount (configurable via URL ?stress=N)
 */
function setupDebugState() {
    console.warn("--- DEBUG MODE ACTIVE ---");

    // 1. Max out all weapons
    Object.values(WEAPONS).forEach(weapon => {
        if (!state.playerWeapons.find(w => w.id === weapon.id)) {
            weapon.level = weapon.maxLevel;
            state.playerWeapons.push(weapon);
            weapon.createMesh?.(weapon); // Create visuals for orbitals, etc.
        }
    });

    // 2. Max out all items
    Object.values(ITEMS).forEach(item => {
        if (!state.playerItems.find(i => i.id === item.id)) {
            item.level = item.maxLevel;
            state.playerItems.push(item);
        }
    });

    // 3. Trigger all possible evolutions
    state.playerWeapons.forEach(weapon => {
        checkEvolution(weapon);
    });

    // 4. Spawn enemies for stress testing (uses configurable count)
    const spawnCount = state.stressTestCount || 1000;
    const spawnRadius = 50; // Enlarged for stress testing
    const spawnableEnemies = Object.keys(ENEMY_TYPES).filter(key => !ENEMY_TYPES[key].isBoss);

    console.warn(`Spawning ${spawnCount} enemies for stress testing...`);
    for (let i = 0; i < spawnCount; i++) {
        const randomType = spawnableEnemies[Math.floor(Math.random() * spawnableEnemies.length)];

        const angle = Math.random() * Math.PI * 2;
        const radius = 10 + Math.random() * (spawnRadius - 10);
        const x = state.player.position.x + Math.cos(angle) * radius;
        const z = state.player.position.z + Math.sin(angle) * radius;

        // Use a forced position to spawn enemies around the player
        spawnEnemyByType(randomType, new THREE.Vector3(x, 0, z));
    }

    // 5. Instantly level up the player to see scaling
    state.playerLevel = 50;

    console.warn(`Stress test complete. ${state.shapes.length} enemies active.`);
}

// --- Game Flow & State Management ---

// REPLACE your existing startGame function with this one.

export function startGame(levelId) {
    // Check for the debug flag in the URL (e.g., "index.html?debug=true")
    const isDebugMode = new URLSearchParams(window.location.search).has('debug');

    resetGameState();
    initializeAudio();

    const selectedLevelData = gameLevels.find(l => l.id === levelId);
    if (!selectedLevelData?.unlocked) return;

    applyMetaUpgradesToGame();

    // Reset run-specific stats
    state.currentLevelId = levelId;
    state.playerShield = state.MAX_PLAYER_SHIELD;
    state.score = 0;
    state.playerLevel = 1;
    state.currentXP = 0;
    state.xpToNextLevel = 60;
    state.playerWeapons = [];
    state.playerItems = [];
    state.gameTime = 0;
    state.isBossWave = false;
    state.nextBossTime = 600;

    // --- DEBUG MODE ACTIVATION ---
    if (isDebugMode) {
        setupDebugState(); // This sets up your maxed-out state
    } else {
        // --- NORMAL GAME START ---
        // Clear weapon/item levels from previous runs
        Object.values(WEAPONS).forEach(w => { w.level = 0; w.isEvolved = false; w.fireTimer = 0; });
        Object.values(ITEMS).forEach(i => { i.level = 0; });

        // Start with a default weapon
        if (WEAPONS.VECTOR_LANCE) {
            defaultApplyUpgrade.call(WEAPONS.VECTOR_LANCE);
        }
    }
    // ---------------------------

    if (state.player) state.player.position.set(0, CONSTANTS.PLAYER_HEIGHT / 2, 0);

    selectedLevelData.mapSetup?.();

    recalculatePlayerStats();
    updateUI();
    updateWeaponUI();
    updateItemUI();

    Object.values(ui).forEach(element => {
        if (element && element.classList?.contains('menu-overlay') || element?.classList?.contains('popup-overlay')) {
            element.style.display = 'none';
        }
    });
    ui.gameUi.style.display = 'block';

    state.currentGameState = GameState.Playing;
    state.isPaused = false;
    updateJoystickVisibility();
    if (!state.clock.running) state.clock.start();
}

function clearDynamicSceneObjects() {
    console.error("!!! clearDynamicSceneObjects WAS CALLED !!!");
    for (let i = state.scene.children.length - 1; i >= 0; i--) {
        const child = state.scene.children[i];
        // In ui/manager.js, inside clearDynamicSceneObjects()

        const isProtected = child === state.player ||
            child === state.ground ||
            child.isLight ||
            child.isCamera ||
            child === state.gridHelper ||
            state.staticLevelObjects.includes(child) ||
            child === state.backgroundPattern ||
            child.isInstancedMesh; // <-- ADD THIS LINE
        if (!isProtected) {
            child.geometry?.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m?.dispose());
                else child.material.dispose();
            }
            state.scene.remove(child);
        }
    }
    state.shapes.length = 0;
    state.projectiles.length = 0;
    state.dataFragments.length = 0;
    state.megaDataFragments.length = 0;
    state.hitEffects.length = 0;
    state.geometricCaches.length = 0;
    state.repairNodes.length = 0;
    state.energyCores.length = 0;
    state.particles.length = 0;
    Object.values(state.persistentWeaponMeshes).forEach(mesh => state.scene.remove(mesh));
    state.persistentWeaponMeshes = {};
}

export function pauseGame() {
    if (state.currentGameState === GameState.Playing) {
        state.previousGameState = state.currentGameState;
        state.currentGameState = GameState.Paused;
        state.isPaused = true;
        ui.pauseMenu.style.display = 'flex';
        updateJoystickVisibility();
    }
}

export function resumeGame() {
    if (state.currentGameState === GameState.Paused) {
        state.currentGameState = GameState.Playing;
        state.isPaused = false;
        ui.pauseMenu.style.display = 'none';
        updateJoystickVisibility();
    }
}

export function quitToMainMenu() {
    state.currentGameState = GameState.MainMenu;
    state.isPaused = true;

    Object.values(ui).forEach(element => {
        if (element && (element.classList?.contains('menu-overlay') || element.classList?.contains('popup-overlay') || element.id === 'gameUi')) {
            element.style.display = 'none';
        }
    });
    ui.mainMenu.style.display = 'flex';

    updateJoystickVisibility();
    clearDynamicSceneObjects();
}

export function gameOver() {
    if (state.currentGameState === GameState.GameOver || state.currentGameState === GameState.Win) return;
    playSoundSynth('error', 0.5);
    saveData();
    state.previousGameState = state.currentGameState;
    state.currentGameState = GameState.GameOver;
    state.isPaused = true;
    ui.finalScore.textContent = state.score;
    ui.gameOver.style.display = 'block';
    updateJoystickVisibility();
}

export function winGame() {
    if (state.currentGameState === GameState.Win || state.currentGameState === GameState.GameOver) return;
    playSoundSynth('level_up', 0.7);
    saveData();
    state.previousGameState = state.currentGameState;
    state.currentGameState = GameState.Win;
    state.isPaused = true;
    ui.winFinalScore.textContent = state.score;
    ui.winScreen.style.display = 'block';
    updateJoystickVisibility();
}

export function showLevelSelect() {
    ui.mainMenu.style.display = 'none';
    ui.levelSelectMenu.style.display = 'flex';
    state.currentGameState = GameState.LevelSelect;
    updateJoystickVisibility();
}

export function hideLevelSelect() {
    ui.levelSelectMenu.style.display = 'none';
    ui.mainMenu.style.display = 'flex';
    state.currentGameState = GameState.MainMenu;
    updateJoystickVisibility();
}

export function showSettings(originStateKey) {
    state.previousGameState = GameState[originStateKey];
    state.currentGameState = GameState.Settings;
    state.isPaused = true;
    ui.settingsMenu.style.display = 'flex';
    if (state.previousGameState === GameState.MainMenu) ui.mainMenu.style.display = 'none';
    if (state.previousGameState === GameState.Paused) ui.pauseMenu.style.display = 'none';
    updateJoystickVisibility();
}

export function hideSettings() {
    ui.settingsMenu.style.display = 'none';
    state.currentGameState = state.previousGameState;
    state.isPaused = (state.currentGameState !== GameState.Playing && state.currentGameState !== GameState.MainMenu);
    if (state.currentGameState === GameState.MainMenu) ui.mainMenu.style.display = 'flex';
    if (state.currentGameState === GameState.Paused) ui.pauseMenu.style.display = 'flex';
    updateJoystickVisibility();
}

export function showEvolutionBook() {
    if (state.currentGameState !== GameState.Paused) return;
    state.previousGameState = GameState.Paused;
    state.currentGameState = GameState.EvolutionBook;
    ui.pauseMenu.style.display = 'none';
    ui.evolutionBookMenu.style.display = 'flex';
    populateEvolutionBook();
    updateJoystickVisibility();
}

export function hideEvolutionBook() {
    if (state.currentGameState !== GameState.EvolutionBook) return;
    ui.evolutionBookMenu.style.display = 'none';
    ui.pauseMenu.style.display = 'flex';
    state.currentGameState = GameState.Paused;
    updateJoystickVisibility();
}

export function populateLevelList() {
    ui.levelList.innerHTML = '';
    gameLevels.forEach(level => {
        const button = document.createElement('button');
        button.classList.add('level-button');
        button.textContent = `${level.name} - ${level.description}`;
        if (level.unlocked) {
            button.onclick = () => startGame(level.id);
        } else {
            button.disabled = true;
            button.textContent += " (Locked)";
        }
        ui.levelList.appendChild(button);
    });
}

function populateEvolutionBook() {
    ui.evolutionList.innerHTML = '';
    let found = false;
    Object.values(WEAPONS).forEach(weapon => {
        if (weapon.synergyItemId && EVOLVED_WEAPONS[weapon.id]) {
            const synergyItem = ITEMS[weapon.synergyItemId];
            const evolvedWeapon = EVOLVED_WEAPONS[weapon.id];
            if (synergyItem && evolvedWeapon) {
                found = true;
                const entryDiv = document.createElement('div');
                entryDiv.classList.add('evolution-entry');
                entryDiv.innerHTML = `
                    <span class="weapon-name">${weapon.name} ${weapon.icon} (Lvl ${weapon.maxLevel})</span> +
                    <span class="item-name">${synergyItem.name} ${synergyItem.icon}</span><br>
                    => <strong class="evolved-name">${evolvedWeapon.name} ${evolvedWeapon.icon}</strong>
                    <p><em>${evolvedWeapon.shortDescription}</em></p>`;
                ui.evolutionList.appendChild(entryDiv);
            }
        }
    });
    if (!found) {
        ui.evolutionList.innerHTML = '<p>No evolutions discovered.</p>';
    }
}

// --- VS-STYLE: updateUI ---
// Updates the new VS-style HUD elements
export function updateUI() {
    // Update simple text fields
    ui.shield.textContent = Math.max(0, state.playerShield).toFixed(0);
    ui.score.textContent = state.score;
    ui.levelText.textContent = state.playerLevel;

    // Update XP Bar (full-width)
    ui.xpBarFill.style.width = `${Math.min(1, state.currentXP / state.xpToNextLevel) * 100}%`;

    // Update Shield Bar
    if (ui.shieldBarFill) {
        const shieldPercent = Math.min(1, Math.max(0, state.playerShield) / state.MAX_PLAYER_SHIELD) * 100;
        ui.shieldBarFill.style.width = `${shieldPercent}%`;
    }

    // Update Timer
    const totalSeconds = Math.floor(state.gameTime);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    ui.timer.textContent = `${minutes}:${seconds}`;

    // Update Kill Count
    if (ui.killCount) {
        ui.killCount.textContent = state.killCount || 0;
    }
}

// --- VS-STYLE: updateWeaponUI ---
// Populates the bottom-left weapon slots
export function updateWeaponUI() {
    if (!ui.weaponSlots) return;
    ui.weaponSlots.innerHTML = '';

    // Create 6 slots (max weapons)
    for (let i = 0; i < 6; i++) {
        const slot = document.createElement('div');
        slot.classList.add('weapon-slot');

        const weapon = state.playerWeapons[i];
        if (weapon && weapon.level > 0) {
            slot.classList.add('active');
            if (weapon.isEvolved) slot.classList.add('evolved');

            const icon = document.createElement('span');
            icon.classList.add('slot-icon');
            icon.textContent = weapon.icon || '?';
            slot.appendChild(icon);

            const level = document.createElement('span');
            level.classList.add('slot-level');
            level.textContent = weapon.isEvolved ? 'E' : weapon.level;
            slot.appendChild(level);
        }

        ui.weaponSlots.appendChild(slot);
    }
}

// --- VS-STYLE: updateItemUI ---
// Populates the bottom-right item slots
export function updateItemUI() {
    if (!ui.itemSlots) return;
    ui.itemSlots.innerHTML = '';

    // Create 6 slots (max items)
    for (let i = 0; i < 6; i++) {
        const slot = document.createElement('div');
        slot.classList.add('item-slot');

        const item = state.playerItems[i];
        if (item && item.level > 0) {
            slot.classList.add('active');

            const icon = document.createElement('span');
            icon.classList.add('slot-icon');
            icon.textContent = item.icon || '?';
            slot.appendChild(icon);

            const level = document.createElement('span');
            level.classList.add('slot-level');
            level.textContent = item.level;
            slot.appendChild(level);
        }

        ui.itemSlots.appendChild(slot);
    }
}

// --- MODIFIED: updateJoystickVisibility ---
// This now *only* shows the pause button on mobile
export function updateJoystickVisibility() {
    const showMovement = state.isTouchDevice && state.currentGameState === GameState.Playing && !state.isPaused;
    ui.joystickArea.style.display = showMovement ? 'block' : 'none';

    // Show button ONLY on touch devices, and ONLY if playing or paused.
    const showButton = state.isTouchDevice && (state.currentGameState === GameState.Playing || state.currentGameState === GameState.Paused);

    ui.fullscreenButton.style.display = showButton ? 'block' : 'none';

    if (showButton) {
        // It's always a pause/resume button now.
        ui.fullscreenButton.textContent = (state.currentGameState === GameState.Playing && !state.isPaused) ? "☰" : "▶";
    }
}

export function collectXP(value) {
    if (state.currentGameState !== GameState.Playing || state.isPaused) return;
    state.currentXP += value;
    state.score += Math.max(1, Math.floor(value * 0.3));
    if (state.currentXP >= state.xpToNextLevel) {
        levelUp();
    }
    updateUI();
}

function levelUp() {
    state.currentXP -= state.xpToNextLevel;
    state.playerLevel++;
    state.xpToNextLevel = Math.floor(60 * Math.pow(state.playerLevel, 1.15));

    // --- MODIFICATION START ---

    // First, check if any permanent upgrades are even possible
    const permanentUpgrades = getAvailableUpgrades();

    if (permanentUpgrades.length === 0) {
        // All weapons/items are maxed. Grant a default reward and skip the menu.

        // You can change GENERIC_UPGRADES.SHIELD_REPAIR to GENERIC_UPGRADES.SPEED_BOOST
        // or add logic to alternate between them.
        const defaultReward = GENERIC_UPGRADES.SHIELD_REPAIR;

        if (defaultReward) {
            applyUpgradeLogic({ type: 'generic_upgrade', data: defaultReward });
        }

        playSoundSynth('level_up', 0.6);

        // IMPORTANT: Check if we have enough XP for *another* level-up
        if (state.currentXP >= state.xpToNextLevel) {
            levelUp(); // Call recursively to handle multi-levels
        }

        return; // Exit the function *before* pausing or showing the screen
    }

    // --- MODIFICATION END ---

    // If we are here, it means permanent upgrades *are* available.
    // Proceed to show the level-up screen as normal.
    state.previousGameState = state.currentGameState;
    state.currentGameState = GameState.LevelUp;
    state.isPaused = true;

    // Pass the list of upgrades we already found
    presentUpgradeOptions(permanentUpgrades);

    ui.levelUpScreen.style.display = 'block';
    updateJoystickVisibility();
    playSoundSynth('level_up', 0.6);
}


// --- MODIFIED: presentUpgradeOptions ---
// Includes logic for evolution hints
function presentUpgradeOptions(permanentUpgrades, count = 3) {
    ui.upgradeOptions.innerHTML = '';

    const allAvailableUpgrades = [...permanentUpgrades];
    Object.values(GENERIC_UPGRADES).forEach(u => allAvailableUpgrades.push({ type: 'generic_upgrade', data: u }));

    const optionsToShow = allAvailableUpgrades.sort(() => 0.5 - Math.random()).slice(0, count);

    // Store in state for mobile UI to access (with evolution hints)
    state.upgradeOptions = optionsToShow.map(optionWrapper => {
        const option = optionWrapper.data;
        let evolutionHint = '';
        let evolutionStatus = 'none'; // 'none', 'ready', 'has_synergy', 'needs_synergy'

        try {
            if (optionWrapper.type.includes('weapon')) {
                const synergyItem = ITEMS[option.synergyItemId];
                if (synergyItem) {
                    const playerHasItem = state.playerItems.some(i => i.id === option.synergyItemId && i.level > 0);
                    if (option.level === option.maxLevel - 1 && playerHasItem) {
                        evolutionHint = `✨ READY TO EVOLVE!`;
                        evolutionStatus = 'ready';
                    } else if (playerHasItem) {
                        evolutionHint = `Evolves with ${synergyItem.icon}`;
                        evolutionStatus = 'has_synergy';
                    } else {
                        evolutionHint = `Needs ${synergyItem.icon} to evolve`;
                        evolutionStatus = 'needs_synergy';
                    }
                }
            } else if (optionWrapper.type.includes('item')) {
                const synergyWeapon = WEAPONS[option.synergyWeaponId];
                if (synergyWeapon) {
                    const playerHasWeapon = state.playerWeapons.find(w => w.id === option.synergyWeaponId);
                    if (playerHasWeapon && !playerHasWeapon.isEvolved) {
                        if (playerHasWeapon.level === playerHasWeapon.maxLevel) {
                            evolutionHint = `✨ READY TO EVOLVE ${synergyWeapon.icon}!`;
                            evolutionStatus = 'ready';
                        } else {
                            evolutionHint = `Evolves ${synergyWeapon.icon} at Lvl ${synergyWeapon.maxLevel}`;
                            evolutionStatus = 'has_synergy';
                        }
                    }
                }
            }
        } catch (e) { }

        return {
            ...optionWrapper,
            name: option?.name || 'Upgrade',
            icon: option?.icon || '⬆️',
            description: option?.shortDescription || '',
            evolutionHint,
            evolutionStatus,
            isWeapon: optionWrapper.type.includes('weapon'),
            isItem: optionWrapper.type.includes('item'),
            level: option?.level || 0,
            maxLevel: option?.maxLevel || 5
        };
    });

    optionsToShow.forEach(optionWrapper => {
        const option = optionWrapper.data;
        const button = document.createElement('button');
        let description;
        let evolutionHint = ''; // <-- NEW: Evolution hint string

        // --- NEW: Evolution Hint Logic ---
        try {
            if (optionWrapper.type.includes('weapon')) {
                // Check if this weapon can evolve
                const synergyItem = ITEMS[option.synergyItemId];
                if (synergyItem) {
                    const playerHasItem = state.playerItems.some(i => i.id === option.synergyItemId && i.level > 0);
                    // Check if this upgrade is the *final* level needed
                    if (option.level === option.maxLevel - 1 && playerHasItem) {
                        evolutionHint = `<span class="evolution-hint">✨ READY TO EVOLVE!</span>`;
                    } else if (playerHasItem) {
                        evolutionHint = `<span class="evolution-hint">(Evolves with ${synergyItem.icon})</span>`;
                    } else {
                        evolutionHint = `<span class="evolution-hint-needed">(Needs ${synergyItem.icon} to evolve)</span>`;
                    }
                }
            } else if (optionWrapper.type.includes('item')) {
                // Check if this item can evolve a weapon
                const synergyWeapon = WEAPONS[option.synergyWeaponId];
                if (synergyWeapon) {
                    const playerHasWeapon = state.playerWeapons.find(w => w.id === option.synergyWeaponId);
                    if (playerHasWeapon && !playerHasWeapon.isEvolved) {
                        if (playerHasWeapon.level === playerHasWeapon.maxLevel) {
                            evolutionHint = `<span class="evolution-hint">✨ READY TO EVOLVE ${synergyWeapon.icon}!</span>`;
                        } else {
                            evolutionHint = `<span class="evolution-hint">(Evolves ${synergyWeapon.icon} at Lvl ${synergyWeapon.maxLevel})</span>`;
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Error generating evolution hint:", e, optionWrapper);
        }
        // --- END: Evolution Hint Logic ---


        if (optionWrapper.type.includes('weapon')) description = defaultGetUpgradeDescription.call(option);
        else if (optionWrapper.type.includes('item')) description = defaultItemGetUpgradeDescription.call(option);
        else description = `${option.name} ${option.icon || ''}`;

        button.innerHTML = description + evolutionHint; // <-- NEW: Append hint
        button.onclick = () => selectUpgrade(optionWrapper);

        const descElement = document.createElement('p');
        descElement.classList.add('upgrade-description');
        descElement.textContent = option.shortDescription || '';

        const optionDiv = document.createElement('div');
        optionDiv.appendChild(button);
        optionDiv.appendChild(descElement);
        ui.upgradeOptions.appendChild(optionDiv);
    });
}


export function selectUpgrade(selectedOptionWrapper) {
    applyUpgradeLogic(selectedOptionWrapper);
    if (state.currentGameState === GameState.LevelUp) {
        ui.levelUpScreen.style.display = 'none';
        state.currentGameState = GameState.Playing;
        state.isPaused = false;
        updateJoystickVisibility();
    }
}

function applyUpgradeLogic(selectedOptionWrapper) {
    if (!selectedOptionWrapper?.data) return;
    const option = selectedOptionWrapper.data;
    const type = selectedOptionWrapper.type;

    if (type === 'weapon_upgrade' || type === 'weapon_unlock') {
        defaultApplyUpgrade.call(option);
    } else if (type === 'item_upgrade' || type === 'item_unlock') {
        defaultItemApplyUpgrade.call(option);
    } else if (type === 'generic_upgrade') {
        if (option.id === 'SHIELD_REPAIR') state.playerShield = Math.min(state.MAX_PLAYER_SHIELD, state.playerShield + 30);
        else if (option.id === 'SPEED_BOOST') { recalculatePlayerStats(); }
    }
    updateWeaponUI();
    updateItemUI();
    updateUI();
}

export function defaultApplyUpgrade() {
    if (this.isEvolved) return;
    if (this.level < this.maxLevel) this.level++;
    if (this.level === 1 && !state.playerWeapons.find(w => w.id === this.id)) {
        state.playerWeapons.push(this);
        this.createMesh?.(this);
    } else {
        this.updateMesh?.(this);
    }
    checkEvolution(this);
    updateWeaponUI();
}

export function defaultGetUpgradeDescription() {
    const name = `${this.name} ${this.icon}`;
    if (this.isEvolved) return `${name} (EVOLVED)`;
    if (this.level === 0) return `Acquire ${name}`;
    if (this.level >= this.maxLevel) return `${name} (Max Level)`;
    return `Upgrade ${name} (Lvl ${this.level + 1})`;
}

export function defaultItemApplyUpgrade() {
    if (this.level < this.maxLevel) this.level++;
    if (this.level === 1 && !state.playerItems.find(i => i.id === this.id)) {
        state.playerItems.push(this);
    }
    recalculatePlayerStats();
    updateItemUI();
    state.playerWeapons.forEach(w => checkEvolution(w));
}

export function defaultItemGetUpgradeDescription() {
    const name = `${this.name} ${this.icon}`;
    if (this.level === 0) return `Acquire ${name}`;
    if (this.level >= this.maxLevel) return `${name} (Max Level)`;
    return `Upgrade ${name} (Lvl ${this.level + 1})`;
}

export function openGeometricCache(cacheMesh) {
    if (!cacheMesh || cacheMesh.userData.isOpeningCache) return;
    playSoundSynth('cache_open', 0.5);
    cacheMesh.userData.isOpeningCache = true;
    cacheMesh.userData.openAnimationTimer = 0;
    cacheMesh.userData.openAnimationDuration = 0.8;
}

export function grantCacheRewards(rewardCount = 1, rarityName = 'Rare') {
    // Haptic feedback for chest opening
    triggerHaptic('success');

    // Pause the game
    state.previousGameState = state.currentGameState;
    state.currentGameState = GameState.CasinoChest;
    state.isPaused = true;

    // Build reward pool with WEIGHTED chances
    // New weapons are 3x more likely than upgrades
    const rewardPool = [];

    // Add upgradeable items (weight: 1x)
    state.playerItems.forEach(item => {
        if (item.level < item.maxLevel) {
            rewardPool.push({ type: 'item_upgrade', data: item, icon: item.icon, name: item.name });
        }
    });

    // Add upgradeable weapons (weight: 1x)
    state.playerWeapons.forEach(weapon => {
        if (weapon.level > 0 && weapon.level < weapon.maxLevel && !weapon.isEvolved) {
            rewardPool.push({ type: 'weapon_upgrade', data: weapon, icon: weapon.icon, name: weapon.name });
        }
    });

    // Add NEW weapons player doesn't have yet (weight: 3x - more likely!)
    if (state.playerWeapons.length < CONSTANTS.MAX_WEAPONS) {
        Object.values(WEAPONS).forEach(weapon => {
            const isAlreadyOwned = state.playerWeapons.some(pw => pw.id === weapon.id);
            if (!isAlreadyOwned && weapon.level === 0) {
                const newWeaponEntry = { type: 'weapon_unlock', data: weapon, icon: weapon.icon, name: `NEW: ${weapon.name}` };
                rewardPool.push(newWeaponEntry); // Add 3 times for 3x weight
                rewardPool.push(newWeaponEntry);
                rewardPool.push(newWeaponEntry);
            }
        });
    }

    // Ensure we have something to show (fallback)
    if (rewardPool.length === 0) {
        rewardPool.push({ type: 'bonus_xp', icon: '⭐', name: 'Bonus XP' });
    }

    // Select rewards (avoiding duplicates)
    const selectedRewards = [];
    const usedWeapons = new Set();
    for (let i = 0; i < rewardCount && rewardPool.length > 0; i++) {
        let attempts = 0;
        let idx, reward;
        do {
            idx = Math.floor(Math.random() * rewardPool.length);
            reward = rewardPool[idx];
            attempts++;
        } while (usedWeapons.has(reward.data?.id || reward.name) && attempts < 20);

        usedWeapons.add(reward.data?.id || reward.name);
        selectedRewards.push(reward);
        // Remove all instances of this reward from pool
        for (let j = rewardPool.length - 1; j >= 0; j--) {
            if (rewardPool[j].data?.id === reward.data?.id || rewardPool[j].name === reward.name) {
                rewardPool.splice(j, 1);
            }
        }
    }

    // Show casino overlay (Desktop)
    ui.chestCasinoOverlay.style.display = 'flex';
    ui.casinoRarityBanner.textContent = rarityName.toUpperCase();
    ui.casinoRarityBanner.className = rarityName.toLowerCase();

    // Store state for Mobile UI
    state.casinoState = {
        rewards: selectedRewards.map(r => ({ ...r, icon: r.icon || r.data?.icon, name: r.name || r.data?.name })),
        rarity: rarityName,
        startTime: Date.now(),
        count: rewardCount,
        spinDuration: 2500 // Base spin duration
    };

    ui.casinoRewardsDisplay.innerHTML = '';
    ui.casinoContinueBtn.style.display = 'none';

    // Setup slot reels with spinning items
    const slots = ui.casinoSlotsContainer.querySelectorAll('.casino-slot');
    const visibleSlots = Math.min(rewardCount, 5);

    slots.forEach((slot, i) => {
        if (i < visibleSlots) {
            slot.style.display = 'block';
            slot.classList.remove('stopped');
            const reel = slot.querySelector('.slot-reel');
            reel.innerHTML = '';

            // Add spinning items (random from pool + final reward)
            const spinItems = [];
            for (let j = 0; j < 20; j++) {
                const randomReward = rewardPool.length > 0
                    ? rewardPool[Math.floor(Math.random() * rewardPool.length)]
                    : selectedRewards[i] || selectedRewards[0];
                spinItems.push(randomReward);
            }
            spinItems.push(selectedRewards[i] || selectedRewards[0]); // Final item

            spinItems.forEach(item => {
                const slotItem = document.createElement('div');
                slotItem.className = 'slot-item';
                slotItem.innerHTML = `<span>${item.icon || '?'}</span><span class="slot-name">${item.name || ''}</span>`;
                reel.appendChild(slotItem);
            });

            // Animate the spin
            reel.style.transform = 'translateY(0)';
            const slotHeight = 130; // Must match CSS .slot-item height
            const targetY = -(spinItems.length - 1) * slotHeight;
            const spinDuration = 2000 + i * 500; // Stagger stops

            setTimeout(() => {
                reel.style.transition = `transform ${spinDuration}ms cubic-bezier(0.12, 0, 0.39, 0)`;
                reel.style.transform = `translateY(${targetY}px)`;
            }, 100);

            // Stop animation
            setTimeout(() => {
                slot.classList.add('stopped');

                // Apply the reward directly (no display needed, already shown in slot)
                const reward = selectedRewards[i] || selectedRewards[0];
                applyUpgradeLogic(reward);
            }, spinDuration + 200);
        } else {
            slot.style.display = 'none';
        }
    });

    // Show continue button after all spins complete
    const totalDuration = 2000 + (visibleSlots - 1) * 500 + 500;
    setTimeout(() => {
        ui.casinoContinueBtn.style.display = 'block';
    }, totalDuration);
}

// Bind casino continue button
if (ui.casinoContinueBtn) {
    ui.casinoContinueBtn.onclick = () => {
        ui.chestCasinoOverlay.style.display = 'none';
        state.currentGameState = GameState.Playing;
        state.isPaused = false;
        updateWeaponUI();
        updateItemUI();
    };
}

function showUpgradeMenu() {
    state.previousMenuState = state.currentGameState;
    state.currentGameState = GameState.UpgradeMenu;
    ui.mainMenu.style.display = 'none';
    ui.upgradeMenu.style.display = 'flex';
    populateUpgradeMenu();
    updateJoystickVisibility();
}

function hideUpgradeMenu() {
    ui.upgradeMenu.style.display = 'none';
    state.currentGameState = state.previousMenuState;
    if (state.currentGameState === GameState.MainMenu) {
        ui.mainMenu.style.display = 'flex';
    }
    updateJoystickVisibility();
}

function applyMetaUpgradesAndReturn() {
    applyMetaUpgradesToGame();
    saveData();
    hideUpgradeMenu();
}

function populateUpgradeMenu() {
    ui.coresAmount.textContent = state.dataCores;
    ui.metaUpgradeList.innerHTML = '';
    for (const key in metaUpgrades) {
        const upgrade = metaUpgrades[key];
        const cost = calculateMetaUpgradeCost(key);
        const entryDiv = document.createElement('div');
        entryDiv.classList.add('upgrade-stat-entry');
        entryDiv.innerHTML = `<span>${upgrade.name} (Lvl ${upgrade.level}/${upgrade.maxLevel})</span><div><span>${upgrade.level < upgrade.maxLevel ? `Cost: <strong>${cost}</strong>` : `<strong style="color: #aaffaa;">MAX</strong>`}</span><button data-key="${key}" ${upgrade.level >= upgrade.maxLevel || state.dataCores < cost ? 'disabled' : ''}>Upgrade</button></div>`;
        ui.metaUpgradeList.appendChild(entryDiv);
    }
    ui.metaUpgradeList.querySelectorAll('button').forEach(button => {
        button.onclick = () => buyMetaUpgrade(button.dataset.key);
    });
}

/**
 * Checks for all available permanent upgrades (weapons/items).
 * @returns {Array} A list of available upgrade wrapper objects.
 */
function getAvailableUpgrades() {
    const availableUpgrades = [];

    // Check for weapon upgrades
    state.playerWeapons.forEach(w => {
        if (!w.isEvolved && w.level < w.maxLevel) {
            availableUpgrades.push({ type: 'weapon_upgrade', data: w });
        }
    });

    // Check for item upgrades
    state.playerItems.forEach(i => {
        if (i.level < i.maxLevel) {
            availableUpgrades.push({ type: 'item_upgrade', data: i });
        }
    });

    // Check for new weapon unlocks
    if (state.playerWeapons.length < CONSTANTS.MAX_WEAPONS) {
        Object.values(WEAPONS).forEach(w => {
            if (w.level === 0) {
                availableUpgrades.push({ type: 'weapon_unlock', data: w });
            }
        });
    }

    // Check for new item unlocks
    if (state.playerItems.length < CONSTANTS.MAX_ITEMS) {
        Object.values(ITEMS).forEach(i => {
            if (i.level === 0) {
                availableUpgrades.push({ type: 'item_unlock', data: i });
            }
        });
    }

    return availableUpgrades;
}

function calculateMetaUpgradeCost(upgradeKey) {
    const upgrade = metaUpgrades[upgradeKey];
    if (!upgrade || upgrade.level >= upgrade.maxLevel) return Infinity;
    return Math.floor(upgrade.costBase * Math.pow(upgrade.costIncrease, upgrade.level));
}

function buyMetaUpgrade(upgradeKey) {
    const upgrade = metaUpgrades[upgradeKey];
    const cost = calculateMetaUpgradeCost(upgradeKey);
    if (upgrade && state.dataCores >= cost && upgrade.level < upgrade.maxLevel) {
        state.dataCores -= cost;
        upgrade.level++;
        playSoundSynth('upgrade_buy', 0.4);
        populateUpgradeMenu();
    } else {
        playSoundSynth('error', 0.3);
    }
}