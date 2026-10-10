import * as THREE from 'three';
import { arcPoint } from '../sim/camera-path.js';

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * OrbitControls 只在建構時讀取 camera.up；站在球面上的店前時「上」是地面法線，
 * 所以要同步更新它內部的旋轉（three r170 的 _quat / _quatInverse）。
 */
export function setControlsUp(controls, camera, up) {
  camera.up.copy(up).normalize();
  controls._quat.setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0));
  controls._quatInverse.copy(controls._quat).invert();
}

/**
 * 鏡頭飛行：在 duration 秒內把位置、注視點與上方向平滑移到目標。
 * 飛行期間由這裡直接控制鏡頭，不呼叫 controls.update()。
 */
export function createCameraRig(camera, controls) {
  let flight = null;

  /** around：在星球附近飛行時沿球面弧線繞過去，避免直線穿過星球 */
  const flyTo = ({ position, target, up = new THREE.Vector3(0, 1, 0), around = null }, duration = 1.6) => new Promise((resolve) => {
    flight = {
      fromPos: camera.position.clone(),
      fromTarget: controls.target.clone(),
      fromUp: camera.up.clone(),
      toPos: position.clone(),
      toTarget: target.clone(),
      toUp: up.clone().normalize(),
      around,
      t: 0,
      duration,
      resolve,
    };
    controls.enabled = false;
  });

  const update = (dt) => {
    if (!flight) return;
    flight.t = Math.min(1, flight.t + dt / flight.duration);
    const k = easeInOutCubic(flight.t);
    if (flight.around) camera.position.copy(arcPoint(flight.fromPos, flight.toPos, k, flight.around));
    else camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
    camera.up.lerpVectors(flight.fromUp, flight.toUp, k).normalize();
    camera.lookAt(controls.target);
    if (flight.t >= 1) {
      const { resolve, toUp } = flight;
      flight = null;
      setControlsUp(controls, camera, toUp);
      controls.enabled = true;
      resolve();
    }
  };

  return { flyTo, update, get flying() { return flight !== null; } };
}

export const HOME = Object.freeze({
  position: new THREE.Vector3(0, 150, 290),
  target: new THREE.Vector3(0, 0, 0),
});
