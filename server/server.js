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

// 3. SERVER GAME LOOP VARIABLES
let lastTime = Date.now(); // Used to calculate deltaTime

// 4. CONNECTION HANDLING
io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // When a player joins, create a data object for them.
    players[socket.id] = {
        id: socket.id,
        x: 0,
        y: 0.5, // Player's model height
        z: 0,
        // The server will store the last known input state for each player.
        moveState: { forward: 0, backward: 0, left: 0, right: 0 }
    };

    // Listen for 'playerInput' events from clients.
    // This function does NOT move the player. It only updates the stored input state.
    socket.on('playerInput', (moveState) => {
        const player = players[socket.id];
        if (player) {
            player.moveState = moveState;
        }
    });

    // Handle when a player disconnects.
    socket.on('disconnect', () => {
        console.log(`[-] Player disconnected: ${socket.id}`);
        delete players[socket.id]; // Remove them from the game state.
    });
});

// 5. THE AUTHORITATIVE SERVER-SIDE GAME LOOP
// This function runs independently, 60 times per second, to update the game world.
function serverGameLoop() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastTime) / 1000.0; // Time since last frame in seconds.
    lastTime = currentTime;

    // Update all player positions based on their last known input state.
    for (const id in players) {
        const player = players[id];
        const moveState = player.moveState;

        // Apply movement using deltaTime for frame-rate independent physics.
        if (moveState.forward) player.z -= PLAYER_SPEED * deltaTime;
        if (moveState.backward) player.z += PLAYER_SPEED * deltaTime;
        if (moveState.left) player.x -= PLAYER_SPEED * deltaTime;
        if (moveState.right) player.x += PLAYER_SPEED * deltaTime;

        // In the future, server-side world boundary checks would go here.
        // e.g., player.x = Math.max(-70, Math.min(70, player.x));
    }

    // After updating all positions, broadcast the complete, authoritative state to ALL clients.
    io.emit('gameStateUpdate', players);
}

// 6. START THE LOOP AND THE SERVER
// Run the game loop at our desired tick rate (60 ticks per second).
setInterval(serverGameLoop, 1000 / 60);

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`--- Server is running ---`);
    console.log(`Open http://localhost:${PORT} in your browser to play.`);
});