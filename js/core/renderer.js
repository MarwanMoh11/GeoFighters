import * as THREE from 'three';
import { state, CONSTANTS } from '../state.js';
import { createPlayer } from '../game/player.js';
import { populateLevelList } from '../ui/manager.js';

export function initRenderer() {
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x111827);
    state.scene.fog = new THREE.Fog(0x111827, 40, 95);

    state.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Optimized camera position for better gameplay view
    const initialHeight = state.isTouchDevice ? 14 : 16;
    const initialZoom = state.isTouchDevice ? 10 : 13;
    state.camera.position.set(0, initialHeight, initialZoom);
    state.camera.lookAt(0, 0, 0);

    state.renderer = new THREE.WebGLRenderer({
        antialias: !state.isTouchDevice, // Disable AA on mobile for performance
        powerPreference: state.isTouchDevice ? 'high-performance' : 'default'
    });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap pixel ratio for performance
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(state.renderer.domElement);

    addLights();
    addGround();

    createPlayer();
    populateLevelList();
    createBackgroundPattern();
}

function addLights() {
    const hemiLight = new THREE.HemisphereLight(0x88aaff, 0x446644, 0.7);
    state.scene.add(hemiLight);
    const ambientLight = new THREE.AmbientLight(0x606080, 0.5);
    state.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(15, 20, 18);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 80;
    directionalLight.shadow.camera.left = -CONSTANTS.WORLD_BOUNDARY - 5;
    directionalLight.shadow.camera.right = CONSTANTS.WORLD_BOUNDARY + 5;
    directionalLight.shadow.camera.top = CONSTANTS.WORLD_BOUNDARY + 5;
    directionalLight.shadow.camera.bottom = -CONSTANTS.WORLD_BOUNDARY - 5;
    directionalLight.shadow.bias = -0.001;
    state.scene.add(directionalLight);
    const playerLight = new THREE.PointLight(0xaaaaff, 0.4, 20);
    playerLight.position.set(0, 3, 0);
    state.scene.add(playerLight);
}

function addGround() {
    const groundGeometry = new THREE.PlaneGeometry(CONSTANTS.WORLD_BOUNDARY * 2.2, CONSTANTS.WORLD_BOUNDARY * 2.2);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8, metalness: 0.1 });
    state.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    state.ground.rotation.x = -Math.PI / 2;
    state.ground.receiveShadow = true;
    state.scene.add(state.ground);

    state.gridHelper = new THREE.GridHelper(CONSTANTS.WORLD_BOUNDARY * 2.2, Math.floor(CONSTANTS.WORLD_BOUNDARY * 2.2 / 2), 0x4b5563, 0x374151);
    state.gridHelper.material.opacity = 0.3;
    state.gridHelper.material.transparent = true;
    state.gridHelper.position.y = 0.01;
    state.scene.add(state.gridHelper);
}

export function updateCamera() {
    if (!state.player) return;

    // Optimized camera settings for better view
    // Mobile gets a slightly pulled back view for better situational awareness
    // Desktop gets a more dynamic camera
    const zoomFactor = state.isTouchDevice ? 11 : 13;
    const heightFactor = state.isTouchDevice ? 15 : 17;

    // Smooth camera follow with optimized lerp
    const targetPosition = new THREE.Vector3(
        state.player.position.x,
        heightFactor,
        state.player.position.z + zoomFactor
    );
    state.camera.position.lerp(targetPosition, 0.1); // Slightly faster for responsiveness

    // Look slightly ahead of player for better forward visibility
    const lookAtTarget = new THREE.Vector3(
        state.player.position.x,
        state.player.position.y,
        state.player.position.z - 2 // Look slightly ahead
    );
    state.camera.lookAt(lookAtTarget);

    // Update player light
    const playerLight = state.scene.getObjectByProperty('type', 'PointLight');
    if (playerLight) {
        playerLight.position.copy(state.player.position).add(new THREE.Vector3(0, 3, 0));
    }
}

function createBackgroundPattern() {
    if (state.backgroundPattern) {
        state.scene.remove(state.backgroundPattern);
        state.backgroundPattern.geometry?.dispose();
        state.backgroundPattern.material?.dispose();
        state.backgroundPattern = null;
    }

    const patternVertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`;
    const patternFragmentShader = `
        uniform float time;
        varying vec2 vUv;
        uniform vec3 color1;
        uniform vec3 color2;
        
        float random (vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
        float noise (vec2 st) {
            vec2 i = floor(st); vec2 f = fract(st);
            float a = random(i); float b = random(i + vec2(1.0, 0.0));
            float c = random(i + vec2(0.0, 1.0)); float d = random(i + vec2(1.0, 1.0));
            vec2 u = f*f*(3.0-2.0*f);
            return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.y * u.x;
        }

        void main() {
            vec2 scaledUv = vUv * 25.0;
            float n = noise(scaledUv + vec2(time * 0.1, time * 0.15));
            float wave1 = sin(scaledUv.x * cos(time*0.05) + scaledUv.y * sin(time*0.08) + n * 4.0) * 0.5 + 0.5;
            float wave2 = cos(scaledUv.y * 1.5 * sin(time*0.06) - scaledUv.x * 1.2 * cos(time*0.09) + n * 3.0) * 0.5 + 0.5;
            float pattern = smoothstep(0.3, 0.7, wave1 * wave2 + noise(scaledUv * 0.5 + time * 0.05) * 0.2);
            vec3 finalColor = mix(color1, color2, pattern);
            float distFromCenter = distance(vUv, vec2(0.5));
            float vignette = smoothstep(0.5, 0.25, distFromCenter);
            vec3 colorWithVignette = finalColor * vignette;
            gl_FragColor = vec4(colorWithVignette * 0.4, 1.0);
        }`;

    const patternMaterial = new THREE.ShaderMaterial({
        vertexShader: patternVertexShader,
        fragmentShader: patternFragmentShader,
        uniforms: {
            time: { value: 0.0 },
            color1: { value: new THREE.Color(0x080510) },
            color2: { value: new THREE.Color(0x120818) },
        },
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    const patternSize = CONSTANTS.WORLD_BOUNDARY * 2.5;
    const patternGeometry = new THREE.PlaneGeometry(patternSize, patternSize);
    state.backgroundPattern = new THREE.Mesh(patternGeometry, patternMaterial);
    state.backgroundPattern.rotation.x = -Math.PI / 2;
    state.backgroundPattern.position.y = -5;
    state.backgroundPattern.renderOrder = -999;
    state.scene.add(state.backgroundPattern);
}