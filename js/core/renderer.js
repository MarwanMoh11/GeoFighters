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
        antialias: !state.isTouchDevice,
        powerPreference: 'high-performance'
    });
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Use sRGB for vivid, high-definition colors matching the generated images
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;

    document.body.appendChild(state.renderer.domElement);

    addLights();
    addGround();

    createPlayer();
    populateLevelList();
    createBackgroundPattern();
}

function addLights() {
    const hemiLight = new THREE.HemisphereLight(0x88aaff, 0x111122, 0.4); // Lowered ground color to reduce wash
    state.scene.add(hemiLight);
    const ambientLight = new THREE.AmbientLight(0x202040, 0.3); // Drastically lowered ambient for contrast
    state.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2); // Stronger directional for shadows
    directionalLight.position.set(15, 30, 20);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    directionalLight.shadow.camera.left = -CONSTANTS.WORLD_BOUNDARY - 5;
    directionalLight.shadow.camera.right = CONSTANTS.WORLD_BOUNDARY + 5;
    directionalLight.shadow.camera.top = CONSTANTS.WORLD_BOUNDARY + 5;
    directionalLight.shadow.camera.bottom = -CONSTANTS.WORLD_BOUNDARY - 5;
    directionalLight.shadow.bias = -0.0005;
    state.scene.add(directionalLight);
}

function addGround() {
    // 1. Load the Cyberpunk Floor Texture
    const textureLoader = new THREE.TextureLoader();
    const floorTexture = textureLoader.load('assets/floor_texture.png');

    // Set ColorSpace for HD colors
    floorTexture.colorSpace = THREE.SRGBColorSpace;

    // Configure Tiling
    const textureScale = (CONSTANTS.WORLD_BOUNDARY * 2.2) / 8;
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(textureScale, textureScale);
    floorTexture.anisotropy = 16;

    const groundGeometry = new THREE.PlaneGeometry(CONSTANTS.WORLD_BOUNDARY * 2.2, CONSTANTS.WORLD_BOUNDARY * 2.2);
    const groundMaterial = new THREE.MeshStandardMaterial({
        map: floorTexture,
        roughness: 0.7,
        metalness: 0.3,
        emissive: 0x000000
    });

    state.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    state.ground.rotation.x = -Math.PI / 2;
    state.ground.receiveShadow = true;
    state.scene.add(state.ground);

    // Subtle Grid
    state.gridHelper = new THREE.GridHelper(CONSTANTS.WORLD_BOUNDARY * 2.2, Math.floor(CONSTANTS.WORLD_BOUNDARY * 2.2 / 4), 0x00d4ff, 0x1a1a2e);
    state.gridHelper.material.opacity = 0.1;
    state.gridHelper.material.transparent = true;
    state.gridHelper.position.y = 0.02;
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

// --- MODIFIED FUNCTION ---
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

    // --- NEW FRAGMENT SHADER (Starfield) ---
    const patternFragmentShader = `
        uniform float time;
        varying vec2 vUv;
        uniform vec3 color1; // Base dark color
        uniform vec3 color2; // Nebula/accent color
        
        // --- Helper functions for noise and random ---
        float random (vec2 st) { 
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); 
        }
        
        float noise (vec2 st) {
            vec2 i = floor(st); vec2 f = fract(st);
            float a = random(i); float b = random(i + vec2(1.0, 0.0));
            float c = random(i + vec2(0.0, 1.0)); float d = random(i + vec2(1.0, 1.0));
            vec2 u = f*f*(3.0-2.0*f);
            return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.y * u.x;
        }
        // --- End helper functions ---

        void main() {
            vec2 st = vUv * 15.0; // Scale the space
            st.x *= (16.0/9.0); // Adjust for aspect ratio (approx)

            float n = noise(st * 0.2 + time * 0.05); // Slow moving noise for clouds
            
            // Star Layer 1 (small, dense)
            float star1 = random(floor(st * 2.0));
            star1 = pow(star1, 25.0) * smoothstep(0.9, 1.0, star1);
            star1 *= 0.7; // Brightness
            
            // Star Layer 2 (larger, sparse)
            float star2 = random(floor(st * 0.7));
            star2 = pow(star2, 35.0) * smoothstep(0.9, 1.0, star2);
            star2 *= 1.0; // Brightness
            
            // Twinkling effect
            float twinkle = (sin(time * 3.0 + (st.x * 0.5)) * 0.5 + 0.5) * 0.4 + 0.6;
            
            // Combine layers
            float stars = (star1 + star2) * twinkle;
            
            // Nebula/Cloud effect
            float nebula = smoothstep(0.4, 0.6, n) * 0.5; // Made nebula a bit stronger
            
            vec3 finalColor = mix(color1, color2, nebula) + vec3(stars);
            
            float distFromCenter = distance(vUv, vec2(0.5));
            float vignette = smoothstep(0.7, 0.4, distFromCenter); // Stronger vignette
            
            gl_FragColor = vec4(finalColor * vignette, 1.0);
        }`;

    const patternMaterial = new THREE.ShaderMaterial({
        vertexShader: patternVertexShader,
        fragmentShader: patternFragmentShader,
        uniforms: {
            time: { value: 0.0 },
            color1: { value: new THREE.Color(0x020108) }, // Very dark blue/purple
            color2: { value: new THREE.Color(0x0c0a1f) }, // Dark blue/purple nebula
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