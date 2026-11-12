// Xbox 360 / Standard Gamepad input & dual-motor rumble support for Linux

const STICK_DEADZONE = 0.20;
const TRIGGER_THRESHOLD = 0.30;

function applyRadialDeadzone(rawX, rawY, deadzone = STICK_DEADZONE) {
  const mag = Math.hypot(rawX, rawY);
  if (mag < deadzone) return { x: 0, y: 0, mag: 0 };
  const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone));
  return {
    x: (rawX / mag) * scaled,
    y: (rawY / mag) * scaled,
    mag: scaled,
  };
}

export class XboxController {
  constructor() {
    this.connected = false;
    this.gamepadIndex = null;
    this.id = '';
    this.prevButtons = new Map();

    // Normalized continuous frame state
    this.moveX = 0;       // -1 (left) .. +1 (right)
    this.moveY = 0;       // -1 (back) .. +1 (forward)
    this.lookX = 0;       // -1 .. +1 (right stick X)
    this.lookY = 0;       // -1 .. +1 (right stick Y)
    this.swimUp = false;  // Green A / RB
    this.swimDown = false;// Red B / LB / LT

    // One-shot edge-triggered actions per frame
    this.justPressedA = false;
    this.justPressedB = false;
    this.justPressedX = false;
    this.justPressedY = false;
    this.justPressedDash = false;
    this.justPressedStart = false;
    this.justPressedBack = false;
    this.justPressedR3 = false;

    window.addEventListener('gamepadconnected', (e) => {
      this.connected = true;
      this.gamepadIndex = e.gamepad.index;
      this.id = e.gamepad.id || 'Xbox 360 Controller';
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.gamepadIndex === e.gamepad.index) {
        this.connected = false;
        this.gamepadIndex = null;
      }
    });
  }

  _getActiveGamepad() {
    if (!navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (!pads) return null;

    if (this.gamepadIndex !== null && pads[this.gamepadIndex] && pads[this.gamepadIndex].connected) {
      return pads[this.gamepadIndex];
    }
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) {
        this.connected = true;
        this.gamepadIndex = i;
        this.id = pads[i].id || 'Xbox 360 Controller';
        return pads[i];
      }
    }
    this.connected = false;
    return null;
  }

  _edge(key, isDown) {
    const wasDown = this.prevButtons.get(key) || false;
    this.prevButtons.set(key, isDown);
    return isDown && !wasDown;
  }

  poll() {
    this.moveX = 0;
    this.moveY = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.swimUp = false;
    this.swimDown = false;
    this.justPressedA = false;
    this.justPressedB = false;
    this.justPressedX = false;
    this.justPressedY = false;
    this.justPressedDash = false;
    this.justPressedStart = false;
    this.justPressedBack = false;
    this.justPressedR3 = false;

    const gp = this._getActiveGamepad();
    if (!gp) return false;

    const isStandard = gp.mapping === 'standard';
    const btn = (idx) => Boolean(gp.buttons[idx] && gp.buttons[idx].pressed);
    const btnVal = (idx) => (gp.buttons[idx] ? gp.buttons[idx].value : 0);

    // 1. Left Stick + D-Pad movement
    const leftStick = applyRadialDeadzone(gp.axes[0] || 0, gp.axes[1] || 0);
    let dpadX = 0;
    let dpadY = 0;

    if (isStandard) {
      dpadY = (btn(12) ? -1 : 0) + (btn(13) ? 1 : 0);
      dpadX = (btn(14) ? -1 : 0) + (btn(15) ? 1 : 0);
    } else {
      // Raw Linux xpad fallback: axes[6], axes[7] are HAT0X, HAT0Y
      dpadX = Math.abs(gp.axes[6] || 0) > 0.4 ? Math.sign(gp.axes[6]) : 0;
      dpadY = Math.abs(gp.axes[7] || 0) > 0.4 ? Math.sign(gp.axes[7]) : 0;
    }

    const rawMoveX = Math.abs(dpadX) > Math.abs(leftStick.x) ? dpadX : leftStick.x;
    const rawMoveY = Math.abs(dpadY) > Math.abs(leftStick.y) ? dpadY : leftStick.y;
    this.moveX = rawMoveX;
    this.moveY = -rawMoveY; // +1 = swim forward, -1 = backward

    // 2. Right Stick camera orbit
    const rightStick = isStandard
      ? applyRadialDeadzone(gp.axes[2] || 0, gp.axes[3] || 0)
      : applyRadialDeadzone(gp.axes[3] || 0, gp.axes[4] || 0);
    this.lookX = rightStick.x;
    this.lookY = rightStick.y;

    // 3. Face buttons, Bumpers & Triggers (Xbox 360 layout)
    const aDown = btn(0); // Green A
    const bDown = btn(1); // Red B
    const xDown = btn(2); // Blue X
    const yDown = btn(3); // Yellow Y
    const lbDown = btn(4);
    const rbDown = btn(5);

    let ltDown = false;
    let rtDown = false;
    let backDown = false;
    let startDown = false;
    let r3Down = false;

    if (isStandard) {
      ltDown = btnVal(6) > TRIGGER_THRESHOLD || btn(6);
      rtDown = btnVal(7) > TRIGGER_THRESHOLD || btn(7);
      backDown = btn(8);
      startDown = btn(9);
      r3Down = btn(11);
    } else {
      // Raw Linux xpad: axes[2] = LT (-1..+1), axes[5] = RT (-1..+1), btn 6=Back, 7=Start, 10=R3
      ltDown = (gp.axes[2] !== undefined && gp.axes[2] > -0.35);
      rtDown = (gp.axes[5] !== undefined && gp.axes[5] > -0.35);
      backDown = btn(6);
      startDown = btn(7);
      r3Down = btn(10);
    }

    this.swimUp = aDown || rbDown;
    this.swimDown = bDown || lbDown || ltDown;

    this.justPressedA = this._edge('A', aDown);
    this.justPressedB = this._edge('B', bDown);
    this.justPressedX = this._edge('X', xDown);
    this.justPressedY = this._edge('Y', yDown);
    this.justPressedDash = this._edge('DASH', xDown || rtDown);
    this.justPressedStart = this._edge('START', startDown);
    this.justPressedBack = this._edge('BACK', backDown);
    this.justPressedR3 = this._edge('R3', r3Down);

    return true;
  }

  rumble(duration = 120, weakMagnitude = 0.35, strongMagnitude = 0.2) {
    const gp = this._getActiveGamepad();
    if (!gp || !gp.vibrationActuator || typeof gp.vibrationActuator.playEffect !== 'function') {
      return;
    }
    gp.vibrationActuator
      .playEffect('dual-rumble', {
        startDelay: 0,
        duration,
        weakMagnitude: Math.min(1, Math.max(0, weakMagnitude)),
        strongMagnitude: Math.min(1, Math.max(0, strongMagnitude)),
      })
      .catch(() => {});
  }
}
