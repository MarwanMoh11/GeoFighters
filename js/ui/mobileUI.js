/**
 * GeoFighters Canvas-Based Mobile UI System
 * Renders UI directly on 2D canvas - bypasses HTML/CSS entirely
 */

import { state, GameState } from '../state.js';

// =============================================================================
// CANVAS SETUP
// =============================================================================

let canvas = null;
let ctx = null;
let uiElements = [];
let activeScreen = null;

// Design tokens
const COLORS = {
    bg: 'rgba(3, 5, 16, 0.95)',
    bgLight: 'rgba(20, 30, 50, 0.95)',
    primary: '#00ffff',
    primaryDim: 'rgba(0, 255, 255, 0.5)',
    secondary: '#ff6b6b',
    gold: '#ffd700',
    text: '#ffffff',
    textDim: 'rgba(255, 255, 255, 0.7)',
    success: '#4ade80',
    danger: '#ef4444',
    buttonBg: 'linear-gradient(135deg, #1a2a4a, #0d1a30)',
    buttonHover: 'rgba(0, 255, 255, 0.2)',
};

const FONTS = {
    title: 'bold 28px "Titillium Web", sans-serif',
    heading: 'bold 20px "Titillium Web", sans-serif',
    body: '16px "Titillium Web", sans-serif',
    small: '12px "Titillium Web", sans-serif',
    tiny: '10px "Roboto Mono", monospace',
};

// Safe area insets (will be detected)
let safeArea = { top: 0, right: 0, bottom: 0, left: 0 };

// =============================================================================
// INITIALIZATION
// =============================================================================

export function initMobileUI() {
    if (!state.isTouchDevice) return;

    // Create canvas overlay
    canvas = document.createElement('canvas');
    canvas.id = 'mobile-ui-canvas';
    canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 5000;
        pointer-events: auto;
        touch-action: none;
    `;
    document.body.appendChild(canvas);

    ctx = canvas.getContext('2d');

    // Handle resize
    resizeCanvas();
    window.addEventListener('resize', () => {
        resizeCanvas();
        // Re-render current screen after resize
        if (activeScreen) {
            showScreen(activeScreen);
        }
    });

    // Touch events
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Detect safe area
    detectSafeArea();

    // Hide HTML UI elements on mobile
    hideHTMLUI();

    // Show initial main menu
    showScreen('mainMenu');

    console.log('[MobileUI] Canvas UI initialized with main menu');
}

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function detectSafeArea() {
    // Try to get safe area from CSS env()
    const div = document.createElement('div');
    div.style.cssText = `
        position: fixed;
        top: env(safe-area-inset-top, 0px);
        right: env(safe-area-inset-right, 0px);
        bottom: env(safe-area-inset-bottom, 0px);
        left: env(safe-area-inset-left, 0px);
    `;
    document.body.appendChild(div);
    const computed = getComputedStyle(div);
    safeArea.top = parseInt(computed.top) || 20;
    safeArea.right = parseInt(computed.right) || 0;
    safeArea.bottom = parseInt(computed.bottom) || 0;
    safeArea.left = parseInt(computed.left) || 0;
    document.body.removeChild(div);
}

function hideHTMLUI() {
    // Hide all HTML menus and overlays on mobile
    const elementsToHide = [
        '#mainMenu', '#upgradeMenu', '#levelSelectMenu', '#pauseMenu',
        '#settingsMenu', '#evolutionBookMenu', '#gameOver', '#winScreen',
        '#levelUpScreen', '#chestCasinoOverlay', '#gameUi'
    ];
    elementsToHide.forEach(selector => {
        const el = document.querySelector(selector);
        if (el) el.style.display = 'none';
    });
}

// =============================================================================
// TOUCH HANDLING
// =============================================================================

let touchStartPos = { x: 0, y: 0 };

function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    touchStartPos = { x: touch.clientX, y: touch.clientY };

    console.log('[MobileUI] Touch START at:', touchStartPos);
    console.log('[MobileUI] UI Elements count:', uiElements.length);

    // Highlight pressed buttons
    uiElements.forEach((el, i) => {
        if (el.type === 'button') {
            const hit = isPointInRect(touchStartPos, el.bounds);
            console.log(`[MobileUI] Button ${i} "${el.text}" bounds:`, el.bounds, 'hit:', hit);
            if (hit) {
                el.pressed = true;
            }
        }
    });

    render();
}

function handleTouchEnd(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const endPos = { x: touch.clientX, y: touch.clientY };

    console.log('[MobileUI] Touch END at:', endPos);

    // Check for button taps
    uiElements.forEach((el, i) => {
        el.pressed = false;
        if (el.type === 'button') {
            const hit = isPointInRect(endPos, el.bounds);
            console.log(`[MobileUI] Button ${i} "${el.text}" hit:`, hit, 'hasOnClick:', !!el.onClick);
            if (hit && el.onClick) {
                console.log('[MobileUI] EXECUTING onClick for:', el.text);
                triggerHaptic();
                el.onClick();
            }
        }
    });

    render();
}

function isPointInRect(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.width &&
        point.y >= rect.y && point.y <= rect.y + rect.height;
}

function triggerHaptic() {
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

// =============================================================================
// UI COMPONENTS
// =============================================================================

export function createButton(text, x, y, width, height, onClick) {
    const button = {
        type: 'button',
        text,
        bounds: { x, y, width, height },
        onClick,
        pressed: false,
    };
    uiElements.push(button);
    console.log('[MobileUI] Created button:', text, 'at', { x, y, width, height });
    return button;
}

export function createText(text, x, y, font, color, align = 'left') {
    const textEl = {
        type: 'text',
        text,
        x, y,
        font,
        color,
        align,
    };
    uiElements.push(textEl);
    return textEl;
}

export function clearUI() {
    uiElements = [];
}

// =============================================================================
// RENDERING
// =============================================================================

export function render() {
    if (!ctx) return;

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // Render based on current screen
    switch (activeScreen) {
        case 'mainMenu':
            renderMainMenu(w, h);
            break;
        case 'playing':
            renderHUD(w, h);
            break;
        case 'paused':
            renderPauseMenu(w, h);
            break;
        case 'levelUp':
            renderLevelUpScreen(w, h);
            break;
        case 'gameOver':
            renderGameOver(w, h);
            break;
        case 'casino':
            renderCasino(w, h);
            break;
        case 'levelSelect':
            renderLevelSelect(w, h);
            break;
    }

    // Render all UI elements
    uiElements.forEach(el => {
        if (el.type === 'button') renderButton(el);
        if (el.type === 'text') renderText(el);
    });
}

function renderButton(button) {
    const { bounds, text, pressed } = button;
    const { x, y, width, height } = bounds;

    // Button background
    ctx.fillStyle = pressed ? 'rgba(0, 255, 255, 0.3)' : 'rgba(20, 40, 70, 0.9)';
    ctx.strokeStyle = COLORS.primary;
    ctx.lineWidth = 2;

    // Rounded rectangle
    const radius = 12;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fill();
    ctx.stroke();

    // Button text
    ctx.fillStyle = COLORS.text;
    ctx.font = FONTS.body;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + width / 2, y + height / 2);
}

function renderText(textEl) {
    ctx.fillStyle = textEl.color;
    ctx.font = textEl.font;
    ctx.textAlign = textEl.align;
    ctx.textBaseline = 'middle';
    ctx.fillText(textEl.text, textEl.x, textEl.y);
}

// =============================================================================
// SCREENS
// =============================================================================

function renderMainMenu(w, h) {
    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = COLORS.primary;
    ctx.font = FONTS.title;
    ctx.textAlign = 'center';
    ctx.fillText('GEOMETRY FIGHTERS', w / 2, h * 0.2);

    // Version
    ctx.fillStyle = COLORS.textDim;
    ctx.font = FONTS.small;
    ctx.fillText('Mobile Edition', w / 2, h * 0.26);
}

function renderHUD(w, h) {
    // Only render HUD elements, not background
    const top = safeArea.top + 10;

    // XP Bar
    const xpBarWidth = w - 40;
    const xpPercent = state.currentXP / state.xpToNextLevel;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(20, top, xpBarWidth, 8);

    ctx.fillStyle = COLORS.primary;
    ctx.fillRect(20, top, xpBarWidth * xpPercent, 8);

    // Level badge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(20, top + 14, 40, 18);
    ctx.fillStyle = COLORS.primary;
    ctx.font = FONTS.tiny;
    ctx.textAlign = 'center';
    ctx.fillText(`LV ${state.playerLevel}`, 40, top + 23);

    // Timer (center)
    ctx.fillStyle = COLORS.text;
    ctx.font = FONTS.body;
    ctx.textAlign = 'center';
    const mins = Math.floor(state.gameTime / 60);
    const secs = Math.floor(state.gameTime % 60);
    ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, w / 2, top + 20);

    // Health bar (left of timer)
    const healthPercent = state.playerShield / state.MAX_PLAYER_SHIELD;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(w / 2 - 80, top + 12, 50, 8);
    ctx.fillStyle = healthPercent > 0.3 ? COLORS.success : COLORS.danger;
    ctx.fillRect(w / 2 - 80, top + 12, 50 * healthPercent, 8);

    // Pause button (top right)
    const pauseX = w - safeArea.right - 50;
    const pauseY = top + 5;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.strokeStyle = COLORS.primaryDim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(pauseX, pauseY, 40, 40, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = FONTS.heading;
    ctx.textAlign = 'center';
    ctx.fillText('⏸', pauseX + 20, pauseY + 22);
}

function renderPauseMenu(w, h) {
    // Dim background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = COLORS.text;
    ctx.font = FONTS.title;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', w / 2, h * 0.3);
}

function renderLevelUpScreen(w, h) {
    // Dim background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = COLORS.gold;
    ctx.font = FONTS.title;
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL UP!', w / 2, h * 0.15);
}

function renderGameOver(w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = COLORS.danger;
    ctx.font = FONTS.title;
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', w / 2, h * 0.3);

    ctx.fillStyle = COLORS.text;
    ctx.font = FONTS.heading;
    ctx.fillText(`Score: ${state.score}`, w / 2, h * 0.4);
}

function renderCasino(w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = COLORS.gold;
    ctx.font = FONTS.title;
    ctx.textAlign = 'center';
    ctx.fillText('CHEST OPENED!', w / 2, h * 0.2);
}

function renderLevelSelect(w, h) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = COLORS.text;
    ctx.font = FONTS.title;
    ctx.textAlign = 'center';
    ctx.fillText('SELECT LEVEL', w / 2, h * 0.15);
}

// =============================================================================
// SCREEN MANAGEMENT
// =============================================================================

export function showScreen(screenName) {
    activeScreen = screenName;
    clearUI();

    const w = window.innerWidth;
    const h = window.innerHeight;
    const centerX = w / 2;
    const buttonWidth = Math.min(260, w * 0.8);
    const buttonX = centerX - buttonWidth / 2;

    switch (screenName) {
        case 'mainMenu':
            createButton('START GAME', buttonX, h * 0.4, buttonWidth, 54, () => {
                showScreen('levelSelect');
            });
            createButton('UPGRADES', buttonX, h * 0.5, buttonWidth, 54, () => {
                // Show upgrades menu
            });
            createButton('SETTINGS', buttonX, h * 0.6, buttonWidth, 54, () => {
                // Show settings
            });
            break;

        case 'paused':
            createButton('RESUME', buttonX, h * 0.45, buttonWidth, 54, () => {
                import('../ui/manager.js').then(m => m.resumeGame());
                showScreen('playing');
            });
            createButton('QUIT', buttonX, h * 0.55, buttonWidth, 54, () => {
                import('../ui/manager.js').then(m => m.quitToMainMenu());
                showScreen('mainMenu');
            });
            break;

        case 'gameOver':
            createButton('RETURN TO MENU', buttonX, h * 0.6, buttonWidth, 54, () => {
                import('../ui/manager.js').then(m => m.quitToMainMenu());
                showScreen('mainMenu');
            });
            break;

        case 'levelSelect':
            createButton('LEVEL 1', buttonX, h * 0.35, buttonWidth, 50, () => {
                import('../ui/manager.js').then(m => m.startGame(1));
                showScreen('playing');
            });
            createButton('LEVEL 2', buttonX, h * 0.45, buttonWidth, 50, () => {
                import('../ui/manager.js').then(m => m.startGame(2));
                showScreen('playing');
            });
            createButton('BACK', buttonX, h * 0.7, buttonWidth, 50, () => {
                showScreen('mainMenu');
            });
            break;
    }

    render();
}

// =============================================================================
// GAME STATE SYNC
// =============================================================================

export function syncWithGameState() {
    if (!state.isTouchDevice || !canvas) return;

    switch (state.currentGameState) {
        case GameState.MainMenu:
            if (activeScreen !== 'mainMenu') showScreen('mainMenu');
            break;
        case GameState.Playing:
            if (!state.isPaused) {
                if (activeScreen !== 'playing') showScreen('playing');
            }
            break;
        case GameState.Paused:
            if (activeScreen !== 'paused') showScreen('paused');
            break;
        case GameState.LevelUp:
            if (activeScreen !== 'levelUp') showScreen('levelUp');
            break;
        case GameState.GameOver:
            if (activeScreen !== 'gameOver') showScreen('gameOver');
            break;
        case GameState.CasinoChest:
            if (activeScreen !== 'casino') showScreen('casino');
            break;
        case GameState.LevelSelect:
            if (activeScreen !== 'levelSelect') showScreen('levelSelect');
            break;
    }

    // Always re-render HUD when playing
    if (activeScreen === 'playing') {
        render();
    }
}

// =============================================================================
// EXPORT
// =============================================================================

export { canvas, ctx, safeArea };
