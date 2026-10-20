export async function runTests(game) {
    const results = [];

    async function assert(condition, message) {
        results.push({ success: condition, message });
        return condition;
    }

    // Helper to wait for a few frames
    async function waitFrames(frames = 10) {
        for (let i = 0; i < frames; i++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
    }

    // Test 1: Movement and Collision
    console.log("Running Test 1: Movement and Collision...");
    await window.__gameTest.reset();
    await waitFrames(20);
    
    const initialState = await window.__gameTest.snapshot();
    // Move right
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    await waitFrames(30);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));
    await waitFrames(10);
    
    const movedState = await window.__gameTest.snapshot();
    await assert(movedState.playerX > initialState.playerX, "Player should move right");

    // Test 2: Shooting
    console.log("Running Test 2: Shooting...");
    const ammoBefore = await window.__gameTest.snapshot();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    await waitFrames(10);
    const ammoAfter = await window.__gameTest.snapshot();
    
    await assert(ammoAfter.ammo < ammoBefore.ammo, "Ammo should decrease after shooting");
    
    // Test 3: Item Collection
    console.log("Running Test 3: Item Collection...");
    let item = game.engine.entities.find(e => e.constructor.name === 'Item');
    if (!item) throw new Error("No item found in Level 1");
    
    const itemPos = { x: item.position.x, y: item.position.y };
    
    // Move player to item
    const player = game.engine.entities.find(e => e.constructor.name === 'Player');
    player.position.x = itemPos.x;
    player.position.y = itemPos.y;
    await waitFrames(10);
    
    const postItemState = await window.__gameTest.snapshot();
    await assert(postItemState.dataCollected > initialState.dataCollected || postItemState.ammo > ammoBefore.ammo || postItemState.health > 100, "Collecting item should change stats");
    
    // Test 4: Game Over
    console.log("Running Test 4: Game Over...");
    player.health = 0;
    await waitFrames(10);
    const gameOverState = await window.__gameTest.snapshot();
    await assert(gameOverState.gameOver === true, "Game should be over when health is 0");

    console.log("Tests Completed!", results);
    return results;
}
