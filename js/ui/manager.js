import { state, GameState, CONSTANTS, resetGameState } from '../state.js';
import { ui } from './dom.js';
import { gameLevels } from '../config/levels.js';
import { ITEMS, GENERIC_UPGRADES, metaUpgrades } from '../config/items.js';
import { WEAPONS, EVOLVED_WEAPONS } from '../config/weapons.js';
import { saveData, applyMetaUpgradesToGame } from '../utils/saveLoad.js';
import { initializeAudio, playSoundSynth } from '../utils/audio.js';
import { toggleFullScreen } from '../utils/input.js';
import { checkEvolution } from '../game/evolution.js';
// NOTE: We no longer import from player.js to avoid circular dependencies.
// The necessary functions (recalculatePlayerStats) will be imported where needed.
import { recalculatePlayerStats } from '../game/player.js';

// --- Event Binding ---
export function bindUIEvents() {
    ui.startSimulationButton.onclick = showLevelSelect;
    ui.metaUpgradesButton.onclick = showUpgradeMenu;
    ui.settingsButtonMain.onclick = () => showSettings('MainMenu');
    ui.applyMetaUpgradesButton.onclick = applyMetaUpgradesAndReturn;
    ui.levelSelectBackButton.onclick = hideLevelSelect;
    ui.resumeButton.onclick = resumeGame;
    ui.evolutionsButton.onclick = showEvolutionBook;
    ui.settingsButtonPaused.onclick = () => showSettings('Paused');
    ui.exitSimulationButton.onclick = quitToMainMenu;
    ui.settingsBackButton.onclick = hideSettings;
    ui.evolutionBookBackButton.onclick = hideEvolutionBook;
    ui.gameOverReturnButton.onclick = quitToMainMenu;
    ui.winScreenReturnButton.onclick = quitToMainMenu;
    ui.fullscreenButton.onclick = toggleFullScreen;
}

// --- Game Flow & State Management ---

export function startGame(levelId) {
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

    clearDynamicSceneObjects();

    Object.values(WEAPONS).forEach(w => { w.level = 0; w.isEvolved = false; w.fireTimer = 0; });
    Object.values(ITEMS).forEach(i => { i.level = 0; });

    if (state.player) state.player.position.set(0, CONSTANTS.PLAYER_HEIGHT / 2, 0);

    selectedLevelData.mapSetup?.();

    // Start with a default weapon by directly calling the apply logic
    if (WEAPONS.VECTOR_LANCE) {
        defaultApplyUpgrade.call(WEAPONS.VECTOR_LANCE);
    }

    recalculatePlayerStats();
    updateUI();
    updateItemUI();

    Object.values(ui).forEach(element => {
        if (element.classList?.contains('menu-overlay') || element.classList?.contains('popup-overlay')) {
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
        if (element.classList?.contains('menu-overlay') || element.classList?.contains('popup-overlay') || element.id === 'gameUi') {
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

export function updateUI() {
    ui.shield.textContent = Math.max(0, state.playerShield).toFixed(0);
    ui.score.textContent = state.score;
    ui.shapeCount.textContent = state.shapes.length;
    ui.levelText.textContent = `Level: ${state.playerLevel}`;
    ui.xpBarFill.style.width = `${Math.min(1, state.currentXP / state.xpToNextLevel) * 100}%`;
    const totalSeconds = Math.floor(state.gameTime);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    ui.timer.textContent = `${minutes}:${seconds}`;
}

export function updateWeaponUI() {
    ui.weaponIndicator.innerHTML = '';
    state.playerWeapons.forEach(weapon => {
        if (weapon.level > 0) {
            const iconDiv = document.createElement('div');
            iconDiv.classList.add('icon-display');
            if (weapon.isEvolved) iconDiv.classList.add('evolved');
            iconDiv.innerHTML = `<span>${weapon.icon || '?'}</span> <span>${weapon.isEvolved ? 'EVO' : 'L' + weapon.level}</span>`;
            ui.weaponIndicator.appendChild(iconDiv);
        }
    });
}

export function updateItemUI() {
    ui.itemIndicator.innerHTML = '';
    state.playerItems.forEach(item => {
        if (item.level > 0) {
            const iconDiv = document.createElement('div');
            iconDiv.classList.add('icon-display');
            iconDiv.innerHTML = `<span>${item.icon || '?'}</span> <span>L${item.level}</span>`;
            ui.itemIndicator.appendChild(iconDiv);
        }
    });
}

export function updateJoystickVisibility() {
    const showMovement = state.isTouchDevice && state.currentGameState === GameState.Playing && !state.isPaused;
    ui.joystickArea.style.display = showMovement ? 'block' : 'none';
    const showButton = (state.isTouchDevice && (state.currentGameState === GameState.Playing || state.currentGameState === GameState.Paused)) || !state.isTouchDevice;
    ui.fullscreenButton.style.display = showButton ? 'block' : 'none';
    if (showButton) {
        if (state.isTouchDevice) {
            ui.fullscreenButton.textContent = (state.currentGameState === GameState.Playing && !state.isPaused) ? "☰" : "▶";
        } else {
            ui.fullscreenButton.textContent = document.fullscreenElement ? "Exit FS" : "Fullscreen";
        }
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


// Change the function signature to accept the list
function presentUpgradeOptions(permanentUpgrades, count = 3) {
    ui.upgradeOptions.innerHTML = '';

    // --- MODIFICATION START ---
    // We already have the permanent upgrades.
    // We just need to add the generic ones back into the pool for selection.
    const allAvailableUpgrades = [...permanentUpgrades];
    Object.values(GENERIC_UPGRADES).forEach(u => allAvailableUpgrades.push({ type: 'generic_upgrade', data: u }));
    // --- MODIFICATION END ---

    // The rest of the function is the same, but uses `allAvailableUpgrades`
    const optionsToShow = allAvailableUpgrades.sort(() => 0.5 - Math.random()).slice(0, count);

    optionsToShow.forEach(optionWrapper => {
        const option = optionWrapper.data;
        const button = document.createElement('button');
        let description;
        if(optionWrapper.type.includes('weapon')) description = defaultGetUpgradeDescription.call(option);
        else if(optionWrapper.type.includes('item')) description = defaultItemGetUpgradeDescription.call(option);
        else description = `${option.name} ${option.icon || ''}`;

        button.innerHTML = description;
        button.onclick = () => selectUpgrade(optionWrapper);
        const descElement = document.createElement('p');
        descElement.textContent = option.shortDescription || '';
        const optionDiv = document.createElement('div');
        optionDiv.appendChild(button);
        optionDiv.appendChild(descElement);
        ui.upgradeOptions.appendChild(optionDiv);
    });
}


function selectUpgrade(selectedOptionWrapper) {
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

export function grantCacheRewards() {
    const rewards = [];
    // const numRewards = 1 + Math.floor(Math.random() * 2);
    const potentialRewards = [];
    state.playerItems.forEach(i => { if (i.level < i.maxLevel) potentialRewards.push({ type: 'item_upgrade', data: i }); });
    if(potentialRewards.length > 0) rewards.push(potentialRewards[Math.floor(Math.random() * potentialRewards.length)]);

    ui.cacheRewardsList.innerHTML = '';
    rewards.forEach(reward => {
        const rewardSpan = document.createElement('span');
        rewardSpan.textContent = reward.data.icon || '?';
        ui.cacheRewardsList.appendChild(rewardSpan);
        applyUpgradeLogic(reward);
    });
    ui.cacheRewardPopup.style.display = 'block';
    setTimeout(() => { ui.cacheRewardPopup.style.display = 'none'; }, 2500);
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
        entryDiv.innerHTML = `<span>${upgrade.name} (Lvl ${upgrade.level}/${upgrade.maxLevel})</span><div><span>${upgrade.level<upgrade.maxLevel?`Cost: <strong>${cost}</strong>`:`<strong style="color: #aaffaa;">MAX</strong>`}</span><button data-key="${key}" ${upgrade.level>=upgrade.maxLevel||state.dataCores<cost?'disabled':''}>Upgrade</button></div>`;
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