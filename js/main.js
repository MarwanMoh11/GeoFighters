import { state, GameState, CONSTANTS } from './state.js';
import { initRenderer } from './core/renderer.js';
import { updatePlaying, applyFrustumCulling } from './core/sceneUpdates.js';
import { setupEventListeners } from './utils/input.js';
import { loadGameData } from './utils/saveLoad.js';
import { initializeAudio } from './utils/audio.js';
import { bindUIEvents } from './ui/manager.js';
import * as THREE from 'three';
// Make sure this path is correct for your project structure!
// It might be './systems/spawner.js'
import { initializePools, initializeDamageNumberPool, resetDamageNumberCounter } from './game/spawner.js';

// At the very top of main.js
const socket = io(); // This line connects your game to the server
state.socket = socket;

// Add this entire new block of code to main.js
// This listens for the 'gameStateUpdate' from the server and draws what it sees.
socket.on('gameStateUpdate', (serverPlayers) => {
    if (!state.scene || state.isPaused) return;

    // Loop through all players the server knows about
    for (const id in serverPlayers) {
        const serverPlayer = serverPlayers[id];

        // Skip rendering our own character (we control our own mesh locally)
        if (id === socket.id) continue;

        // Is this a new player we haven't seen before?
        if (!state.otherPlayers[id]) {
            console.log(`[+] Seeing new player: ${id}`);
            const geometry = new THREE.BoxGeometry(CONSTANTS.PLAYER_RADIUS * 2, CONSTANTS.PLAYER_HEIGHT, CONSTANTS.PLAYER_RADIUS * 2);
            const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // Green
            const newPlayerMesh = new THREE.Mesh(geometry, material);

            state.scene.add(newPlayerMesh);
            state.otherPlayers[id] = newPlayerMesh; // Store it for future updates
        }

        // This player already exists, so update their position smoothly
        const playerMesh = state.otherPlayers[id];
        const targetPosition = new THREE.Vector3(serverPlayer.x, serverPlayer.y, serverPlayer.z);

        // Use LERP to smoothly interpolate to the target position, hiding network jitter
        playerMesh.position.lerp(targetPosition, 0.2);
    }

    // Clean up players who have disconnected
    for (const id in state.otherPlayers) {
        if (!serverPlayers[id]) {
            console.log(`[-] Player left: ${id}`);
            state.scene.remove(state.otherPlayers[id].mesh); // If you store meshes directly
            state.scene.remove(state.otherPlayers[id]); // If you store wrapper objects
            delete state.otherPlayers[id];
        }
    }
});

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