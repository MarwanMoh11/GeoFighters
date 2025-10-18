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

function setupTouchControls() {
    if (ui.joystickArea) {
        state.joystickRadius = ui.joystickArea.offsetWidth / 2 || 75;
        state.knobRadius = ui.joystickKnob.offsetWidth / 2 || 30;
    }
    document.body.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.body.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.body.addEventListener('touchend', handleTouchEnd, { passive: false });
    document.body.addEventListener('touchcancel', handleTouchEnd, { passive: false });
}

function handleTouchStart(event) {
    let targetElement = event.target;
    while (targetElement != null) {
        if (targetElement.tagName === 'BUTTON' || targetElement.classList.contains('menu-box') || targetElement.classList.contains('popup-overlay')) {
            return;
        }
        targetElement = targetElement.parentElement;
    }

    if (state.currentGameState === GameState.Playing && !state.isPaused) {
        event.preventDefault();
        const touch = event.changedTouches[0];

        if (!state.joystickActive && touch.clientX < window.innerWidth / 2) {
            state.joystickActive = true;
            state.joystickPointerId = touch.identifier;
            const joystickRect = ui.joystickArea.getBoundingClientRect();
            const joystickBaseX = joystickRect.left + state.joystickRadius;
            const joystickBaseY = joystickRect.top + state.joystickRadius;
            updateJoystickKnob(touch.clientX, touch.clientY, joystickBaseX, joystickBaseY);
        }
    }
}

function handleTouchMove(event) {
    if (state.currentGameState !== GameState.Playing || state.isPaused || !state.joystickActive) return;
    event.preventDefault();
    for (let i = 0; i < event.changedTouches.length; i++) {
        const touch = event.changedTouches[i];
        if (touch.identifier === state.joystickPointerId) {
            const joystickRect = ui.joystickArea.getBoundingClientRect();
            const joystickBaseX = joystickRect.left + state.joystickRadius;
            const joystickBaseY = joystickRect.top + state.joystickRadius;
            updateJoystickKnob(touch.clientX, touch.clientY, joystickBaseX, joystickBaseY);
            break;
        }
    }
}

function handleTouchEnd(event) {
    if (!state.joystickActive) return;
    for (let i = 0; i < event.changedTouches.length; i++) {
        const touch = event.changedTouches[i];
        if (touch.identifier === state.joystickPointerId) {
            state.joystickActive = false;
            state.joystickPointerId = null;
            ui.joystickKnob.style.left = (state.joystickRadius - state.knobRadius) + 'px';
            ui.joystickKnob.style.top = (state.joystickRadius - state.knobRadius) + 'px';
            break;
        }
    }
}

function updateJoystickKnob(touchX, touchY, baseX, baseY) {
    let deltaX = touchX - baseX;
    let deltaY = touchY - baseY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDistance = state.joystickRadius - state.knobRadius;
    if (distance > maxDistance) {
        deltaX = (deltaX / distance) * maxDistance;
        deltaY = (deltaY / distance) * maxDistance;
    }
    ui.joystickKnob.style.left = (state.joystickRadius - state.knobRadius + deltaX) + 'px';
    ui.joystickKnob.style.top = (state.joystickRadius - state.knobRadius + deltaY) + 'px';
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