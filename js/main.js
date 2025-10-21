import { state, GameState } from './state.js';
import { initRenderer } from './core/renderer.js';
import { updatePlaying, applyFrustumCulling } from './core/sceneUpdates.js';
import { setupEventListeners } from './utils/input.js';
import { loadGameData } from './utils/saveLoad.js';
import { initializeAudio } from './utils/audio.js';
import { bindUIEvents } from './ui/manager.js';
// Make sure this path is correct for your project structure!
// It might be './systems/spawner.js'
import { initializePools, initializeDamageNumberPool, resetDamageNumberCounter } from './game/spawner.js';

function init() {
    state.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    loadGameData();
    initializeAudio();
    initRenderer();

    initializePools();
    initializeDamageNumberPool();
    resetDamageNumberCounter();

    setupEventListeners();
    bindUIEvents();

    // Set initial time for the game loop
    lastTime = performance.now();
    animate();
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

    if (deltaTime > MAX_FRAME_TIME) {
        deltaTime = MAX_FRAME_TIME;
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

    if (state.renderer && state.scene && state.camera) {
        try {
            state.renderer.render(state.scene, state.camera);
        } catch (renderError) {
            console.error("A critical error occurred during rendering:", renderError);
        }
    }
}

window.onload = init;