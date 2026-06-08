import React, { useState, useRef, useEffect } from 'react';
import type { FrameParams } from '../utils/geometry';
import { TRANSLATIONS } from '../utils/translations';
import type { Lang } from '../utils/translations';

export interface Strip {
  id: string;
  x: number; // Center X in mm
  y: number; // Center Y in mm
  w: number; // Width in mm
  l: number; // Length in mm
  size: 'S' | 'M' | 'L' | 'custom';
  angle: number; // Rotation angle in degrees (0 to 360)
}

interface MountingPlannerProps {
  params: FrameParams;
  lang: Lang;
  strips: Strip[];
  setStrips: React.Dispatch<React.SetStateAction<Strip[]>>;
  activeStripId: string | null;
  setActiveStripId: (id: string | null) => void;
}

const STRIP_SIZES = {
  S: { w: 16, l: 46 },
  M: { w: 19, l: 54 },
  L: { w: 19, l: 92 },
  custom: { w: 20, l: 50 }
};

export const MountingPlanner: React.FC<MountingPlannerProps> = ({
  params,
  lang,
  strips,
  setStrips,
  activeStripId,
  setActiveStripId
}) => {
  const t = TRANSLATIONS[lang];
  const [draggedStripId, setDraggedStripId] = useState<string | null>(null);
  const dragStartOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom & Pan states
  const [zoom, setZoom] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dynamic dimensions of the canvas area
  const [dimensions, setDimensions] = useState({ width: 500, height: 500 });

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width || 500,
          height: entry.contentRect.height || 500
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Compute frame boundary dimensions in mm
  const wPocket = params.wPic + 2 * params.clearance;
  const lPocket = params.shape === 'hex' ? wPocket : (params.lPic + 2 * params.clearance);
  const wOut = wPocket + 2 * params.tBorder;
  const lOut = params.shape === 'hex' ? wOut : (lPocket + 2 * params.tBorder);

  // Compute support shelf and inner hole dimensions
  const maxShelf = Math.min(wPocket, lPocket) / 2 - 2;
  const actualShelf = Math.min(params.sShelf, maxShelf);
  const wHole = wPocket - 2 * actualShelf;
  const lHole = params.shape === 'hex' ? wHole : (lPocket - 2 * actualShelf);

  // Canvas base scaling parameters (fits frame inside measured viewport)
  const padding = 50;
  const maxDim = Math.max(wOut, lOut);
  const minCanvasDim = Math.min(dimensions.width, dimensions.height);
  const baseScale = (minCanvasDim - 2 * padding) / maxDim; // base pixels per mm

  // Center coordinate of the canvas in pixels
  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;

  // Convert mm coordinates to SVG screen pixels (relative to center)
  const mmToPxX = (x: number) => x * baseScale;
  const mmToPxY = (y: number) => -y * baseScale;

  // Convert screen coordinates back to mm, accounting for zoom and pan
  const pxToMm = (px: number, py: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    
    // Position relative to canvas center
    const xFromCenter = px - rect.width / 2 - panOffset.x;
    const yFromCenter = py - rect.height / 2 - panOffset.y;

    return {
      x: xFromCenter / (baseScale * zoom),
      y: -yFromCenter / (baseScale * zoom)
    };
  };

  // Native Wheel Event binding to support non-passive e.preventDefault()
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1.15;
      setZoom((prevZoom) => {
        const nextZoom = e.deltaY < 0 ? prevZoom * zoomFactor : prevZoom / zoomFactor;
        return Math.max(0.4, Math.min(5.0, nextZoom));
      });
    };

    svgEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svgEl.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Mouse event handlers
  const handleSvgMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    // Panning starts if clicking empty space, grid bed, or the background
    if (
      target.tagName === 'svg' ||
      target.id === 'backgroundRect' ||
      target.id === 'emptyCenter' ||
      target.id === 'gridBedRect' ||
      target.getAttribute('class')?.includes('grid-line')
    ) {
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      e.preventDefault();
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      panStart.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!draggedStripId || !svgRef.current) return;
    e.preventDefault();

    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const mmPos = pxToMm(px, py);
    const newX = mmPos.x - dragStartOffset.current.x;
    const newY = mmPos.y - dragStartOffset.current.y;

    // Constrain center within absolute outer frame boundaries
    const halfW = wOut / 2;
    const halfL = lOut / 2;

    setStrips((prev) =>
      prev.map((s) =>
        s.id === draggedStripId
          ? {
              ...s,
              x: Math.max(-halfW, Math.min(halfW, newX)),
              y: Math.max(-halfL, Math.min(halfL, newY))
            }
          : s
      )
    );
  };

  const handleSvgMouseUp = () => {
    setDraggedStripId(null);
    setIsPanning(false);
  };

  const startDrag = (e: React.MouseEvent, strip: Strip) => {
    e.stopPropagation();
    if (!svgRef.current) return;

    setActiveStripId(strip.id);
    setDraggedStripId(strip.id);

    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const mmPos = pxToMm(px, py);

    dragStartOffset.current = {
      x: mmPos.x - strip.x,
      y: mmPos.y - strip.y
    };
  };

  const addStrip = (size: 'S' | 'M' | 'L' | 'custom') => {
    const newId = Math.random().toString(36).substr(2, 9);
    const offset = (strips.length * 5) % 30;
    
    let w: number;
    let l: number;
    if (size === 'S') { w = STRIP_SIZES.S.w; l = STRIP_SIZES.S.l; }
    else if (size === 'M') { w = STRIP_SIZES.M.w; l = STRIP_SIZES.M.l; }
    else if (size === 'L') { w = STRIP_SIZES.L.w; l = STRIP_SIZES.L.l; }
    else { w = STRIP_SIZES.custom.w; l = STRIP_SIZES.custom.l; }

    const newStrip: Strip = {
      id: newId,
      x: offset - 10,
      y: offset - 10,
      w,
      l,
      size,
      angle: 0
    };
    setStrips([...strips, newStrip]);
    setActiveStripId(newId);
  };

  const deleteStrip = (id: string) => {
    setStrips(strips.filter((s) => s.id !== id));
    if (activeStripId === id) setActiveStripId(null);
  };

  const updateStripParam = (id: string, key: keyof Strip, value: number) => {
    setStrips(
      strips.map((s) => {
        if (s.id === id) {
          const updated = { ...s, [key]: value };
          
          // If we edited width or length, we check if it still matches preset dimensions
          if (key === 'w' || key === 'l') {
            const isPresetS = updated.w === STRIP_SIZES.S.w && updated.l === STRIP_SIZES.S.l;
            const isPresetM = updated.w === STRIP_SIZES.M.w && updated.l === STRIP_SIZES.M.l;
            const isPresetL = updated.w === STRIP_SIZES.L.w && updated.l === STRIP_SIZES.L.l;
            
            if (isPresetS) updated.size = 'S';
            else if (isPresetM) updated.size = 'M';
            else if (isPresetL) updated.size = 'L';
            else updated.size = 'custom';
          }
          
          return updated;
        }
        return s;
      })
    );
  };

  const clearAllStrips = () => {
    setStrips([]);
    setActiveStripId(null);
  };

  // Helper to check if a single point (x,y) in mm is inside the frame solid border area (including support shelf)
  const isPointInFrame = (x: number, y: number): boolean => {
    if (params.shape === 'hex') {
      const isInsideHex = (px: number, py: number, size: number) => {
        const absY = Math.abs(py);
        const term1 = Math.abs(0.866025 * px + 0.5 * py);
        const term2 = Math.abs(-0.866025 * px + 0.5 * py);
        const limit = size / 2;
        return absY <= limit && term1 <= limit && term2 <= limit;
      };

      const inOuter = isInsideHex(x, y, wOut);
      const inInner = isInsideHex(x, y, wHole);

      return inOuter && !inInner;
    } else {
      const absX = Math.abs(x);
      const absY = Math.abs(y);

      const inOuter = absX <= wOut / 2 && absY <= lOut / 2;
      const inInner = absX < wHole / 2 && absY < lHole / 2;

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

  // Check if a rotated strip is fully within the valid border area
  const checkStripStatus = (strip: Strip) => {
    const hw = strip.w / 2;
    const hl = strip.l / 2;

    // Unrotated corners relative to center
    const corners = [
      { x: -hw, y: -hl },
      { x: hw, y: -hl },
      { x: hw, y: hl },
      { x: -hw, y: hl }
    ];

    // Convert angle to radians
    const theta = (strip.angle * Math.PI) / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Check if all rotated corners are inside the solid border
    const isValid = corners.every((c) => {
      // Rotate corner and translate to strip center
      const rotX = strip.x + c.x * cosT - c.y * sinT;
      const rotY = strip.y + c.x * sinT + c.y * cosT;
      return isPointInFrame(rotX, rotY);
    });

    return isValid;
  };

  // Dynamic Grid definitions in screen pixels
  const gridSpacingMinor = 10 * baseScale;
  const gridSpacingMajor = 50 * baseScale;
  
  // Total virtual bed grid size in mm
  const gridBedSize = 500;
  const halfGridBed = gridBedSize / 2;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', height: '100%', minHeight: '460px' }}>
      
      {/* 2D Interactive SVG Canvas Container */}
      <div 
        ref={containerRef}
        style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0d0e12', overflow: 'hidden', width: '100%', height: '100%' }}
      >
        
        {/* Floating Zoom & Reset Toolbar (Top Left) */}
        <div style={{ position: 'absolute', top: '1rem', left: '1rem', display: 'flex', gap: '0.4rem', zIndex: 12 }}>
          <button 
            className="icon-btn" 
            style={{ borderRadius: '4px', width: '32px', height: '32px' }} 
            onClick={() => setZoom(z => Math.min(5.0, z + 0.2))} 
            title={t.plannerZoomIn}
          >
            ➕
          </button>
          <button 
            className="icon-btn" 
            style={{ borderRadius: '4px', width: '32px', height: '32px' }} 
            onClick={() => setZoom(z => Math.max(0.4, z - 0.2))} 
            title={t.plannerZoomOut}
          >
            ➖
          </button>
          <button 
            className="preset-btn" 
            style={{ padding: '0 0.5rem', fontSize: '0.8rem', height: '32px' }} 
            onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
          >
            {t.plannerResetView}
          </button>
        </div>

        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ position: 'absolute', top: 0, left: 0, cursor: isPanning ? 'grabbing' : (draggedStripId ? 'grabbing' : 'grab') }}
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleSvgMouseMove}
          onMouseUp={handleSvgMouseUp}
          onMouseLeave={handleSvgMouseUp}
        >
          {/* Dynamic Grid patterns in SVG (scale & zoom sensitive) */}
          <defs>
            {/* Minor grid lines every 10mm */}
            <pattern id="gridMinor" width={gridSpacingMinor} height={gridSpacingMinor} patternUnits="userSpaceOnUse">
              <path d={`M ${gridSpacingMinor} 0 L 0 0 0 ${gridSpacingMinor}`} fill="none" stroke="rgba(255, 255, 255, 0.08)" strokeWidth={0.5 / zoom} />
            </pattern>
            {/* Major grid lines every 50mm */}
            <pattern id="gridMajor" width={gridSpacingMajor} height={gridSpacingMajor} patternUnits="userSpaceOnUse">
              <path d={`M ${gridSpacingMajor} 0 L 0 0 0 ${gridSpacingMajor}`} fill="none" stroke="rgba(255, 255, 255, 0.18)" strokeWidth={1.2 / zoom} />
            </pattern>
          </defs>

          {/* MAIN ZOOM AND PAN ROOT GROUP */}
          <g transform={`translate(${cx + panOffset.x}, ${cy + panOffset.y}) scale(${zoom})`}>
            
            {/* Background virtual bed sheet */}
            <rect
              id="gridBedRect"
              x={-halfGridBed * baseScale}
              y={-halfGridBed * baseScale}
              width={gridBedSize * baseScale}
              height={gridBedSize * baseScale}
              fill="#0d0e12"
            />
            {/* Minor Grid Layer */}
            <rect
              x={-halfGridBed * baseScale}
              y={-halfGridBed * baseScale}
              width={gridBedSize * baseScale}
              height={gridBedSize * baseScale}
              fill="url(#gridMinor)"
              pointerEvents="none"
            />
            {/* Major Grid Layer */}
            <rect
              x={-halfGridBed * baseScale}
              y={-halfGridBed * baseScale}
              width={gridBedSize * baseScale}
              height={gridBedSize * baseScale}
              fill="url(#gridMajor)"
              pointerEvents="none"
            />

            {/* 1. DRAW FRAME BACKGROUND */}
            {params.shape === 'hex' ? (
              <>
                {/* Outer Hexagon */}
                <polygon
                  points={polyPointsHex(wOut)}
                  fill="rgba(51, 34, 17, 0.55)"
                  stroke="rgba(255, 81, 0, 0.4)"
                  strokeWidth={2 / zoom}
                />
                {/* Pocket Hexagon (Support Shelf Area boundary) */}
                <polygon
                  points={polyPointsHex(wPocket)}
                  fill="rgba(51, 34, 17, 0.35)"
                  stroke="rgba(255, 255, 255, 0.15)"
                  strokeWidth={1.5 / zoom}
                  strokeDasharray="4,4"
                />
                {/* Inner Hole Hexagon (Empty Center) */}
                <polygon
                  id="emptyCenter"
                  points={polyPointsHex(wHole)}
                  fill="#0d0e12"
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth={1.5 / zoom}
                />
              </>
            ) : (
              <>
                {/* Outer Rectangle */}
                <rect
                  x={-wOut * baseScale / 2}
                  y={-lOut * baseScale / 2}
                  width={wOut * baseScale}
                  height={lOut * baseScale}
                  rx={params.cornerRadius * baseScale}
                  ry={params.cornerRadius * baseScale}
                  fill="rgba(51, 34, 17, 0.55)"
                  stroke="rgba(255, 81, 0, 0.4)"
                  strokeWidth={2 / zoom}
                />
                {/* Pocket Rectangle (Support Shelf Area boundary) */}
                <rect
                  x={-wPocket * baseScale / 2}
                  y={-lPocket * baseScale / 2}
                  width={wPocket * baseScale}
                  height={lPocket * baseScale}
                  fill="rgba(51, 34, 17, 0.35)"
                  stroke="rgba(255, 255, 255, 0.15)"
                  strokeWidth={1.5 / zoom}
                  strokeDasharray="4,4"
                />
                {/* Inner Hole Rectangle (Empty Center) */}
                <rect
                  id="emptyCenter"
                  x={-wHole * baseScale / 2}
                  y={-lHole * baseScale / 2}
                  width={wHole * baseScale}
                  height={lHole * baseScale}
                  fill="#0d0e12"
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth={1.5 / zoom}
                />
              </>
            )}

            {/* 2. RENDER DRAGGABLE TAPE STRIPS */}
            {strips.map((strip) => {
              const wPx = strip.w * baseScale;
              const hPx = strip.l * baseScale;

              const isValid = checkStripStatus(strip);
              const isActive = activeStripId === strip.id;

              return (
                <g
                  key={strip.id}
                  transform={`translate(${mmToPxX(strip.x)}, ${mmToPxY(strip.y)}) rotate(${-strip.angle})`}
                  style={{ cursor: draggedStripId === strip.id ? 'grabbing' : 'grab' }}
                  onMouseDown={(e) => startDrag(e, strip)}
                >
                  {/* Visual Strip box centered at local (0,0) */}
                  <rect
                    x={-wPx / 2}
                    y={-hPx / 2}
                    width={wPx}
                    height={hPx}
                    rx={4 / zoom}
                    ry={4 / zoom}
                    fill={isValid ? 'rgba(0, 168, 255, 0.7)' : 'rgba(255, 81, 0, 0.65)'}
                    stroke={isActive ? '#ffffff' : (isValid ? '#00c8ff' : '#ff5100')}
                    strokeWidth={(isActive ? 2 : 1) / zoom}
                    style={{ transition: 'fill 0.15s' }}
                  />

                  {/* Strip size text label */}
                  <text
                    x={0}
                    y={3}
                    fill="#ffffff"
                    fontSize={Math.max(7, 7 * baseScale)}
                    fontFamily="sans-serif"
                    fontWeight="bold"
                    textAnchor="middle"
                    pointerEvents="none"
                    transform="scale(1, -1)" // Invert Y scaling for correct text orientation
                  >
                    {strip.size === 'custom' ? 'C' : strip.size}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {/* HUD help text inside Canvas */}
        <div style={{ position: 'absolute', bottom: '1rem', left: '1rem', pointerEvents: 'none', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.2rem', backgroundColor: 'rgba(0,0,0,0.7)', padding: '0.5rem 0.75rem', borderRadius: '4px', maxWidth: '320px', lineHeight: '1.3' }}>
          <div>{t.plannerDragTip}</div>
          <div>{t.plannerWheelTip}</div>
          <div style={{ color: 'var(--color-primary-hover)' }}>{t.plannerInvalidTip}</div>
        </div>
      </div>

      {/* Control Sidebar for Planner */}
      <div style={{ padding: '1rem', background: '#12141a', borderLeft: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
        
        {/* Zoom / View Control (Robust Sidebar Panel) */}
        <div>
          <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
            {t.plannerZoomTitle}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button className="preset-btn" style={{ flex: '0 0 32px', height: '32px', padding: 0 }} onClick={() => setZoom(z => Math.max(0.4, z - 0.2))}>
              ➖
            </button>
            <input
              type="range"
              min="0.4"
              max="4.0"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <button className="preset-btn" style={{ flex: '0 0 32px', height: '32px', padding: 0 }} onClick={() => setZoom(z => Math.min(4.0, z + 0.2))}>
              ➕
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
              style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '0.75rem', padding: 0 }}
            >
              {t.plannerResetView}
            </button>
          </div>
        </div>

        {/* Add strips buttons */}
        <div>
          <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
            {t.plannerAddTitle}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <button className="preset-btn" onClick={() => addStrip('S')}>
              {t.plannerSmall}
            </button>
            <button className="preset-btn" onClick={() => addStrip('M')}>
              {t.plannerMedium}
            </button>
            <button className="preset-btn" onClick={() => addStrip('L')}>
              {t.plannerLarge}
            </button>
            <button className="preset-btn" onClick={() => addStrip('custom')}>
              {t.plannerCustom}
            </button>
          </div>
        </div>

        {/* Selected strip options */}
        {activeStripId && strips.find(s => s.id === activeStripId) && (
          <div>
            <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
              {t.plannerSelectedTitle}
            </h3>
            {(() => {
              const s = strips.find((x) => x.id === activeStripId)!;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-main)' }}>
                    {t.plannerSizeLabel} <b>{s.size === 'custom' ? t.stripCustom : t[`strip${s.size}` as const]}</b>
                  </div>

                  {/* Width slider + numeric input */}
                  <div className="form-field">
                    <div className="field-header">
                      <span className="field-label" style={{ fontSize: '0.8rem' }}>{t.plannerCustomWidth}</span>
                      <span className="field-value" style={{ fontSize: '0.8rem' }}>{s.w} mm</span>
                    </div>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="5"
                        max="50"
                        value={s.w}
                        onChange={(e) => updateStripParam(s.id, 'w', parseInt(e.target.value))}
                      />
                      <input
                        type="number"
                        className="numeric-input"
                        min="5"
                        max="50"
                        value={s.w}
                        onChange={(e) => updateStripParam(s.id, 'w', parseInt(e.target.value) || 5)}
                        style={{ width: '55px', padding: '0.25rem' }}
                      />
                    </div>
                  </div>

                  {/* Length slider + numeric input */}
                  <div className="form-field">
                    <div className="field-header">
                      <span className="field-label" style={{ fontSize: '0.8rem' }}>{t.plannerCustomLength}</span>
                      <span className="field-value" style={{ fontSize: '0.8rem' }}>{s.l} mm</span>
                    </div>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="10"
                        max="150"
                        value={s.l}
                        onChange={(e) => updateStripParam(s.id, 'l', parseInt(e.target.value))}
                      />
                      <input
                        type="number"
                        className="numeric-input"
                        min="10"
                        max="150"
                        value={s.l}
                        onChange={(e) => updateStripParam(s.id, 'l', parseInt(e.target.value) || 10)}
                        style={{ width: '55px', padding: '0.25rem' }}
                      />
                    </div>
                  </div>

                  {/* Free Rotation Angle slider + numeric input */}
                  <div className="form-field">
                    <div className="field-header">
                      <span className="field-label" style={{ fontSize: '0.8rem' }}>{t.plannerAngle}</span>
                      <span className="field-value" style={{ fontSize: '0.8rem' }}>{s.angle}°</span>
                    </div>
                    <div className="slider-container">
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={s.angle}
                        onChange={(e) => updateStripParam(s.id, 'angle', parseInt(e.target.value))}
                      />
                      <input
                        type="number"
                        className="numeric-input"
                        min="0"
                        max="360"
                        value={s.angle}
                        onChange={(e) => {
                          let val = parseInt(e.target.value);
                          if (isNaN(val)) val = 0;
                          val = val % 360;
                          if (val < 0) val += 360;
                          updateStripParam(s.id, 'angle', val);
                        }}
                        style={{ width: '55px', padding: '0.25rem' }}
                      />
                    </div>
                  </div>

                  <button className="preset-btn" style={{ borderColor: '#ff5100', color: '#ff5100', marginTop: '0.25rem' }} onClick={() => deleteStrip(s.id)}>
                    {t.plannerDelete}
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        <div style={{ marginTop: 'auto' }}>
          <button className="preset-btn" style={{ width: '100%', color: 'var(--text-muted)' }} onClick={clearAllStrips}>
            {t.plannerClearAll}
          </button>
        </div>
      </div>

    </div>
  );

  // Helper to generate coordinates relative to center (0,0) for hexagonal borders in SVG
  function polyPointsHex(size: number) {
    const r = size / Math.sqrt(3);
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const px = r * Math.cos(angle) * baseScale;
      const py = -r * Math.sin(angle) * baseScale; // invert Y
      pts.push(`${px},${py}`);
    }
    return pts.join(' ');
  }
};
