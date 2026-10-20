export class Input {
    constructor() {
        this.keys = {};
        this.prevKeys = {};
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
    }

    isPressed(code) {
        return this.keys[code] === true;
    }

    update() {
        this.prevKeys = { ...this.keys };
    }

    reset() {
        this.keys = {};
        this.prevKeys = {};
    }

    isJustPressedCode(code) {
        return this.keys[code] && !this.prevKeys[code];
    }
}
