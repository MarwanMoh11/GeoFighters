import { state, CONSTANTS } from '../state.js';
import * as THREE from 'three';

function setupLevel1Map() {
    // Clear any obstacles from a previous run
    state.staticLevelObjects.forEach(obj => {
        if (obj.parent) state.scene.remove(obj);
        obj.geometry?.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => m?.dispose());
            } else {
                obj.material.dispose();
            }
        }
    });
    state.staticLevelObjects.length = 0;

    const mapBoundary = CONSTANTS.WORLD_BOUNDARY * 0.95;
    const buildingCount = 25 + Math.floor(Math.random() * 5);
    const textureLoader = new THREE.TextureLoader();

    // 1. Pre-load Multiple Building Styles with sRGB support for HD colors
    const textures = [
        textureLoader.load('assets/building_texture.png'),      // Blue Neon
        textureLoader.load('assets/building_texture_pink.png'), // Pink/Purple Neon
        textureLoader.load('assets/building_texture_teal.png')  // Teal/Data Stream
    ];
    textures.forEach(t => {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = THREE.SRGBColorSpace; // CRITICAL for HD colors
        t.anisotropy = 8;
    });

    const placedBuildings = [];

    for (let i = 0; i < buildingCount; i++) {
        let attempts = 0;
        let spawnX, spawnZ, width, depth, height, obstacleRadius;
        let validPos = false;

        // Architectural variation
        width = 3.0 + Math.random() * 4.0;
        depth = 3.0 + Math.random() * 4.0;
        height = 6 + Math.random() * 14;
        obstacleRadius = (width + depth) / 2.5; // Radius for circular proxy collision

        // 2. Proximity Checking Spawn Loop
        while (attempts < 40 && !validPos) {
            attempts++;
            const angle = Math.random() * Math.PI * 2;
            const dist = 14 + Math.random() * (mapBoundary * 0.85 - 14);
            spawnX = Math.cos(angle) * dist;
            spawnZ = Math.sin(angle) * dist;

            validPos = true;
            // Check against all previous buildings to avoid overlap
            for (const other of placedBuildings) {
                const dx = spawnX - other.x;
                const dz = spawnZ - other.z;
                const minDist = obstacleRadius + other.radius + 5; // Clear buffer zone
                if (dx * dx + dz * dz < minDist * minDist) {
                    validPos = false;
                    break;
                }
            }
        }

        if (!validPos) continue;

        placedBuildings.push({ x: spawnX, z: spawnZ, radius: obstacleRadius });

        const geom = new THREE.BoxGeometry(width, height, depth);

        // 3. Randomize Texture Type and Scale
        const textureIndex = Math.floor(Math.random() * textures.length);
        const texClone = textures[textureIndex].clone();
        texClone.needsUpdate = true;
        // Map texture so it doesn't look stretched
        texClone.repeat.set(Math.max(width, depth) / 3, height / 5);

        const mat = new THREE.MeshStandardMaterial({
            map: texClone,
            roughness: 0.1,
            metalness: 0.9,
            emissive: textureIndex === 1 ? 0x221122 : (textureIndex === 2 ? 0x112222 : 0x111122),
            emissiveIntensity: 0.2
        });

        const building = new THREE.Mesh(geom, mat);
        building.position.set(spawnX, height / 2 - 0.1, spawnZ);
        building.castShadow = true;
        building.receiveShadow = true;

        // 4. Lively Details: Antennas and Rooftop Signal Lights
        if (height > 9) {
            const antType = Math.random();
            if (antType < 0.7) {
                // High-gain Antenna
                const antGeom = new THREE.BoxGeometry(0.15, 4.0, 0.15);
                const antColor = textureIndex === 1 ? 0xff00ff : (textureIndex === 2 ? 0x00ffff : 0x00d4ff);
                const antMat = new THREE.MeshBasicMaterial({ color: antColor });
                const antenna = new THREE.Mesh(antGeom, antMat);
                antenna.position.set((Math.random() - 0.5) * (width - 1), height / 2 + 2.0, (Math.random() - 0.5) * (depth - 1));
                building.add(antenna);
            } else {
                // Rooftop Aviation Signal
                const lightGeom = new THREE.SphereGeometry(0.4, 8, 8);
                const lightMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                const signal = new THREE.Mesh(lightGeom, lightMat);
                signal.position.set(0, height / 2 + 0.4, 0);
                building.add(signal);
            }
        }

        // Store geometric data for precise rectangular collision
        building.userData.isObstacle = true;
        building.userData.width = width;
        building.userData.depth = depth;
        building.userData.obstacleRadius = obstacleRadius; // Fallback for simple systems

        state.scene.add(building);
        state.staticLevelObjects.push(building);
    }
}

export const gameLevels = [
    { id: 1, name: "Sector Prime", description: "The starting point. Anomalies are relatively sparse.", unlocked: true, mapSetup: setupLevel1Map, isTutorial: true },
    { id: 2, name: "Crystalline Maze", description: "Denser formations and more aggressive geometries.", unlocked: false, mapSetup: null },
    { id: 3, name: "The Void Edge", description: "Unstable energies and powerful entities.", unlocked: false, mapSetup: null },
];
