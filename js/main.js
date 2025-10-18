import { state, GameState } from './state.js';
import { initRenderer } from './core/renderer.js';
import { updatePlaying, applyFrustumCulling } from './core/sceneUpdates.js';
import { setupEventListeners } from './utils/input.js';
import { loadGameData } from './utils/saveLoad.js';
import { initializeAudio } from './utils/audio.js';
import { bindUIEvents } from './ui/manager.js';

function init() {
    state.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    loadGameData();
    initializeAudio();
    initRenderer();
    setupEventListeners();
    bindUIEvents();

    animate();
}

// Fixed timestep for consistent game logic across all devices
const FIXED_TIMESTEP = 1 / 60; // 60 updates per second
const MAX_FRAME_TIME = 0.25;    // Cap at 250ms to prevent spiral of death

let accumulator = 0;
let lastTime = performance.now() / 1000;

function animate() {
    requestAnimationFrame(animate);

    const currentTime = performance.now() / 1000;
    let frameTime = currentTime - lastTime;
    lastTime = currentTime;

    // Prevent spiral of death (when game falls too far behind)
    if (frameTime > MAX_FRAME_TIME) {
        frameTime = MAX_FRAME_TIME;
    }

    // Only accumulate time when game is actually playing
    if (state.currentGameState === GameState.Playing && !state.isPaused) {
        accumulator += frameTime;

        // Fixed timestep update loop
        while (accumulator >= FIXED_TIMESTEP) {
            state.gameTime += FIXED_TIMESTEP;
            updatePlaying(FIXED_TIMESTEP);
            accumulator -= FIXED_TIMESTEP;
        }
    }

    // Visual updates (can run at display refresh rate)
    if (state.backgroundPattern) {
        state.backgroundPattern.material.uniforms.time.value = currentTime * 0.05;
    }

    applyFrustumCulling();

    // Render
    if (state.renderer && state.scene && state.camera) {
        try {
            state.renderer.render(state.scene, state.camera);
        } catch (renderError) {
            console.error("Render Error:", renderError);
        }
    }
}

window.onload = init;