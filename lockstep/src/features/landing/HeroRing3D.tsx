/**
 * The landing hero's 3D gold ring (Three.js via React Three Fiber). Lazy-loaded
 * only on capable desktops after the page is idle, so phones and slow devices keep
 * the static SVG ring and never download three.js. Lighting is built locally with
 * Lightformers, so no HDR file is fetched. It pauses when off-screen.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';

function Ring() {
  const group = useRef<THREE.Group>(null);
  const ticks = useRef<THREE.InstancedMesh>(null);
  const COUNT = 60;
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    const m = ticks.current;
    if (!m) return;
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2;
      const major = i % 5 === 0;
      dummy.position.set(Math.cos(a) * 1.86, Math.sin(a) * 1.86, 0);
      dummy.rotation.set(0, 0, a);
      dummy.scale.set(major ? 0.14 : 0.07, major ? 0.016 : 0.01, 0.01);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    g.rotation.z -= dt * 0.06;
    // a gentle parallax toward the pointer
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, 0.95 + state.pointer.y * 0.08, 0.04);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, -0.32 + state.pointer.x * 0.1, 0.04);
  });

  return (
    <group ref={group} rotation={[0.95, -0.32, 0]}>
      <mesh>
        <torusGeometry args={[1.6, 0.05, 48, 256]} />
        <meshStandardMaterial color="#8E7037" metalness={1} roughness={0.32} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[1.6, 0.062, 48, 256, Math.PI * 1.35]} />
        <meshStandardMaterial color="#E5CC91" metalness={1} roughness={0.18} />
      </mesh>
      <instancedMesh ref={ticks} args={[undefined, undefined, COUNT]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#C5A15A" metalness={0.9} roughness={0.35} />
      </instancedMesh>
      <mesh>
        <torusGeometry args={[1.32, 0.008, 16, 200]} />
        <meshStandardMaterial color="#C5A15A" metalness={0.8} roughness={0.5} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

export default function HeroRing3D() {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={box} className="size-full" aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 5.2], fov: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        frameloop={visible ? 'always' : 'never'}
      >
        <ambientLight intensity={0.15} />
        <Environment resolution={256} frames={1}>
          <Lightformer form="rect" intensity={4} color="#fff3dc" position={[3, 3, 4]} scale={[7, 2, 1]} />
          <Lightformer form="rect" intensity={1.5} color="#c5a15a" position={[-4, -2, 3]} scale={[5, 3, 1]} />
          <Lightformer form="ring" intensity={2} color="#ffffff" position={[0, 0, 6]} scale={3} />
        </Environment>
        <Ring />
      </Canvas>
    </div>
  );
}
