import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { isStripValid } from '../utils/mounting';
import type { FrameParams, SplitPart } from '../utils/geometry';
import type { Lang } from '../utils/translations';
import type { Strip } from './MountingPlanner';

interface ThreePreviewProps {
  params: FrameParams;
  materialColor: string;
  showGrid: boolean;
  visualizeTape: boolean;
  strips: Strip[];
  /** Cached by the parent so presentation-only changes never regenerate model geometry. */
  geometry?: { positions: Float32Array; normals: Float32Array } | null;
  /** Cached by the parent when split mode is enabled. */
  splitParts?: SplitPart[] | null;
  /** Printable bed dimensions in millimeters. Defaults to a 256 × 256 mm bed. */
  bedSize?: { x: number; y: number };
  lang?: Lang;
}

const DEFAULT_BED_SIZE = { x: 256, y: 256 };

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material.dispose();
}

function disposeSceneResources(root: THREE.Object3D, additionalMaterials: THREE.Material[] = []) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>(additionalMaterials);
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh ||
      object instanceof THREE.Line ||
      object instanceof THREE.Points
    ) {
      geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
      else materials.add(object.material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function makeBedGrid(bedSize: { x: number; y: number }) {
  const group = new THREE.Group();
  const minorPositions: number[] = [];
  const majorPositions: number[] = [];
  const edgePositions: number[] = [];
  const y = -0.1;
  const minorSpacing = 10;
  const majorSpacing = 50;

  const addLine = (positions: number[], x1: number, z1: number, x2: number, z2: number) => {
    positions.push(x1, y, z1, x2, y, z2);
  };

  const firstX = Math.ceil((-bedSize.x / 2) / minorSpacing) * minorSpacing;
  const firstZ = Math.ceil((-bedSize.y / 2) / minorSpacing) * minorSpacing;
  for (let x = firstX; x <= bedSize.x / 2; x += minorSpacing) {
    if (Math.abs(x) >= bedSize.x / 2 - 1e-6) continue;
    const target = Math.abs(x % majorSpacing) < 1e-6 ? majorPositions : minorPositions;
    addLine(target, x, -bedSize.y / 2, x, bedSize.y / 2);
  }
  for (let z = firstZ; z <= bedSize.y / 2; z += minorSpacing) {
    if (Math.abs(z) >= bedSize.y / 2 - 1e-6) continue;
    const target = Math.abs(z % majorSpacing) < 1e-6 ? majorPositions : minorPositions;
    addLine(target, -bedSize.x / 2, z, bedSize.x / 2, z);
  }

  addLine(edgePositions, -bedSize.x / 2, -bedSize.y / 2, bedSize.x / 2, -bedSize.y / 2);
  addLine(edgePositions, bedSize.x / 2, -bedSize.y / 2, bedSize.x / 2, bedSize.y / 2);
  addLine(edgePositions, bedSize.x / 2, bedSize.y / 2, -bedSize.x / 2, bedSize.y / 2);
  addLine(edgePositions, -bedSize.x / 2, bedSize.y / 2, -bedSize.x / 2, -bedSize.y / 2);

  const addGridLines = (positions: number[], color: number, opacity: number) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    group.add(new THREE.LineSegments(geometry, material));
  };

  addGridLines(minorPositions, 0x222222, 1);
  addGridLines(majorPositions, 0x444444, 1);
  addGridLines(edgePositions, 0x666666, 1);
  return group;
}

function getRequiredCameraDistance(camera: THREE.PerspectiveCamera, bounds: { width: number; depth: number; height: number }) {
  const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const tanHorizontal = tanVertical * Math.max(camera.aspect, 0.01);
  return 1.25 * Math.max(
    bounds.width / (2 * tanHorizontal),
    bounds.depth / (2 * tanHorizontal),
    bounds.height / (2 * tanVertical)
  );
}

export const ThreePreview: React.FC<ThreePreviewProps> = ({
  params,
  materialColor,
  showGrid,
  visualizeTape,
  strips,
  geometry,
  splitParts,
  bedSize = DEFAULT_BED_SIZE,
  lang = 'en'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const modelMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const modelMeshesRef = useRef<THREE.Mesh[]>([]);
  const tapeMeshesRef = useRef<THREE.Mesh[]>([]);
  const gridGroupRef = useRef<THREE.Group | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  const invalidateRef = useRef<() => void>(() => undefined);
  const didAutoFrameRef = useRef(false);
  const fitBoundsRef = useRef({ width: DEFAULT_BED_SIZE.x, depth: DEFAULT_BED_SIZE.y, height: 0 });
  const [renderFailed, setRenderFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let scene: THREE.Scene | null = null;
    let frameId: number | null = null;
    let active = true;
    let failed = false;
    let interacting = false;
    let width = 0;
    let height = 0;
    let resizeObserver: ResizeObserver | null = null;

    const stopRendering = () => {
      if (failed) return;
      failed = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
      setRenderFailed(true);
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      stopRendering();
    };

    const renderFrame = () => {
      frameId = null;
      if (!active || failed || !renderer || !scene || !cameraRef.current || width <= 0 || height <= 0) {
        return;
      }

      try {
        controls?.update();
        renderer.render(scene, cameraRef.current);
        if (interacting) invalidateRef.current();
      } catch {
        stopRendering();
      }
    };

    const invalidate = () => {
      if (!active || failed || frameId !== null || width <= 0 || height <= 0) return;
      frameId = requestAnimationFrame(renderFrame);
    };

    const handleResize = () => {
      try {
        const nextWidth = container.clientWidth;
        const nextHeight = container.clientHeight;
        if (nextWidth <= 0 || nextHeight <= 0) {
          width = 0;
          height = 0;
          if (frameId !== null) cancelAnimationFrame(frameId);
          frameId = null;
          return;
        }
        if (!renderer || !cameraRef.current) return;
        if (nextWidth === width && nextHeight === height) return;
        width = nextWidth;
        height = nextHeight;
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        const requiredDistance = getRequiredCameraDistance(cameraRef.current, fitBoundsRef.current);
        if (controls) {
          const offset = cameraRef.current.position.clone().sub(controls.target);
          if (offset.length() < requiredDistance) {
            if (offset.lengthSq() < 1e-12) offset.set(0.45, 0.56, 0.69);
            offset.normalize().multiplyScalar(requiredDistance);
            cameraRef.current.position.copy(controls.target).add(offset);
            controls.update();
          }
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height);
        invalidate();
      } catch {
        stopRendering();
      }
    };

    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0d0e12);

      const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
      camera.position.set(200, 250, 300);
      cameraRef.current = camera;

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.shadowMap.enabled = true;
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);
      container.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI;
      controlsRef.current = controls;
      controls.addEventListener('change', invalidate);
      controls.addEventListener('start', () => {
        interacting = true;
        invalidate();
      });
      controls.addEventListener('end', () => {
        interacting = false;
        invalidate();
      });

      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
      dirLight1.position.set(200, 400, 200);
      scene.add(dirLight1);
      const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
      dirLight2.position.set(-200, 200, -200);
      scene.add(dirLight2);
      const rimLight = new THREE.DirectionalLight(0x00c8ff, 0.25);
      rimLight.position.set(0, -300, 0);
      scene.add(rimLight);

      const modelGroup = new THREE.Group();
      scene.add(modelGroup);
      modelGroupRef.current = modelGroup;
      modelMaterialRef.current = new THREE.MeshStandardMaterial({
        color: new THREE.Color(materialColor),
        roughness: 0.45,
        metalness: 0.1,
        side: THREE.DoubleSide
      });

      const gridGroup = makeBedGrid(DEFAULT_BED_SIZE);
      scene.add(gridGroup);
      gridGroupRef.current = gridGroup;
      const axesHelper = new THREE.AxesHelper(50);
      axesHelper.position.set(-DEFAULT_BED_SIZE.x / 2, 0, -DEFAULT_BED_SIZE.y / 2);
      scene.add(axesHelper);
      axesHelperRef.current = axesHelper;
      sceneRef.current = scene;
      invalidateRef.current = invalidate;

      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(container);
      } else {
        window.addEventListener('resize', handleResize);
      }
      handleResize();
      invalidate();
    } catch {
      active = false;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      controls?.dispose();
      if (scene) disposeSceneResources(scene, modelMaterialRef.current ? [modelMaterialRef.current] : []);
      renderer?.domElement.removeEventListener('webglcontextlost', handleContextLost, false);
      renderer?.dispose();
      if (renderer?.domElement.parentNode === container) container.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      modelGroupRef.current = null;
      modelMaterialRef.current = null;
      gridGroupRef.current = null;
      axesHelperRef.current = null;
      const errorFrame = requestAnimationFrame(() => setRenderFailed(true));
      return () => cancelAnimationFrame(errorFrame);
    }

    return () => {
      active = false;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      if (frameId !== null) cancelAnimationFrame(frameId);
      controls?.removeEventListener('change', invalidate);
      controls?.dispose();
      if (scene) disposeSceneResources(scene, modelMaterialRef.current ? [modelMaterialRef.current] : []);
      renderer?.domElement.removeEventListener('webglcontextlost', handleContextLost, false);
      renderer?.dispose();
      if (renderer?.domElement.parentNode === container) container.removeChild(renderer.domElement);
      invalidateRef.current = () => undefined;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      modelGroupRef.current = null;
      modelMaterialRef.current = null;
      modelMeshesRef.current = [];
      tapeMeshesRef.current = [];
      gridGroupRef.current = null;
      axesHelperRef.current = null;
    };
    // The renderer is initialized once. Model props are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const gridGroup = gridGroupRef.current;
    const scene = sceneRef.current;
    if (!scene || !gridGroup) return;

    const safeBedSize = {
      x: Number.isFinite(bedSize.x) && bedSize.x > 0 ? bedSize.x : DEFAULT_BED_SIZE.x,
      y: Number.isFinite(bedSize.y) && bedSize.y > 0 ? bedSize.y : DEFAULT_BED_SIZE.y
    };
    const newGrid = makeBedGrid(safeBedSize);
    newGrid.visible = gridGroup.visible;
    scene.remove(gridGroup);
    disposeSceneResources(gridGroup);
    scene.add(newGrid);
    gridGroupRef.current = newGrid;

    const axesHelper = axesHelperRef.current;
    if (axesHelper) {
      axesHelper.position.set(-safeBedSize.x / 2, 0, -safeBedSize.y / 2);
    }
    invalidateRef.current();
  }, [bedSize.x, bedSize.y]);

  useEffect(() => {
    const gridGroup = gridGroupRef.current;
    if (gridGroup) gridGroup.visible = showGrid;
    invalidateRef.current();
  }, [showGrid]);

  useEffect(() => {
    const group = modelGroupRef.current;
    const material = modelMaterialRef.current;
    if (!group || !material) return;

    modelMeshesRef.current.forEach((mesh) => {
      group.remove(mesh);
      mesh.geometry.dispose();
    });
    modelMeshesRef.current = [];

    const addMesh = (positions: Float32Array, normals: Float32Array) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.rotation.x = -Math.PI / 2;
      group.add(mesh);
      modelMeshesRef.current.push(mesh);
      return mesh;
    };

    if (params.splitEnabled) {
      const parts = splitParts ?? [];
      if (params.shape === 'hex') {
        const counts = Array(6).fill(0) as number[];
        parts.forEach((part) => {
          const match = part.name.match(/Side (\d+)/);
          if (match) counts[parseInt(match[1], 10) - 1] += 1;
        });

        parts.forEach((part) => {
          const mesh = addMesh(part.positions, part.normals);
          const match = part.name.match(/Side (\d+)(?:\s*-\s*Part\s*(\d+))?/);
          if (!match) return;
          const sideIndex = parseInt(match[1], 10) - 1;
          const partIndex = match[2] ? parseInt(match[2], 10) - 1 : 0;
          const count = counts[sideIndex];
          const angle = (sideIndex * Math.PI) / 3 + Math.PI / 6;
          const normalX = Math.cos(angle);
          const normalY = Math.sin(angle);
          const tangentX = -Math.sin(angle);
          const tangentY = Math.cos(angle);
          const gap = 2.5;
          const tangentOffset = count > 1 ? (partIndex - (count - 1) / 2) * gap : 0;
          const dx = gap * normalX + tangentOffset * tangentX;
          const dy = gap * normalY + tangentOffset * tangentY;
          mesh.position.set(dx, 0, -dy);
        });
      } else {
        const counts = { top: 0, bottom: 0, left: 0, right: 0 };
        parts.forEach((part) => {
          if (part.name.startsWith('Top')) counts.top += 1;
          else if (part.name.startsWith('Bottom')) counts.bottom += 1;
          else if (part.name.startsWith('Left')) counts.left += 1;
          else if (part.name.startsWith('Right')) counts.right += 1;
        });
        const indices = { top: 0, bottom: 0, left: 0, right: 0 };
        parts.forEach((part) => {
          const mesh = addMesh(part.positions, part.normals);
          const gap = 2.5;
          let dx = 0;
          let dy = 0;
          if (part.name.startsWith('Top')) {
            dy = gap;
            const count = counts.top;
            const index = indices.top++;
            if (count > 1) dx = (index - (count - 1) / 2) * gap;
          } else if (part.name.startsWith('Bottom')) {
            dy = -gap;
            const count = counts.bottom;
            const index = indices.bottom++;
            if (count > 1) dx = ((count - 1 - index) - (count - 1) / 2) * gap;
          } else if (part.name.startsWith('Left')) {
            dx = -gap;
            const count = counts.left;
            const index = indices.left++;
            if (count > 1) dy = (index - (count - 1) / 2) * gap;
          } else if (part.name.startsWith('Right')) {
            dx = gap;
            const count = counts.right;
            const index = indices.right++;
            if (count > 1) dy = ((count - 1 - index) - (count - 1) / 2) * gap;
          }
          mesh.position.set(dx, 0, -dy);
        });
      }
    } else if (geometry) {
      addMesh(geometry.positions, geometry.normals).position.y = 0;
    }

    invalidateRef.current();
  }, [geometry, params.shape, params.splitEnabled, splitParts]);

  useEffect(() => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    controls.target.set(0, params.height / 2, 0);
    const wPocket = params.wPic + 2 * params.clearance;
    const lPocket = params.shape === 'hex' ? wPocket : params.lPic + 2 * params.clearance;
    const wOut = wPocket + 2 * params.tBorder;
    const lOut = lPocket + 2 * params.tBorder;
    const frameWidth = params.shape === 'hex' ? (2 * wOut) / Math.sqrt(3) : wOut;
    const frameDepth = params.shape === 'hex' ? wOut : lOut;
    const safeBedWidth = Number.isFinite(bedSize.x) && bedSize.x > 0 ? bedSize.x : DEFAULT_BED_SIZE.x;
    const safeBedDepth = Number.isFinite(bedSize.y) && bedSize.y > 0 ? bedSize.y : DEFAULT_BED_SIZE.y;
    fitBoundsRef.current = {
      width: Math.max(frameWidth, safeBedWidth),
      depth: Math.max(frameDepth, safeBedDepth),
      height: params.height
    };
    const requiredDistance = getRequiredCameraDistance(camera, fitBoundsRef.current);
    const offset = camera.position.clone().sub(controls.target);
    const currentDistance = offset.length();
    if (!didAutoFrameRef.current || currentDistance < requiredDistance) {
      if (!didAutoFrameRef.current || currentDistance < 1e-6) {
        offset.set(0.45, 0.56, 0.69);
      }
      offset.normalize().multiplyScalar(Math.max(currentDistance, requiredDistance));
      camera.position.copy(controls.target).add(offset);
    }
    didAutoFrameRef.current = true;
    controls.update();
    invalidateRef.current();
  }, [bedSize.x, bedSize.y, params]);

  useEffect(() => {
    const material = modelMaterialRef.current;
    if (material) {
      material.color.set(materialColor);
      invalidateRef.current();
    }
  }, [materialColor]);

  useEffect(() => {
    const material = modelMaterialRef.current;
    if (material) {
      const transparent = visualizeTape && strips.length > 0;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.opacity = transparent ? 0.45 : 1;
    }

    const scene = sceneRef.current;
    if (!scene) return;
    tapeMeshesRef.current.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      disposeMaterial(mesh.material);
    });
    tapeMeshesRef.current = [];

    if (visualizeTape) {
      const backY = -0.3;
      strips.forEach((strip) => {
        const valid = isStripValid(params, strip);
        const tapeGeometry = new THREE.BoxGeometry(strip.w, 0.6, strip.l);
        const tapeMaterial = new THREE.MeshStandardMaterial({
          color: valid ? 0x00c8ff : 0xff5100,
          transparent: true,
          opacity: valid ? 0.6 : 0.75,
          roughness: 0.3,
          metalness: 0.1
        });
        const tapeMesh = new THREE.Mesh(tapeGeometry, tapeMaterial);
        tapeMesh.position.set(strip.x, backY, -strip.y);
        tapeMesh.rotation.y = -(strip.angle * Math.PI) / 180;
        scene.add(tapeMesh);
        tapeMeshesRef.current.push(tapeMesh);
      });
    }
    invalidateRef.current();
  }, [params, strips, visualizeTape]);

  return (
    <div className="canvas-container" ref={containerRef}>
      {renderFailed && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            display: 'grid',
            placeItems: 'center',
            padding: '1.5rem',
            color: 'var(--text-main)',
            background: '#0d0e12',
            textAlign: 'center'
          }}
        >
          {lang === 'pl'
            ? 'Podgląd 3D jest niedostępny. Sprawdź obsługę WebGL w przeglądarce lub skorzystaj z planera 2D.'
            : 'The 3D preview is unavailable. Check that your browser supports WebGL or use the 2D mounting planner.'}
        </div>
      )}
    </div>
  );
};

export default ThreePreview;
