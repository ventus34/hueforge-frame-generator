import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { generateFrameGeometry } from '../utils/geometry';
import type { FrameParams } from '../utils/geometry';
import type { Strip } from './MountingPlanner';

interface ThreePreviewProps {
  params: FrameParams;
  materialColor: string;
  showGrid: boolean;
  visualizeTape: boolean;
  strips: Strip[];
}

export const ThreePreview: React.FC<ThreePreviewProps> = ({
  params,
  materialColor,
  showGrid,
  visualizeTape,
  strips
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const tapeMeshesRef = useRef<THREE.Mesh[]>([]);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0e12);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    camera.position.set(200, 250, 300);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.1; // Limit rotating below ground
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight1.position.set(200, 400, 200);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dirLight2.position.set(-200, 200, -200);
    scene.add(dirLight2);

    const rimLight = new THREE.DirectionalLight(0x00c8ff, 0.25);
    rimLight.position.set(0, -300, 0);
    scene.add(rimLight);

    // 6. Grid Helper (Bambu Lab Print Bed 256x256)
    const gridHelper = new THREE.GridHelper(256, 32, 0x555555, 0x222222);
    gridHelper.position.y = -0.1; // Slightly below Z=0
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    // Coordinate Axes Helper (X Red, Y Green, Z Blue)
    const axesHelper = new THREE.AxesHelper(50);
    axesHelper.position.set(-128, 0, -128); // Sits at corner of build plate
    scene.add(axesHelper);

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);

      if (rendererRef.current && rendererRef.current.domElement.parentNode) {
        rendererRef.current.domElement.parentNode.removeChild(rendererRef.current.domElement);
      }
      
      // Dispose resources
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((mat) => mat.dispose());
        } else {
          object.material.dispose();
        }
      });
      
      renderer.dispose();
    };
  }, []);

  // Update Grid visibility
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  // Update Frame Geometry & Material Color
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove old mesh
    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach((mat) => mat.dispose());
      } else {
        meshRef.current.material.dispose();
      }
      meshRef.current = null;
    }

    // Generate new geometry
    const { positions, normals } = generateFrameGeometry(params);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

    // Create a beautiful plastic material representing 3D printed filament
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(materialColor),
      roughness: 0.45,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // In our geometry:
    // - X runs from -wOut/2 to wOut/2 (centered)
    // - Y runs from -lOut/2 to lOut/2 (centered)
    // - Z runs from 0 (back face, print bed) to height (front face, visible top)
    // In Three.js, Y is UP by default.
    // Rotate -90 degrees around X axis so:
    //   geometry Z=0 (back face) maps to Three.js Y=0 (print bed / bottom)
    //   geometry Z=height (front face) maps to Three.js Y=height (top, visible)
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0;

    scene.add(mesh);
    meshRef.current = mesh;

    // Adjust camera look-at center to match frame height
    if (controlsRef.current) {
      controlsRef.current.target.set(0, params.height / 2, 0);
    }
  }, [params, materialColor]);

  // Update Command Tape Strips Visualization
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Helper validation functions for 3D strip collision check
    const isPointInFrame = (x: number, y: number): boolean => {
      const wPocket = params.wPic + 2 * params.clearance;
      const lPocket = params.shape === 'hex' ? wPocket : (params.lPic + 2 * params.clearance);
      const wOut = wPocket + 2 * params.tBorder;
      const lOut = params.shape === 'hex' ? wOut : (lPocket + 2 * params.tBorder);

      if (params.shape === 'hex') {
        const isInsideHex = (px: number, py: number, size: number) => {
          const absY = Math.abs(py);
          const term1 = Math.abs(0.866025 * px + 0.5 * py);
          const term2 = Math.abs(-0.866025 * px + 0.5 * py);
          const limit = size / 2;
          return absY <= limit && term1 <= limit && term2 <= limit;
        };

        const inOuter = isInsideHex(x, y, wOut);
        const inInner = isInsideHex(x, y, wPocket);

        return inOuter && !inInner;
      } else {
        const absX = Math.abs(x);
        const absY = Math.abs(y);

        const inOuter = absX <= wOut / 2 && absY <= lOut / 2;
        const inInner = absX < wPocket / 2 && absY < lPocket / 2;

        if (inOuter && !inInner && params.cornerRadius > 0) {
          const r = Math.min(params.cornerRadius, wOut / 2, lOut / 2);
          const wLimit = wOut / 2 - r;
          const lLimit = lOut / 2 - r;

          if (absX > wLimit && absY > lLimit) {
            const dist = Math.sqrt((absX - wLimit) ** 2 + (absY - lLimit) ** 2);
            return dist <= r;
          }
        }

        return inOuter && !inInner;
      }
    };

    const isStripValid = (strip: Strip) => {
      const hw = strip.w / 2;
      const hl = strip.l / 2;

      const corners = [
        { x: -hw, y: -hl },
        { x: hw, y: -hl },
        { x: hw, y: hl },
        { x: -hw, y: hl }
      ];

      const theta = (strip.angle * Math.PI) / 180;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      return corners.every((c) => {
        const rotX = strip.x + c.x * cosT - c.y * sinT;
        const rotY = strip.y + c.x * sinT + c.y * cosT;
        return isPointInFrame(rotX, rotY);
      });
    };

    // Clear old tape meshes
    tapeMeshesRef.current.forEach((tMesh) => {
      scene.remove(tMesh);
      tMesh.geometry.dispose();
      if (Array.isArray(tMesh.material)) {
        tMesh.material.forEach((mat) => mat.dispose());
      } else {
        tMesh.material.dispose();
      }
    });
    tapeMeshesRef.current = [];

    if (!visualizeTape) return;

    // Place tape strips on the back face of the frame (Y = 0 in Three.js = print bed / back face).
    // Position slightly below Y = 0 (Y = -0.3) to avoid Z-fighting with the frame.
    // After our -90deg X rotation: geometry X→ThreeJS X, geometry Y→ThreeJS Z (negated), geometry Z→ThreeJS Y
    // Strip coordinates (strip.x, strip.y) are in frame's XY plane → map to Three.js (strip.x, -0.3, -strip.y)
    const backY = -0.3;

    strips.forEach((strip) => {
      // Create geometry specific to this strip's size
      const tapeGeom = new THREE.BoxGeometry(strip.w, 0.6, strip.l);
      const isValid = isStripValid(strip);

      // Translucent cyan material for valid, translucent red/orange for invalid
      const tapeMaterial = new THREE.MeshStandardMaterial({
        color: isValid ? 0x00c8ff : 0xff5100,
        transparent: true,
        opacity: isValid ? 0.6 : 0.75,
        roughness: 0.3,
        metalness: 0.1
      });

      const tapeMesh = new THREE.Mesh(tapeGeom, tapeMaterial);
      
      // Position on the back/bottom of the frame in Three.js space.
      // strip.x → Three X, strip.y → Three Z (negated due to -90deg X rotation)
      tapeMesh.position.set(strip.x, backY, -strip.y);
      tapeMesh.rotation.y = -(strip.angle * Math.PI) / 180; // Rotate around Y-axis (UP)

      scene.add(tapeMesh);
      tapeMeshesRef.current.push(tapeMesh);
    });
  }, [params, visualizeTape, strips]);

  return (
    <div className="canvas-container" ref={containerRef}>
      {/* Three.js canvas will be injected here */}
    </div>
  );
};
