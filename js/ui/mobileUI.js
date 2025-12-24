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
let manualScreenOverride = false; // Prevents syncWithGameState from resetting manually set screens

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
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

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
    // Hide ALL HTML UI elements on mobile - be very aggressive
    const elementsToHide = [
        '#mainMenu', '#upgradeMenu', '#levelSelectMenu', '#pauseMenu',
        '#settingsMenu', '#evolutionBookMenu', '#gameOver', '#winScreen',
        '#levelUpScreen', '#chestCasinoOverlay', '#gameUi',
        '.menu-overlay', '.popup-overlay', '#hud-xp-container',
        '#hud-stats-row', '#hud-bottom-left', '#hud-bottom-right',
        '#fullscreen-button', '#joystick-area', '#loading-overlay',
        '#tap-to-start-overlay'
    ];

    elementsToHide.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
            el.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important;';
        });
    });

    // Add a style tag to ensure HTML UI stays hidden
    if (!document.getElementById('mobile-ui-hide-style')) {
        const style = document.createElement('style');
        style.id = 'mobile-ui-hide-style';
        style.textContent = `
            @media (max-width: 1024px) {
                .menu-overlay, .popup-overlay, #mainMenu, #upgradeMenu,
                #levelSelectMenu, #pauseMenu, #settingsMenu, #evolutionBookMenu,
                #gameOver, #winScreen, #levelUpScreen, #chestCasinoOverlay,
                #gameUi, #hud-xp-container, #hud-stats-row, #hud-bottom-left,
                #hud-bottom-right, #fullscreen-button, #loading-overlay,
                #tap-to-start-overlay {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    console.log('[MobileUI] HTML UI hidden');
}

// =============================================================================
// TOUCH HANDLING - Floating Joystick
// =============================================================================

let touchStartPos = { x: 0, y: 0 };
let joystickTouch = null; // Track joystick touch separately
let joystickCenter = { x: 0, y: 0 }; // Dynamic - spawns at touch location
const JOYSTICK_RADIUS = 50;

function isButtonTouch(pos) {
    // Check if touch is on any button
    return uiElements.some(el => el.type === 'button' && isPointInRect(pos, el.bounds));
}

function handleTouchStart(e) {
    e.preventDefault();

    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        const pos = { x: touch.clientX, y: touch.clientY };

        // First check for button presses
        let hitButton = false;
        uiElements.forEach((el) => {
            if (el.type === 'button' && isPointInRect(pos, el.bounds)) {
                el.pressed = true;
                hitButton = true;
            }
        });

        if (hitButton) continue;

        // If not a button and playing, this starts the joystick at touch location
        if (activeScreen === 'playing' && !joystickTouch) {
            joystickTouch = {
                id: touch.identifier,
                startX: pos.x,
                startY: pos.y
            };
            // Joystick center IS where you touched
            joystickCenter = { x: pos.x, y: pos.y };
            state.joystickVector = { x: 0, y: 0 };
        }
    }

    render();
}

function handleTouchMove(e) {
    e.preventDefault();

    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];

        // Handle joystick movement
        if (joystickTouch && touch.identifier === joystickTouch.id) {
            const dx = touch.clientX - joystickCenter.x;
            const dy = touch.clientY - joystickCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const maxDistance = JOYSTICK_RADIUS;

            // Normalize and clamp
            let normX = dx / maxDistance;
            let normY = dy / maxDistance;

            if (distance > maxDistance) {
                normX = dx / distance;
                normY = dy / distance;
            }

            // Clamp to -1 to 1
            normX = Math.max(-1, Math.min(1, normX));
            normY = Math.max(-1, Math.min(1, normY));

            // Update state for movement
            state.joystickVector = { x: normX, y: normY };
            state.moveDirection = { x: normX, y: -normY }; // Invert Y for game coordinates
        }
    }

    if (activeScreen === 'playing') {
        render();
    }
}

function handleTouchEnd(e) {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const endPos = { x: touch.clientX, y: touch.clientY };

        // Check if joystick touch ended
        if (joystickTouch && touch.identifier === joystickTouch.id) {
            joystickTouch = null;
            state.joystickVector = { x: 0, y: 0 };
            state.moveDirection = { x: 0, y: 0 };
            continue;
        }

        // Check for button taps
        uiElements.forEach((el) => {
            el.pressed = false;
            if (el.type === 'button' && isPointInRect(endPos, el.bounds)) {
                if (el.onClick) {
                    triggerHaptic();
                    el.onClick();
                }
            }
        });
    }

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
        case 'settings':
            renderSettings(w, h);
            break;
        case 'upgrades':
            renderUpgrades(w, h);
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
    const top = safeArea.top + 8;

    // === XP BAR (full width at top) ===
    const xpBarWidth = w - 20;
    const xpPercent = (state.currentXP || 0) / (state.xpToNextLevel || 100);

    // XP bar background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(10, top, xpBarWidth, 10, 5);
    ctx.fill();

    // XP bar fill with gradient
    const xpGradient = ctx.createLinearGradient(10, 0, 10 + xpBarWidth, 0);
    xpGradient.addColorStop(0, '#00ffff');
    xpGradient.addColorStop(1, '#00ff88');
    ctx.fillStyle = xpGradient;
    ctx.beginPath();
    ctx.roundRect(10, top, xpBarWidth * Math.min(xpPercent, 1), 10, 5);
    ctx.fill();

    // Level badge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.beginPath();
    ctx.roundRect(10, top + 14, 36, 16, 4);
    ctx.fill();
    ctx.fillStyle = COLORS.primary;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`LV ${state.playerLevel || 1}`, 28, top + 23);

    // === STATS ROW ===
    const statsY = top + 16;

    // Health icon + bar
    ctx.fillStyle = COLORS.text;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('❤️', 55, statsY + 6);

    const healthPercent = (state.playerShield || 100) / (state.MAX_PLAYER_SHIELD || 100);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(72, statsY, 50, 8, 4);
    ctx.fill();
    ctx.fillStyle = healthPercent > 0.3 ? '#4ade80' : '#ef4444';
    ctx.beginPath();
    ctx.roundRect(72, statsY, 50 * Math.min(healthPercent, 1), 8, 4);
    ctx.fill();

    // Timer (center)
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    const mins = Math.floor((state.gameTime || 0) / 60);
    const secs = Math.floor((state.gameTime || 0) % 60);
    ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, w / 2, statsY + 8);

    // Score (right of timer)
    ctx.fillStyle = COLORS.gold;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`💰 ${state.score || 0}`, w - 55, statsY + 8);

    // === PAUSE BUTTON ===
    const pauseX = w - safeArea.right - 42;
    const pauseY = top + 2;

    // Register pause button for touch
    if (!uiElements.some(el => el.id === 'pauseBtn')) {
        const pauseBtn = {
            id: 'pauseBtn',
            type: 'button',
            text: '',
            bounds: { x: pauseX, y: pauseY, width: 36, height: 36 },
            onClick: () => {
                import('../ui/manager.js').then(m => m.pauseGame());
            },
            pressed: false,
        };
        uiElements.push(pauseBtn);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(pauseX, pauseY, 36, 36, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⏸', pauseX + 18, pauseY + 22);

    // === WEAPON/ITEM SLOTS (bottom corners) ===
    renderSlots(w, h);

    // === JOYSTICK INDICATOR ===
    renderJoystick(w, h);
}

// Render weapon and item slots
function renderSlots(w, h) {
    const bottom = h - safeArea.bottom - 15;
    const slotSize = 20;
    const slotGap = 3;

    // Left side - Weapons
    const leftX = safeArea.left + 8;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(leftX - 2, bottom - 50, 72, 52, 6);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('WEAPONS', leftX, bottom - 54);

    // Draw weapon slots (3x2 grid)
    const weapons = state.playerWeapons || [];
    for (let i = 0; i < 6; i++) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = leftX + col * (slotSize + slotGap);
        const y = bottom - 44 + row * (slotSize + slotGap);

        ctx.fillStyle = weapons[i] ? 'rgba(0, 255, 255, 0.3)' : 'rgba(50, 50, 50, 0.5)';
        ctx.strokeStyle = weapons[i] ? COLORS.primary : 'rgba(100, 100, 100, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, slotSize, slotSize, 3);
        ctx.fill();
        ctx.stroke();

        if (weapons[i]) {
            ctx.fillStyle = COLORS.text;
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(weapons[i].icon || '⚔️', x + slotSize / 2, y + slotSize / 2 + 4);
        }
    }

    // Right side - Items
    const rightX = w - safeArea.right - 78;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(rightX - 2, bottom - 50, 72, 52, 6);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('ITEMS', rightX, bottom - 54);

    // Draw item slots (3x2 grid)
    const items = state.playerItems || [];
    for (let i = 0; i < 6; i++) {
        const row = Math.floor(i / 3);
        const col = i % 3;
        const x = rightX + col * (slotSize + slotGap);
        const y = bottom - 44 + row * (slotSize + slotGap);

        ctx.fillStyle = items[i] ? 'rgba(255, 215, 0, 0.3)' : 'rgba(50, 50, 50, 0.5)';
        ctx.strokeStyle = items[i] ? COLORS.gold : 'rgba(100, 100, 100, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, slotSize, slotSize, 3);
        ctx.fill();
        ctx.stroke();

        if (items[i]) {
            ctx.fillStyle = COLORS.text;
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(items[i].icon || '💎', x + slotSize / 2, y + slotSize / 2 + 4);
        }
    }
}

// Render joystick indicator - only shows when touching
function renderJoystick(w, h) {
    // Only show joystick when actively touching
    if (!joystickTouch) return;

    const joyX = joystickCenter.x;
    const joyY = joystickCenter.y;
    const outerRadius = JOYSTICK_RADIUS;
    const innerRadius = 22;

    // Outer ring (base)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.arc(joyX, joyY, outerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner knob (follows finger)
    const vec = state.joystickVector || { x: 0, y: 0 };
    const knobX = joyX + vec.x * outerRadius * 0.8;
    const knobY = joyY + vec.y * outerRadius * 0.8;

    ctx.fillStyle = 'rgba(0, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(knobX, knobY, innerRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0, 255, 255, 1)';
    ctx.lineWidth = 3;
    ctx.stroke();
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

    // Golden glow
    const gradient = ctx.createRadialGradient(w / 2, h * 0.15, 10, w / 2, h * 0.15, 150);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⬆️ LEVEL UP! ⬆️', w / 2, h * 0.12);

    // Subtitle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '14px sans-serif';
    ctx.fillText('Choose an upgrade', w / 2, h * 0.18);

    // Render upgrade cards from uiElements (created in showScreen)
    const options = state.upgradeOptions || [];
    const buttonWidth = Math.min(260, w * 0.8);
    const buttonX = (w - buttonWidth - 20) / 2;

    options.forEach((option, i) => {
        const yPos = h * (0.25 + i * 0.18);
        const cardHeight = 65;
        const x = buttonX;

        // Card background
        ctx.fillStyle = 'rgba(30, 40, 60, 0.95)';
        ctx.strokeStyle = COLORS.primary;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, yPos, buttonWidth + 20, cardHeight, 12);
        ctx.fill();
        ctx.stroke();

        // Icon
        ctx.fillStyle = COLORS.text;
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(option.icon || '⬆️', x + 30, yPos + cardHeight / 2 + 10);

        // Title
        ctx.fillStyle = COLORS.text;
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(option.name || 'Upgrade', x + 55, yPos + 25);

        // Description
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '11px sans-serif';
        const desc = (option.description || '').substring(0, 35);
        ctx.fillText(desc, x + 55, yPos + 45);
    });
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

// Casino slot animation state
let casinoSlots = [null, null, null];
let casinoAnimating = false;
let casinoAnimationProgress = 0;

function renderCasino(w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.fillRect(0, 0, w, h);

    // Golden glow effect
    const gradient = ctx.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h * 0.4, 200);
    gradient.addColorStop(0, 'rgba(255, 215, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🎰 CHEST OPENED! 🎰', w / 2, h * 0.15);

    // Slot machine container
    const containerWidth = Math.min(280, w * 0.85);
    const containerHeight = 140;
    const containerX = (w - containerWidth) / 2;
    const containerY = h * 0.22;

    ctx.fillStyle = 'rgba(30, 30, 50, 0.9)';
    ctx.strokeStyle = COLORS.gold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(containerX, containerY, containerWidth, containerHeight, 12);
    ctx.fill();
    ctx.stroke();

    // Three slot windows
    const slotWidth = 70;
    const slotHeight = 90;
    const slotGap = 15;
    const totalSlotsWidth = slotWidth * 3 + slotGap * 2;
    const startX = (w - totalSlotsWidth) / 2;
    const slotY = containerY + (containerHeight - slotHeight) / 2;

    for (let i = 0; i < 3; i++) {
        const x = startX + i * (slotWidth + slotGap);

        // Slot background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, slotY, slotWidth, slotHeight, 8);
        ctx.fill();
        ctx.stroke();

        // Slot content
        const item = state.casinoRewards ? state.casinoRewards[i] : null;
        if (item) {
            ctx.fillStyle = COLORS.text;
            ctx.font = '32px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(item.icon || '?', x + slotWidth / 2, slotY + slotHeight / 2 + 12);

            // Item name
            ctx.font = '9px sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            const name = (item.name || 'Item').substring(0, 10);
            ctx.fillText(name, x + slotWidth / 2, slotY + slotHeight - 8);
        } else {
            // Spinning animation
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.font = '28px sans-serif';
            ctx.textAlign = 'center';
            const spinIcons = ['⚔️', '🛡️', '💎', '🔮', '⭐'];
            const iconIndex = Math.floor((Date.now() / 100 + i * 2) % spinIcons.length);
            ctx.fillText(spinIcons[iconIndex], x + slotWidth / 2, slotY + slotHeight / 2 + 10);
        }
    }

    // Rarity banner
    if (state.chestRarity) {
        const rarityColors = {
            'common': '#888888',
            'rare': '#4a90d9',
            'epic': '#9b59b6',
            'legendary': '#f39c12'
        };
        ctx.fillStyle = rarityColors[state.chestRarity] || '#888888';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(state.chestRarity?.toUpperCase() || 'REWARDS', w / 2, containerY + containerHeight + 25);
    }
}

function renderSettings(w, h) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚙️ SETTINGS', w / 2, h * 0.12);

    // Settings options rendered by showScreen buttons
}

function renderUpgrades(w, h) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = COLORS.gold;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💎 META UPGRADES', w / 2, h * 0.1);

    // Currency display
    ctx.fillStyle = COLORS.text;
    ctx.font = '16px sans-serif';
    ctx.fillText(`Coins: ${state.metaCurrency || 0}`, w / 2, h * 0.16);
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

export function showScreen(screenName, isManual = false) {
    activeScreen = screenName;
    clearUI();

    // If this is a manual screen change from a button click, prevent auto-sync
    if (isManual) {
        manualScreenOverride = true;
    }

    console.log('[MobileUI] showScreen:', screenName, 'manual:', isManual);

    const w = window.innerWidth;
    const h = window.innerHeight;
    const centerX = w / 2;
    const buttonWidth = Math.min(260, w * 0.8);
    const buttonX = centerX - buttonWidth / 2;

    switch (screenName) {
        case 'mainMenu':
            manualScreenOverride = false;
            createButton('START GAME', buttonX, h * 0.38, buttonWidth, 52, () => {
                showScreen('levelSelect', true);
            });
            createButton('UPGRADES', buttonX, h * 0.48, buttonWidth, 52, () => {
                showScreen('upgrades', true);
            });
            createButton('SETTINGS', buttonX, h * 0.58, buttonWidth, 52, () => {
                showScreen('settings', true);
            });
            break;

        case 'settings':
            createButton('MUSIC: ON', buttonX, h * 0.25, buttonWidth, 48, () => {
                console.log('[MobileUI] Toggle music');
            });
            createButton('SFX: ON', buttonX, h * 0.33, buttonWidth, 48, () => {
                console.log('[MobileUI] Toggle SFX');
            });
            createButton('HAPTICS: ON', buttonX, h * 0.41, buttonWidth, 48, () => {
                console.log('[MobileUI] Toggle haptics');
            });
            createButton('RESET PROGRESS', buttonX, h * 0.52, buttonWidth, 48, () => {
                if (confirm('Reset all progress?')) {
                    import('../utils/saveLoad.js').then(m => m.resetAllProgress && m.resetAllProgress());
                }
            });
            createButton('BACK', buttonX, h * 0.65, buttonWidth, 48, () => {
                showScreen('mainMenu');
            });
            break;

        case 'upgrades':
            // Upgrade cards will be dynamically generated based on state.metaUpgrades
            const upgrades = [
                { name: 'Max Health', cost: 100, icon: '❤️' },
                { name: 'XP Boost', cost: 150, icon: '⭐' },
                { name: 'Start Weapon', cost: 200, icon: '⚔️' },
            ];

            upgrades.forEach((upgrade, i) => {
                createButton(`${upgrade.icon} ${upgrade.name} (${upgrade.cost})`, buttonX, h * (0.24 + i * 0.1), buttonWidth, 46, () => {
                    console.log('[MobileUI] Purchase:', upgrade.name);
                });
            });

            createButton('BACK', buttonX, h * 0.65, buttonWidth, 48, () => {
                showScreen('mainMenu');
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
                manualScreenOverride = false; // Allow sync when game starts
                import('../ui/manager.js').then(m => m.startGame(1));
                showScreen('playing');
            });
            createButton('LEVEL 2', buttonX, h * 0.45, buttonWidth, 50, () => {
                manualScreenOverride = false;
                import('../ui/manager.js').then(m => m.startGame(2));
                showScreen('playing');
            });
            createButton('BACK', buttonX, h * 0.7, buttonWidth, 50, () => {
                showScreen('mainMenu');
            });
            break;

        case 'levelUp':
            // Get upgrade options from game state
            const levelUpOptions = state.upgradeOptions || [];

            if (levelUpOptions.length === 0) {
                // Fallback if no options available
                createButton('CONTINUE', buttonX, h * 0.5, buttonWidth, 54, () => {
                    state.currentGameState = GameState.Playing;
                    state.isPaused = false;
                    manualScreenOverride = false;
                    showScreen('playing');
                });
            } else {
                // Create buttons for each upgrade option
                levelUpOptions.forEach((option, i) => {
                    const yPos = h * (0.25 + i * 0.18);
                    const cardHeight = 65;

                    // Custom card-style button
                    const card = {
                        type: 'button',
                        text: '',
                        bounds: { x: buttonX - 10, y: yPos, width: buttonWidth + 20, height: cardHeight },
                        onClick: () => {
                            console.log('[MobileUI] Selected upgrade:', option.name);
                            // Pass the actual option wrapper object (with type and data)
                            import('../ui/manager.js').then(m => {
                                if (m.selectUpgrade) {
                                    m.selectUpgrade(option);
                                }
                            });
                        },
                        pressed: false,
                        // Custom render data
                        icon: option.icon || '⬆️',
                        title: option.name || 'Upgrade',
                        description: option.description || ''
                    };
                    uiElements.push(card);
                });
            }
            break;

        case 'casino':
            // Continue button after animation
            createButton('CONTINUE', buttonX, h * 0.75, buttonWidth, 54, () => {
                import('../ui/manager.js').then(m => {
                    if (m.closeCasino) m.closeCasino();
                });
                manualScreenOverride = false;
                showScreen('playing');
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

    // Don't override manually set screens
    if (manualScreenOverride) {
        // Only re-render if playing
        if (activeScreen === 'playing') {
            render();
        }
        return;
    }

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
