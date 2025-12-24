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
    const obstacleColors = [0x71717a, 0x64748b, 0x4a5568, 0x52525b];
    const obstacleCount = 30 + Math.floor(Math.random() * 10);

    for (let i = 0; i < obstacleCount; i++) {
        const sizeBase = Math.random() * 2.5 + 1.5;
        let geom;
        const type = Math.random();
        let obstacleRadius;

        if (type < 0.33) {
            obstacleRadius = sizeBase / 1.8 * (0.9 + Math.random() * 0.2);
            geom = new THREE.SphereGeometry(obstacleRadius, Math.floor(Math.random() * 2 + 6), Math.floor(Math.random() * 2 + 6));
        } else if (type < 0.66) {
            obstacleRadius = sizeBase / 1.7 * (0.9 + Math.random() * 0.2);
            geom = new THREE.OctahedronGeometry(obstacleRadius, 0);
        } else {
            obstacleRadius = sizeBase / 1.7 * (0.9 + Math.random() * 0.2);
            geom = new THREE.DodecahedronGeometry(obstacleRadius, 0);
        }

        const mat = new THREE.MeshStandardMaterial({
            color: obstacleColors[Math.floor(Math.random() * obstacleColors.length)],
            roughness: 0.5 + Math.random() * 0.2,
            metalness: 0.1 + Math.random() * 0.2,
            wireframe: Math.random() < 0.05
        });
        const mesh = new THREE.Mesh(geom, mat);

        const angle = Math.random() * Math.PI * 2;
        const minDist = 8;
        const maxDist = mapBoundary * 0.9;
        const dist = minDist + Math.random() * (maxDist - minDist);

        const spawnX = Math.cos(angle) * dist;
        const spawnZ = Math.sin(angle) * dist;
        const spawnY = obstacleRadius + 0.05;

        mesh.position.set(spawnX, spawnY, spawnZ);
        mesh.rotation.set(Math.random() * 0.1, Math.random() * Math.PI, Math.random() * 0.1);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Mark as an obstacle for collision detection
        mesh.userData.isObstacle = true;
        mesh.userData.obstacleRadius = obstacleRadius;

        state.scene.add(mesh);
        state.staticLevelObjects.push(mesh);
    }
}

export const gameLevels = [
    { id: 1, name: "Sector Prime", description: "The starting point. Anomalies are relatively sparse.", unlocked: true, mapSetup: setupLevel1Map, isTutorial: true },
    { id: 2, name: "Crystalline Maze", description: "Denser formations and more aggressive geometries.", unlocked: false, mapSetup: null },
    { id: 3, name: "The Void Edge", description: "Unstable energies and powerful entities.", unlocked: false, mapSetup: null },
];