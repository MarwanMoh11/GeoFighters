// --- server.js ---

// 1. SETUP: Import necessary libraries
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Initialize the server and socket.io
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Tell the server to serve all the game files from the parent directory.
app.use(express.static(path.join(__dirname, '..')));

// 2. AUTHORITATIVE GAME STATE
// This object is the server's "source of truth".
const players = {};
const PLAYER_SPEED = 5.0; // Base player speed, should match the client's CONSTANTS

// Game world state
const gameState = {
    gameTime: 0,
    enemies: [],
    projectiles: [],
    dataFragments: [],
    megaDataFragments: [],
    particles: [],
    hitEffects: [],
    geometricCaches: [],
    repairNodes: [],
    energyCores: [],
    
    // Spawning state
    spawnerState: 'CALM',
    hordeTimer: 0,
    hordeIndex: 0,
    currentHordeEnemyType: null,
    isBossWave: false,
    
    // Game progression
    score: 0,
    dataCores: 0,
    
    // Timers
    shapeSpawnTimer: 0,
    shapeSpawnInterval: 2.0,
    eliteSpawnTimer: 35,
    pickupSpawnTimer: 5,
    
    // Spatial grid for collision detection
    spatialGrid: null
};

// Initialize spatial grid
class SpatialGrid {
    constructor(cellSize = 10, worldSize = 140) {
        this.cellSize = cellSize;
        this.worldSize = worldSize;
        this.grid = {};
        this.gridSize = Math.ceil(worldSize / cellSize);
    }
    
    clear() {
        this.grid = {};
    }
    
    getCellKey(x, z) {
        const cellX = Math.floor((x + this.worldSize / 2) / this.cellSize);
        const cellZ = Math.floor((z + this.worldSize / 2) / this.cellSize);
        return `${cellX},${cellZ}`;
    }
    
    addObject(object, position) {
        const key = this.getCellKey(position.x, position.z);
        if (!this.grid[key]) {
            this.grid[key] = [];
        }
        this.grid[key].push(object);
    }
    
    getObjectsNear(position, radius = 0) {
        const cells = new Set();
        const r = Math.ceil(radius / this.cellSize);
        const cX = Math.floor((position.x + this.worldSize / 2) / this.cellSize);
        const cZ = Math.floor((position.z + this.worldSize / 2) / this.cellSize);
        
        for (let x = cX - r; x <= cX + r; x++) {
            for (let z = cZ - r; z <= cZ + r; z++) {
                if (x >= 0 && x < this.gridSize && z >= 0 && z < this.gridSize) {
                    cells.add(`${x},${z}`);
                }
            }
        }
        
        const nearby = [];
        cells.forEach(key => {
            if (this.grid[key]) {
                nearby.push(...this.grid[key]);
            }
        });
        
        return nearby;
    }
}

gameState.spatialGrid = new SpatialGrid(10, 140);

// Enemy types (simplified for server)
const ENEMY_TYPES = {
    'CUBE_CRUSHER': { speed: 2.0, health: 20, damageMultiplier: 1.0, radius: 0.8 },
    'TETRA_SWARMER': { speed: 4.0, health: 8, damageMultiplier: 0.5, radius: 0.5 },
    'SPHERE_SPLITTER': { speed: 1.5, health: 30, damageMultiplier: 1.2, radius: 1.0 },
    'CYLINDER_CORRUPTER': { speed: 1.0, health: 50, damageMultiplier: 2.0, radius: 1.2 },
    'ICOSAHEDRON_INVADER': { speed: 2.5, health: 25, damageMultiplier: 1.5, radius: 0.9 },
    'PRISM_DASHER': { speed: 3.0, health: 15, damageMultiplier: 1.8, radius: 0.7 },
    'DODECAHEDRON_DRIFTER': { speed: 2.2, health: 18, damageMultiplier: 1.3, radius: 0.8 },
    'CONE_CASTER': { speed: 1.8, health: 35, damageMultiplier: 1.6, radius: 1.1 }
};

// Horde timeline for spawning
const HORDE_TIMELINE = [
    { startTime: 5, duration: 50, type: 'CUBE_CRUSHER', calmDuration: 15 },
    { startTime: 70, duration: 60, type: 'TETRA_SWARMER', calmDuration: 20 },
    { startTime: 150, duration: 10, type: 'SPHERE_SPLITTER', calmDuration: 25 },
    { startTime: 150, duration: 100, type: 'CUBE_CRUSHER', calmDuration: 15 },
    { startTime: 215, duration: 60, type: 'TETRA_SWARMER', calmDuration: 25 },
    { startTime: 275, duration: 65, type: 'SPHERE_SPLITTER', calmDuration: 20 },
    { startTime: 275, duration: 65, type: 'CUBE_CRUSHER', calmDuration: 20 },
    { startTime: 275, duration: 80, type: 'TETRA_SWARMER', calmDuration: 0, isMiniHorde: true },
    { startTime: 420, duration: 140, type: 'CYLINDER_CORRUPTER', calmDuration: 25 }
];

// 3. SERVER GAME LOOP VARIABLES
let lastTime = Date.now(); // Used to calculate deltaTime

// Game logic functions
function spawnEnemy(typeId, position = null) {
    const typeData = ENEMY_TYPES[typeId];
    if (!typeData) return;

    let spawnPosition;
    if (position) {
        spawnPosition = position;
    } else {
        // Find a random position around any player
        const playerPositions = Object.values(players).map(p => ({ x: p.x, z: p.z }));
        if (playerPositions.length === 0) return;
        
        const randomPlayer = playerPositions[Math.floor(Math.random() * playerPositions.length)];
        const spawnRadius = 35;
        const angle = Math.random() * Math.PI * 2;
        let x = randomPlayer.x + Math.cos(angle) * spawnRadius;
        let z = randomPlayer.z + Math.sin(angle) * spawnRadius;
        
        // Clamp to world boundaries
        const WORLD_BOUNDARY = 70;
        x = Math.max(-WORLD_BOUNDARY, Math.min(WORLD_BOUNDARY, x));
        z = Math.max(-WORLD_BOUNDARY, Math.min(WORLD_BOUNDARY, z));
        
        spawnPosition = { x, y: typeData.radius, z };
    }

    const enemy = {
        id: `enemy_${Date.now()}_${Math.random()}`,
        type: typeId,
        position: spawnPosition,
        health: typeData.health,
        maxHealth: typeData.health,
        radius: typeData.radius,
        speed: typeData.speed,
        damageMultiplier: typeData.damageMultiplier,
        spawnTime: gameState.gameTime,
        // AI state
        targetPlayerId: null,
        aiState: 'seeking',
        aiTimer: 0,
        dashTimer: 0,
        isDashing: false,
        dashDirection: { x: 0, z: 0 }
    };

    gameState.enemies.push(enemy);
    return enemy;
}

function updateEnemies(deltaTime) {
    for (let i = gameState.enemies.length - 1; i >= 0; i--) {
        const enemy = gameState.enemies[i];
        const typeData = ENEMY_TYPES[enemy.type];
        
        if (!typeData) {
            gameState.enemies.splice(i, 1);
            continue;
        }

        // Find closest player
        let closestPlayer = null;
        let minDistance = Infinity;
        
        for (const playerId in players) {
            const player = players[playerId];
            const distance = Math.sqrt(
                Math.pow(enemy.position.x - player.x, 2) + 
                Math.pow(enemy.position.z - player.z, 2)
            );
            if (distance < minDistance) {
                minDistance = distance;
                closestPlayer = player;
            }
        }

        if (!closestPlayer) {
            gameState.enemies.splice(i, 1);
            continue;
        }

        // Update AI based on enemy type
        switch (enemy.type) {
            case 'PRISM_DASHER':
                enemy.dashTimer = (enemy.dashTimer || 0) - deltaTime;
                if (!enemy.isDashing && enemy.dashTimer <= 0) {
                    enemy.isDashing = true;
                    enemy.dashDirection = {
                        x: closestPlayer.x - enemy.position.x,
                        z: closestPlayer.z - enemy.position.z
                    };
                    const length = Math.sqrt(enemy.dashDirection.x ** 2 + enemy.dashDirection.z ** 2);
                    if (length > 0) {
                        enemy.dashDirection.x /= length;
                        enemy.dashDirection.z /= length;
                    }
                    enemy.dashTimeLeft = 2.0; // Dash duration
                }
                
                if (enemy.isDashing) {
                    enemy.position.x += enemy.dashDirection.x * enemy.speed * 3 * deltaTime;
                    enemy.position.z += enemy.dashDirection.z * enemy.speed * 3 * deltaTime;
                    enemy.dashTimeLeft -= deltaTime;
                    if (enemy.dashTimeLeft <= 0) {
                        enemy.isDashing = false;
                        enemy.dashTimer = 3.0; // Cooldown
                    }
                } else {
                    // Normal movement towards closest player
                    const dx = closestPlayer.x - enemy.position.x;
                    const dz = closestPlayer.z - enemy.position.z;
                    const distance = Math.sqrt(dx * dx + dz * dz);
                    if (distance > 0.1) {
                        enemy.position.x += (dx / distance) * enemy.speed * deltaTime;
                        enemy.position.z += (dz / distance) * enemy.speed * deltaTime;
                    }
                }
                break;
                
            case 'CYLINDER_CORRUPTER':
                // Weaving movement pattern
                const dirToPlayerCorrupt = {
                    x: closestPlayer.x - enemy.position.x,
                    z: closestPlayer.z - enemy.position.z
                };
                const distanceCorrupt = Math.sqrt(dirToPlayerCorrupt.x ** 2 + dirToPlayerCorrupt.z ** 2);
                if (distanceCorrupt > 0) {
                    dirToPlayerCorrupt.x /= distanceCorrupt;
                    dirToPlayerCorrupt.z /= distanceCorrupt;
                }
                
                const perpendicularDir = {
                    x: -dirToPlayerCorrupt.z,
                    z: dirToPlayerCorrupt.x
                };
                
                enemy.weaveTimer = (enemy.weaveTimer || 0) + deltaTime * 5;
                const weaveOffset = Math.sin(enemy.weaveTimer) * 2;
                
                const targetX = closestPlayer.x + perpendicularDir.x * weaveOffset;
                const targetZ = closestPlayer.z + perpendicularDir.z * weaveOffset;
                
                const dxWeave = targetX - enemy.position.x;
                const dzWeave = targetZ - enemy.position.z;
                const distanceWeave = Math.sqrt(dxWeave * dxWeave + dzWeave * dzWeave);
                if (distanceWeave > 0.1) {
                    enemy.position.x += (dxWeave / distanceWeave) * enemy.speed * deltaTime;
                    enemy.position.z += (dzWeave / distanceWeave) * enemy.speed * deltaTime;
                }
                break;
                
            case 'SPHERE_SPLITTER':
                // Bouncing movement for first generation
                if (enemy.generation === 1) {
                    enemy.bounceTimer = (enemy.bounceTimer || 0) + deltaTime * 6;
                    enemy.position.y = enemy.radius + Math.abs(Math.sin(enemy.bounceTimer)) * 0.4;
                }
                // Fall through to default movement
                
            default:
                // Default AI: move towards closest player
                const dx = closestPlayer.x - enemy.position.x;
                const dz = closestPlayer.z - enemy.position.z;
                const distance = Math.sqrt(dx * dx + dz * dz);
                if (distance > 0.1) {
                    enemy.position.x += (dx / distance) * enemy.speed * deltaTime;
                    enemy.position.z += (dz / distance) * enemy.speed * deltaTime;
                }
                break;
        }

        // Boundary checks
        const WORLD_BOUNDARY = 70;
        enemy.position.x = Math.max(-WORLD_BOUNDARY + enemy.radius, 
                                   Math.min(WORLD_BOUNDARY - enemy.radius, enemy.position.x));
        enemy.position.z = Math.max(-WORLD_BOUNDARY + enemy.radius, 
                                   Math.min(WORLD_BOUNDARY - enemy.radius, enemy.position.z));

        // Despawn if too far from all players
        if (minDistance > 85) {
            gameState.enemies.splice(i, 1);
        }
    }
}

function updateProjectiles(deltaTime) {
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const projectile = gameState.projectiles[i];
        
        projectile.position.x += projectile.velocity.x * deltaTime;
        projectile.position.y += projectile.velocity.y * deltaTime;
        projectile.position.z += projectile.velocity.z * deltaTime;
        
        projectile.life -= deltaTime;
        
        // Remove if expired or out of bounds
        if (projectile.life <= 0 || 
            Math.abs(projectile.position.x) > 100 || 
            Math.abs(projectile.position.z) > 100) {
            gameState.projectiles.splice(i, 1);
        }
    }
}

function checkCollisions() {
    // Update spatial grid
    gameState.spatialGrid.clear();
    gameState.enemies.forEach((enemy, i) => {
        gameState.spatialGrid.addObject({ enemy, index: i }, enemy.position);
    });
    gameState.projectiles.forEach((proj, i) => {
        gameState.spatialGrid.addObject({ projectile: proj, index: i }, proj.position);
    });

    // Check projectile vs enemy collisions
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
        const projectile = gameState.projectiles[i];
        if (projectile.isEnemyProjectile) continue; // Skip enemy projectiles
        
        const nearby = gameState.spatialGrid.getObjectsNear(projectile.position, 2);
        
        for (const gridObject of nearby) {
            if (gridObject.enemy) {
                const enemy = gridObject.enemy;
                const distance = Math.sqrt(
                    Math.pow(projectile.position.x - enemy.position.x, 2) +
                    Math.pow(projectile.position.z - enemy.position.z, 2)
                );
                
                if (distance < enemy.radius + projectile.radius) {
                    // Hit!
                    enemy.health -= projectile.damage;
                    gameState.projectiles.splice(i, 1);
                    
                    if (enemy.health <= 0) {
                        // Enemy died - award score to the player who fired the projectile
                        const shooterId = projectile.ownerId;
                        if (players[shooterId]) {
                            players[shooterId].score += Math.floor(enemy.maxHealth * 0.1);
                        }
                        gameState.enemies.splice(gridObject.index, 1);
                        
                        // Spawn data fragment
                        gameState.dataFragments.push({
                            id: `fragment_${Date.now()}_${Math.random()}`,
                            position: { ...enemy.position },
                            xpValue: Math.floor(enemy.maxHealth * 0.2),
                            life: 30.0
                        });
                    }
                    break;
                }
            }
        }
    }

    // Check player vs enemy collisions
    for (const playerId in players) {
        const player = players[playerId];
        const nearby = gameState.spatialGrid.getObjectsNear({ x: player.x, z: player.z }, 2);
        
        for (const gridObject of nearby) {
            if (gridObject.enemy) {
                const enemy = gridObject.enemy;
                const distance = Math.sqrt(
                    Math.pow(player.x - enemy.position.x, 2) +
                    Math.pow(player.z - enemy.position.z, 2)
                );
                
                if (distance < enemy.radius + 0.5) { // Player radius
                    // Player hit
                    player.shield -= enemy.damageMultiplier * 5;
                    if (player.shield <= 0) {
                        player.shield = 0;
                        // Could trigger game over for this player
                    }
                    
                    // Knockback
                    const knockbackX = (player.x - enemy.position.x) * 0.3;
                    const knockbackZ = (player.z - enemy.position.z) * 0.3;
                    player.x += knockbackX;
                    player.z += knockbackZ;
                    
                    // Enemy knockback
                    enemy.position.x -= knockbackX * 2;
                    enemy.position.z -= knockbackZ * 2;
                }
            }
        }
    }
}

function handleSpawning(deltaTime) {
    // Check for next horde
    const nextHorde = HORDE_TIMELINE[gameState.hordeIndex];
    if (nextHorde && gameState.gameTime >= nextHorde.startTime) {
        gameState.spawnerState = 'HORDE_ACTIVE';
        gameState.hordeTimer = nextHorde.duration;
        gameState.currentHordeEnemyType = nextHorde.type;
        gameState.hordeIndex++;
    }

    if (gameState.spawnerState === 'HORDE_ACTIVE') {
        gameState.hordeTimer -= deltaTime;
        
        // Spawn enemies during horde
        if (gameState.hordeTimer > 0) {
            gameState.shapeSpawnTimer -= deltaTime;
            if (gameState.shapeSpawnTimer <= 0) {
                spawnEnemy(gameState.currentHordeEnemyType);
                gameState.shapeSpawnTimer = gameState.shapeSpawnInterval;
            }
        } else {
            gameState.spawnerState = 'CALM';
            gameState.hordeTimer = nextHorde?.calmDuration || 10;
        }
    } else if (gameState.spawnerState === 'CALM') {
        gameState.hordeTimer -= deltaTime;
        // Spawn occasional enemies during calm
        gameState.shapeSpawnTimer -= deltaTime;
        if (gameState.shapeSpawnTimer <= 0 && Math.random() < 0.1) {
            const enemyTypes = Object.keys(ENEMY_TYPES);
            const randomType = enemyTypes[Math.floor(Math.random() * enemyTypes.length)];
            spawnEnemy(randomType);
            gameState.shapeSpawnTimer = gameState.shapeSpawnInterval * 2;
        }
    }
}

// 4. CONNECTION HANDLING
io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // When a player joins, create a data object for them.
    players[socket.id] = {
        id: socket.id,
        x: 0,
        y: 0.5, // Player's model height
        z: 0,
        shield: 100,
        maxShield: 100,
        score: 0,
        level: 1,
        // The server will store the last known input state for each player.
        moveState: { forward: 0, backward: 0, left: 0, right: 0 }
    };

    // Send initial game state to the new player
    socket.emit('gameStateUpdate', {
        players,
        gameState: {
            enemies: gameState.enemies,
            projectiles: gameState.projectiles,
            dataFragments: gameState.dataFragments,
            score: gameState.score,
            gameTime: gameState.gameTime
        }
    });

    // Listen for 'playerInput' events from clients.
    socket.on('playerInput', (moveState) => {
        const player = players[socket.id];
        if (player) {
            player.moveState = moveState;
        }
    });

    // Listen for weapon firing
    socket.on('weaponFire', (fireData) => {
        const player = players[socket.id];
        if (!player) return;

        // Create projectile
        const projectile = {
            id: `projectile_${Date.now()}_${Math.random()}`,
            position: { x: player.x, y: player.y, z: player.z },
            velocity: fireData.velocity,
            damage: fireData.damage || 10,
            radius: fireData.radius || 0.2,
            life: fireData.life || 3.0,
            ownerId: socket.id,
            isEnemyProjectile: false,
            weaponId: fireData.weaponId || 'unknown',
            tags: fireData.tags || []
        };

        gameState.projectiles.push(projectile);
        
        // Broadcast to all clients
        io.emit('projectileCreated', projectile);
    });

    // Listen for shoot events (from weapon system)
    socket.on('shoot', (shootData) => {
        const player = players[socket.id];
        if (!player) return;

        // Create projectile from shoot data
        const projectile = {
            id: `projectile_${Date.now()}_${Math.random()}`,
            position: { x: player.x, y: player.y + 0.5, z: player.z },
            velocity: { x: shootData.dx * 15, y: 0, z: shootData.dz * 15 }, // Convert direction to velocity
            damage: 10, // Default damage, could be enhanced
            radius: 0.2,
            life: 3.0,
            ownerId: socket.id,
            isEnemyProjectile: false,
            weaponId: 'unknown',
            tags: []
        };

        gameState.projectiles.push(projectile);
        
        // Broadcast to all clients
        io.emit('projectileCreated', projectile);
    });

    // Handle when a player disconnects.
    socket.on('disconnect', () => {
        console.log(`[-] Player disconnected: ${socket.id}`);
        delete players[socket.id]; // Remove them from the game state.
        
        // Broadcast player disconnect
        io.emit('playerDisconnected', socket.id);
    });
});

// 5. THE AUTHORITATIVE SERVER-SIDE GAME LOOP
// This function runs independently, 60 times per second, to update the game world.
function serverGameLoop() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastTime) / 1000.0; // Time since last frame in seconds.
    lastTime = currentTime;

    // Update game time
    gameState.gameTime += deltaTime;

    // Update all player positions based on their last known input state.
    for (const id in players) {
        const player = players[id];
        const moveState = player.moveState;

        // Apply movement using deltaTime for frame-rate independent physics.
        if (moveState.forward) player.z -= PLAYER_SPEED * deltaTime;
        if (moveState.backward) player.z += PLAYER_SPEED * deltaTime;
        if (moveState.left) player.x -= PLAYER_SPEED * deltaTime;
        if (moveState.right) player.x += PLAYER_SPEED * deltaTime;

        // World boundary checks
        const WORLD_BOUNDARY = 70;
        player.x = Math.max(-WORLD_BOUNDARY, Math.min(WORLD_BOUNDARY, player.x));
        player.z = Math.max(-WORLD_BOUNDARY, Math.min(WORLD_BOUNDARY, player.z));

        // Shield regeneration
        if (player.shield < player.maxShield) {
            player.shield = Math.min(player.maxShield, player.shield + 5 * deltaTime);
        }
    }

    // Update game world
    updateEnemies(deltaTime);
    updateProjectiles(deltaTime);
    handleSpawning(deltaTime);
    checkCollisions();

    // Update data fragments
    for (let i = gameState.dataFragments.length - 1; i >= 0; i--) {
        const fragment = gameState.dataFragments[i];
        fragment.life -= deltaTime;
        
        if (fragment.life <= 0) {
            gameState.dataFragments.splice(i, 1);
            continue;
        }

        // Move fragments towards nearest player
        let nearestPlayer = null;
        let minDistance = Infinity;
        
        for (const playerId in players) {
            const player = players[playerId];
            const distance = Math.sqrt(
                Math.pow(fragment.position.x - player.x, 2) +
                Math.pow(fragment.position.z - player.z, 2)
            );
            if (distance < minDistance) {
                minDistance = distance;
                nearestPlayer = player;
            }
        }

        if (nearestPlayer && minDistance < 5) {
            const dx = nearestPlayer.x - fragment.position.x;
            const dz = nearestPlayer.z - fragment.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > 0.1) {
                const speed = 3.0;
                fragment.position.x += (dx / distance) * speed * deltaTime;
                fragment.position.z += (dz / distance) * speed * deltaTime;
            }
            
            // Check if collected
            if (distance < 1.0) {
                nearestPlayer.score += fragment.xpValue;
                gameState.dataFragments.splice(i, 1);
            }
        }
    }

    // After updating all positions, broadcast the complete, authoritative state to ALL clients.
    io.emit('gameStateUpdate', {
        players,
        gameState: {
            enemies: gameState.enemies,
            projectiles: gameState.projectiles,
            dataFragments: gameState.dataFragments,
            score: gameState.score,
            gameTime: gameState.gameTime,
            spawnerState: gameState.spawnerState,
            hordeTimer: gameState.hordeTimer
        }
    });
}

// 6. START THE LOOP AND THE SERVER
// Run the game loop at our desired tick rate (60 ticks per second).
setInterval(serverGameLoop, 1000 / 60);

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`--- Server is running ---`);
    console.log(`Open http://localhost:${PORT} in your browser to play.`);
    console.log(`Multiplayer enabled - up to 8 players supported`);
});