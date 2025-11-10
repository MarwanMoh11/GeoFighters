import { state, GameState } from '../state.js';
import { ui } from '../ui/dom.js';
import { pauseGame, resumeGame, hideSettings, hideEvolutionBook, hideLevelSelect } from '../ui/manager.js';

export function setupEventListeners() {
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('keydown', onKeyDown, false);
    document.addEventListener('keyup', onKeyUp, false);
    window.addEventListener('mousemove', onMouseMove, false);

    if (state.isTouchDevice) {
        setupTouchControls();
    }
}

function onWindowResize() {
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    if (ui.joystickArea) {
        state.joystickRadius = ui.joystickArea.offsetWidth / 2 || 75;
        state.knobRadius = ui.joystickKnob.offsetWidth / 2 || 30;
    }
}

function onKeyDown(event) {
    if (event.code === 'KeyP' || event.code === 'Escape') {
        event.preventDefault();
        if (state.currentGameState === GameState.Playing && !state.isPaused) pauseGame();
        else if (state.currentGameState === GameState.Paused) resumeGame();
        else if (state.currentGameState === GameState.Settings) hideSettings();
        else if (state.currentGameState === GameState.EvolutionBook) hideEvolutionBook();
        else if (state.currentGameState === GameState.LevelSelect) hideLevelSelect();
        return;
    }

    if (state.currentGameState === GameState.Playing && !state.isPaused && !state.isTouchDevice) {
        switch (event.code) {
            case 'KeyW': case 'ArrowUp': state.moveState.forward = 1; break;
            case 'KeyS': case 'ArrowDown': state.moveState.backward = 1; break;
            case 'KeyA': case 'ArrowLeft': state.moveState.left = 1; break;
            case 'KeyD': case 'ArrowRight': state.moveState.right = 1; break;
        }
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': case 'ArrowUp': state.moveState.forward = 0; break;
        case 'KeyS': case 'ArrowDown': state.moveState.backward = 0; break;
        case 'KeyA': case 'ArrowLeft': state.moveState.left = 0; break;
        case 'KeyD': case 'ArrowRight': state.moveState.right = 0; break;
    }
}

function onMouseMove() {
    // Placeholder for potential future mouse controls
}
// =================================================================================
// --- "ANYWHERE ON SCREEN" FLOATING JOYSTICK & AIMING CONTROLS ---
// =================================================================================

/**
 * Sets up all listeners for the touch control system.
 */
export function setupTouchControls() {
    handleResize(); // Run once to set initial joystick dimensions

    document.body.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.body.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.body.addEventListener('touchend', handleTouchEnd, { passive: false });
    document.body.addEventListener('touchcancel', handleTouchEnd, { passive: false });
}

/**
 * Handles the start of a touch.
 * - The VERY FIRST touch on screen, anywhere, becomes the movement joystick.
 * - A SECOND simultaneous touch, anywhere else, becomes the aiming control.
 */
function handleTouchStart(e) {
    if (state.currentGameState !== GameState.Playing || state.isPaused) return;

    function isPointOverInteractiveUI(x, y) {
        const el = document.elementFromPoint(x, y);
        if (!el) return false;
        return !!el.closest('.menu-overlay, .popup-overlay, #fullscreen-button');
    }

    for (const touch of e.changedTouches) {
        const tx = touch.clientX;
        const ty = touch.clientY;

        if (isPointOverInteractiveUI(tx, ty)) continue;

        // --- FIRST PRIORITY: MOVEMENT JOYSTICK ---
        // If no movement joystick is active, this new touch BECOMES the joystick,
        // regardless of its position on the screen.
        if (state.movePointerId === null) {
            e.preventDefault();

            state.movePointerId = touch.identifier;
            state.joystickActive = true;

            // Move the joystick UI to the exact touch location
            ui.joystickArea.style.left = `${tx}px`;
            ui.joystickArea.style.top = `${ty}px`;

            ui.joystickArea.classList.add('active');

            // Store this initial touch point as the joystick's "center"
            state.joystickCenter.set(tx, ty);
        }
            // --- SECOND PRIORITY: AIMING CONTROL ---
            // If a movement joystick is ALREADY active, and no aiming touch is active,
        // this new touch becomes the aiming control.
        else if (state.aimPointerId === null) {
            e.preventDefault();
            state.aimPointerId = touch.identifier;
            state.aimStart.set(tx, ty);
        }
    }
}

/**
 * Handles the movement of any active touches, correctly routing them
 * to either the joystick logic or the aiming logic based on their ID.
 * THIS FUNCTION DOES NOT NEED TO CHANGE.
 */
function handleTouchMove(e) {
    if (!state.joystickActive && state.aimPointerId === null) return;

    e.preventDefault();

    for (const touch of e.changedTouches) {
        // --- Handle Movement Joystick ---
        if (touch.identifier === state.movePointerId) {
            const dx = touch.clientX - state.joystickCenter.x;
            const dy = touch.clientY - state.joystickCenter.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const maxDistance = state.joystickRadius - state.knobRadius;
            const clampedDistance = Math.min(distance, maxDistance);
            const knobX = Math.cos(angle) * clampedDistance;
            const knobY = Math.sin(angle) * clampedDistance;
            ui.joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;
            const nx = knobX / maxDistance;
            const ny = knobY / maxDistance;
            const DEADZONE = 0.15;
            state.moveState.forward = Math.abs(ny) > DEADZONE && ny < 0 ? -ny : 0;
            state.moveState.backward = Math.abs(ny) > DEADZONE && ny > 0 ? ny : 0;
            state.moveState.left = Math.abs(nx) > DEADZONE && nx < 0 ? -nx : 0;
            state.moveState.right = Math.abs(nx) > DEADZONE && nx > 0 ? nx : 0;
        }

        // --- Handle Aiming Logic ---
        if (touch.identifier === state.aimPointerId) {
            const aimDx = touch.clientX - state.aimStart.x;
            const aimDy = touch.clientY - state.aimStart.y;
            const aimVector = new THREE.Vector3(aimDx, 0, aimDy).normalize();
            if (state.player && (aimDx !== 0 || aimDy !== 0)) {
                state.aimTarget.copy(state.player.position).addScaledVector(aimVector, 10);
            }
        }
    }
}

/**
 * Handles the end of a touch, deactivating the correct control
 * (movement or aiming) based on which finger was lifted.
 * THIS FUNCTION DOES NOT NEED TO CHANGE.
 */
function handleTouchEnd(e) {
    for (const touch of e.changedTouches) {
        // --- Movement Joystick End ---
        if (touch.identifier === state.movePointerId) {
            state.joystickActive = false;
            state.movePointerId = null;
            ui.joystickArea.classList.remove('active');
            ui.joystickKnob.style.transform = 'translate(0px, 0px)';
            Object.keys(state.moveState).forEach(key => state.moveState[key] = 0);
        }

        // --- Aiming End ---
        if (touch.identifier === state.aimPointerId) {
            state.aimPointerId = null;
        }
    }
}

/**
 * Handles window resize events to keep the joystick visuals scaled correctly.
 * THIS FUNCTION DOES NOT NEED TO CHANGE.
 */
export function handleResize() {
    // Responsive joystick sizing
    if (state.isTouchDevice && ui.joystickArea && ui.joystickKnob) {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const joystickSize = Math.max(100, Math.min(width * 0.25, height * 0.25, 150));
        const knobSize = joystickSize * 0.5;
        state.joystickRadius = joystickSize / 2;
        state.knobRadius = knobSize / 2;
        ui.joystickArea.style.width = `${joystickSize}px`;
        ui.joystickArea.style.height = `${joystickSize}px`;
        ui.joystickKnob.style.width = `${knobSize}px`;
        ui.joystickKnob.style.height = `${knobSize}px`;
        ui.joystickKnob.style.left = `${state.joystickRadius - state.knobRadius}px`;
        ui.joystickKnob.style.top = `${state.joystickRadius - state.knobRadius}px`;
    }
    // Camera and renderer resize logic
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// --- MODIFIED: toggleFullScreen ---
// This function NO LONGER handles fullscreen. It is purely a mobile pause/resume button.
export function toggleFullScreen() {
    if (state.isTouchDevice) {
        if (state.currentGameState === GameState.Playing && !state.isPaused) {
            pauseGame();
        } else if (state.currentGameState === GameState.Paused) {
            resumeGame();
        }
    }
    // Desktop fullscreen logic has been removed as requested.
}