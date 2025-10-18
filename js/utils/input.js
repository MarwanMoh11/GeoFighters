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
// --- Professional Grade Floating Joystick & Twin-Stick Controls ---
// =================================================================================

// This function should be called inside your main setupEventListeners()
export function setupTouchControls() {
    // Run handleResize once at the start to set the initial joystick dimensions
    handleResize();

    // Add listeners to the document body to capture touches anywhere on the screen
    document.body.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.body.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.body.addEventListener('touchend', handleTouchEnd, { passive: false });
    document.body.addEventListener('touchcancel', handleTouchEnd, { passive: false });
}

/**
 * Handles the start of a touch. It determines if the touch is on the left (movement)
 * or right (aiming) side of the screen and activates the appropriate control.
 */
function handleTouchStart(e) {
    // Ignore touches if the game isn't in the correct state
    if (state.currentGameState !== GameState.Playing || state.isPaused) return;

    // A helper function to check if the touch is over an interactive UI button/menu
    function isPointOverInteractiveUI(x, y) {
        const el = document.elementFromPoint(x, y);
        if (!el) return false;
        return !!el.closest('.menu-overlay, .popup-overlay, #fullscreen-button');
    }

    const screenWidth = window.innerWidth;

    // Process all new touches in the event
    for (const touch of e.changedTouches) {
        const tx = touch.clientX;
        const ty = touch.clientY;

        // If the touch is on a menu, ignore it for gameplay controls.
        if (isPointOverInteractiveUI(tx, ty)) continue;

        // --- MOVEMENT JOYSTICK (Left side of the screen) ---
        if (tx < screenWidth / 2 && state.movePointerId === null) {
            e.preventDefault(); // Prevent the browser from scrolling

            state.movePointerId = touch.identifier;
            state.joystickActive = true;

            // **THE FIX**: Move the joystick UI to the touch location
            ui.joystickArea.style.left = `${tx}px`;
            ui.joystickArea.style.top = `${ty}px`;

            // Make it visible
            ui.joystickArea.classList.add('active');

            // Store this initial touch point as the joystick's "center"
            state.joystickCenter.set(tx, ty);
        }
        // --- AIMING CONTROL (Right side of the screen) ---
        else if (tx >= screenWidth / 2 && state.aimPointerId === null) {
            e.preventDefault();
            state.aimPointerId = touch.identifier;
            // Store the starting point of the aim touch to calculate relative direction
            state.aimStart.set(tx, ty);
        }
    }
}

/**
 * Handles the movement of an active touch.
 */
function handleTouchMove(e) {
    // Ignore if no controls are active
    if (!state.joystickActive && state.aimPointerId === null) return;

    e.preventDefault(); // Always prevent scrolling while controlling

    for (const touch of e.changedTouches) {
        // --- Handle Movement Joystick ---
        if (touch.identifier === state.movePointerId) {
            // Calculate vector from the joystick's center to the current touch position
            const dx = touch.clientX - state.joystickCenter.x;
            const dy = touch.clientY - state.joystickCenter.y;

            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            // The max distance the knob can move from the center
            const maxDistance = state.joystickRadius - state.knobRadius;
            const clampedDistance = Math.min(distance, maxDistance);

            // Calculate the knob's position relative to the joystick area's center
            const knobX = Math.cos(angle) * clampedDistance;
            const knobY = Math.sin(angle) * clampedDistance;

            // Move the knob visually using a smooth CSS transform
            ui.joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

            // Normalize the vector to a range of -1 to 1 for game logic
            const nx = knobX / maxDistance;
            const ny = knobY / maxDistance;

            // Apply a deadzone to prevent jitter from small movements
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

            // Map the 2D screen direction to a 3D world direction
            const aimVector = new THREE.Vector3(aimDx, 0, aimDy).normalize();

            // If the player exists, calculate a target point in the aim direction
            if (state.player && (aimDx !== 0 || aimDy !== 0)) {
                state.aimTarget.copy(state.player.position).addScaledVector(aimVector, 10);
            }
        }
    }
}

/**
 * Handles the end of a touch, resetting the relevant control state.
 */
function handleTouchEnd(e) {
    for (const touch of e.changedTouches) {
        // --- Movement Joystick End ---
        if (touch.identifier === state.movePointerId) {
            state.joystickActive = false;
            state.movePointerId = null;

            // Hide the joystick and reset the knob's position
            ui.joystickArea.classList.remove('active');
            ui.joystickKnob.style.transform = 'translate(0px, 0px)';

            // Reset all movement states to 0
            Object.keys(state.moveState).forEach(key => state.moveState[key] = 0);
        }

        // --- Aiming End ---
        if (touch.identifier === state.aimPointerId) {
            state.aimPointerId = null;
            // You might want to reset the aim target or trigger a "stop firing" state here
        }
    }
}


/**
 * Handles window resize events to keep UI elements scaled correctly.
 * This function also needs to be in this file.
 */
export function handleResize() {
    if (state.isTouchDevice && ui.joystickArea && ui.joystickKnob) {
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Responsive joystick sizing
        const joystickSize = Math.max(100, Math.min(width * 0.25, height * 0.25, 150));
        const knobSize = joystickSize * 0.5;

        state.joystickRadius = joystickSize / 2;
        state.knobRadius = knobSize / 2;

        ui.joystickArea.style.width = `${joystickSize}px`;
        ui.joystickArea.style.height = `${joystickSize}px`;
        ui.joystickKnob.style.width = `${knobSize}px`;
        ui.joystickKnob.style.height = `${knobSize}px`;

        // Center the knob within the area. The `transform` will handle movement from this center.
        ui.joystickKnob.style.left = `${state.joystickRadius - state.knobRadius}px`;
        ui.joystickKnob.style.top = `${state.joystickRadius - state.knobRadius}px`;
    }
    // You should also include your camera and renderer resize logic here if it's not already
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}


export function toggleFullScreen() {
    if (state.isTouchDevice) {
        if (state.currentGameState === GameState.Playing && !state.isPaused) pauseGame();
        else if (state.currentGameState === GameState.Paused) resumeGame();
        return;
    }
    const elem = document.documentElement;
    if (!document.fullscreenElement) {
        if (elem.requestFullscreen) elem.requestFullscreen().catch(err => console.error(`FS Error: ${err.message}`));
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}