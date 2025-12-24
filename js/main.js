import { state, GameState } from './state.js';
import { initRenderer } from './core/renderer.js';
import { updatePlaying, applyFrustumCulling } from './core/sceneUpdates.js';
import { setupEventListeners } from './utils/input.js';
import { loadGameData } from './utils/saveLoad.js';
import { initializeAudio } from './utils/audio.js';
import { bindUIEvents, pauseGame } from './ui/manager.js';
import { ui } from './ui/dom.js';
import { initializePools, initializeDamageNumberPool, resetDamageNumberCounter } from './game/spawner.js';

// FPS calculation
let fpsFrameCount = 0;
let fpsLastTime = 0;
let currentFps = 0;

// Low power mode detection
let lowFpsFrames = 0;
const LOW_FPS_THRESHOLD = 30;
const LOW_FPS_DURATION_FRAMES = 180; // ~3 seconds at 60fps

function init() {
    state.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // Parse URL parameters for debug mode
    const urlParams = new URLSearchParams(window.location.search);
    state.isDebugMode = urlParams.has('debug');
    const stressParam = urlParams.get('stress');
    if (stressParam) {
        state.stressTestCount = Math.min(3000, Math.max(100, parseInt(stressParam, 10) || 1000));
    }

    // Show debug HUD if in debug mode
    if (state.isDebugMode && ui.debugHud) {
        ui.debugHud.style.display = 'block';
        console.warn('--- DEBUG MODE ACTIVE ---');
        console.warn(`Stress test count: ${state.stressTestCount}`);
    }

    loadGameData();
    initializeAudio();
    initRenderer();

    initializePools();
    initializeDamageNumberPool();

    setupEventListeners();
    bindUIEvents();

    // Setup Page Visibility API for auto-pause
    setupVisibilityHandler();

    // Set initial time for the game loop
    lastTime = performance.now();
    fpsLastTime = performance.now();

    // Hide loading overlay after a short delay
    setTimeout(() => {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
    }, 500);

    animate();
}

// Auto-pause when user switches tabs or minimizes browser
function setupVisibilityHandler() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && state.currentGameState === GameState.Playing && !state.isPaused) {
            pauseGame();
            console.log('[App] Auto-paused due to visibility change');
        }
    });

    // Also handle window blur (for when user switches apps on mobile)
    window.addEventListener('blur', () => {
        if (state.currentGameState === GameState.Playing && !state.isPaused) {
            pauseGame();
            console.log('[App] Auto-paused due to window blur');
        }
    });
}

const FIXED_TIMESTEP = 1 / 60;
const MAX_FRAME_TIME = 0.25;

let accumulator = 0;
let lastTime = 0;

function animate() {
    requestAnimationFrame(animate);
    resetDamageNumberCounter();

    const currentTime = performance.now();
    let deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // FPS calculation (update every 500ms)
    fpsFrameCount++;
    if (currentTime - fpsLastTime >= 500) {
        currentFps = Math.round((fpsFrameCount * 1000) / (currentTime - fpsLastTime));
        fpsFrameCount = 0;
        fpsLastTime = currentTime;

        // Update debug HUD
        if (state.isDebugMode && ui.debugFps) {
            ui.debugFps.textContent = currentFps;
            ui.debugEnemyCount.textContent = state.shapes?.length || 0;
            ui.debugProjectileCount.textContent = state.projectiles?.length || 0;
        }

        // Low power mode auto-detection
        if (state.isTouchDevice && !state.lowPowerMode && currentFps < LOW_FPS_THRESHOLD) {
            lowFpsFrames++;
            if (lowFpsFrames >= 6) { // ~3 seconds of low FPS
                state.lowPowerMode = true;
                console.log('[Performance] Low power mode activated due to low FPS');
            }
        } else if (state.isTouchDevice && currentFps >= LOW_FPS_THRESHOLD + 10) {
            lowFpsFrames = Math.max(0, lowFpsFrames - 1);
        }
    }

    if (deltaTime > MAX_FRAME_TIME) {
        deltaTime = MAX_FRAME_TIME;
    }

    // Hit stop freeze frame effect
    if (state.hitStopTime > 0) {
        state.hitStopTime -= deltaTime;
        // During hit stop, skip game logic but still render
        deltaTime = 0;
    }

    if (state.currentGameState === GameState.Playing && !state.isPaused) {
        accumulator += deltaTime;
        while (accumulator >= FIXED_TIMESTEP) {
            state.gameTime += FIXED_TIMESTEP;
            updatePlaying(FIXED_TIMESTEP);
            accumulator -= FIXED_TIMESTEP;
        }
    }

    // --- THIS IS THE CORRECTED, ROBUST ANIMATION ENGINE ---
    if (state.effectsToUpdate && state.effectsToUpdate.length > 0) {
        for (let i = state.effectsToUpdate.length - 1; i >= 0; i--) {
            const effect = state.effectsToUpdate[i];

            // --- FIX ---
            // Check if the effect has a 'brain' directly on it OR on its userData.
            // This handles both hit effects and particle effects.
            const updateFn = effect.update || (effect.userData && effect.userData.update);

            if (updateFn) {
                // Call the brain function
                updateFn(effect, deltaTime);
            } else {
                // If the brain is gone, its life is over. Remove it from the list.
                state.effectsToUpdate.splice(i, 1);
            }
        }
    }

    if (state.backgroundPattern) {
        state.backgroundPattern.material.uniforms.time.value = (currentTime / 1000) * 0.05;
    }

    applyFrustumCulling();

    // --- SCREEN EFFECTS UPDATE ---
    // Screen shake
    if (state.screenShakeTime > 0) {
        state.screenShakeTime -= deltaTime;
        const shakeX = (Math.random() - 0.5) * state.screenShakeIntensity;
        const shakeY = (Math.random() - 0.5) * state.screenShakeIntensity;
        if (state.camera) {
            state.camera.position.x += shakeX;
            state.camera.position.y += shakeY;
        }
    }

    // Vignette flash
    if (state.vignetteFlashTime > 0 && ui.damageVignette) {
        state.vignetteFlashTime -= deltaTime;
        ui.damageVignette.style.opacity = Math.max(0, state.vignetteFlashTime / 0.3);
    }

    if (state.renderer && state.scene && state.camera) {
        try {
            state.renderer.render(state.scene, state.camera);
        } catch (renderError) {
            console.error("A critical error occurred during rendering:", renderError);
        }
    }
}

window.onload = init;