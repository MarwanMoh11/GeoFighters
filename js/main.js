import { state, GameState } from './state.js';
import { initRenderer } from './core/renderer.js';
import { updatePlaying, applyFrustumCulling } from './core/sceneUpdates.js';
import { setupEventListeners } from './utils/input.js';
import { loadGameData } from './utils/saveLoad.js';
import { initializeAudio } from './utils/audio.js';
import { bindUIEvents } from './ui/manager.js';
// --- FIX: Import the initializers for your object pools ---
import { initializeEffectPools, initializeDamageNumberPool } from './game/spawner';

function init() {
    state.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    loadGameData();
    initializeAudio();
    initRenderer();

    // --- FIX: Initialize the pools once the renderer and scene are ready ---
    initializeEffectPools();
    initializeDamageNumberPool();

    setupEventListeners();
    bindUIEvents();

    // Start the main game loop
    animate();
}

// Fixed timestep for consistent game logic
const FIXED_TIMESTEP = 1 / 60; // 60 updates per second
const MAX_FRAME_TIME = 0.25;   // Cap to prevent spiral of death

let accumulator = 0;
// Use performance.now() directly for the clock
let lastTime = performance.now();

function animate() {
    // Schedule the next frame
    requestAnimationFrame(animate);

    const currentTime = performance.now();
    // Calculate deltaTime in seconds
    let deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // Prevent spiral of death if the game lags severely
    if (deltaTime > MAX_FRAME_TIME) {
        deltaTime = MAX_FRAME_TIME;
    }

    // --- 1. Game Logic Update (Fixed Timestep) ---
    // This part runs only when the game is playing
    if (state.currentGameState === GameState.Playing && !state.isPaused) {
        accumulator += deltaTime;

        // Run the fixed logic update as many times as needed
        while (accumulator >= FIXED_TIMESTEP) {
            state.gameTime += FIXED_TIMESTEP;
            // This function handles player movement, AI, collisions, etc.
            updatePlaying(FIXED_TIMESTEP);
            accumulator -= FIXED_TIMESTEP;
        }
    }

    // --- 2. Visual & Animation Updates (Variable Timestep) ---
    // This part runs every frame for smooth animations, regardless of game state.

    // --- FIX: THIS IS THE MISSING ANIMATION ENGINE ---
    // It updates every active particle and visual effect.
    for (let i = state.effectsToUpdate.length - 1; i >= 0; i--) {
        const effect = state.effectsToUpdate[i];

        // If the effect has an "update" function (a brain), run it.
        if (effect.userData.update) {
            effect.userData.update(effect, deltaTime);
        } else {
            // If its brain is gone, its life is over. Remove it from the update list.
            state.effectsToUpdate.splice(i, 1);
        }
    }

    // Animate the background pattern (your existing code)
    if (state.backgroundPattern) {
        // Use the un-divided currentTime for this kind of smooth, continuous effect
        state.backgroundPattern.material.uniforms.time.value = (currentTime / 1000) * 0.05;
    }

    // Apply frustum culling (your existing code)
    applyFrustumCulling();

    // --- 3. Render the Scene ---
    if (state.renderer && state.scene && state.camera) {
        try {
            state.renderer.render(state.scene, state.camera);
        } catch (renderError) {
            console.error("A critical error occurred during rendering:", renderError);
        }
    }
}

// Start the application once the window is loaded
window.onload = init;