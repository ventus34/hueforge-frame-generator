import React, { useEffect, useId, useRef, useState } from 'react';
import type { FrameParams } from '../utils/geometry';
import { getFramePlanDimensions, isStripValid, MAX_STRIPS, STRIP_LIMITS } from '../utils/mounting';
import type { StripPlacement } from '../utils/mounting';
import { TRANSLATIONS } from '../utils/translations';
import type { Lang } from '../utils/translations';
import './MountingPlanner.css';

export interface Strip extends StripPlacement {
  id: string;
  size: 'S' | 'M' | 'L' | 'custom';
}

interface MountingPlannerProps {
  params: FrameParams;
  bedSize?: { x: number; y: number };
  lang: Lang;
  strips: Strip[];
  setStrips: React.Dispatch<React.SetStateAction<Strip[]>>;
  activeStripId: string | null;
  setActiveStripId: (id: string | null) => void;
}

type StripSize = Strip['size'];
type StripField = 'w' | 'l' | 'angle';
type Interaction =
  | { pointerId: number; kind: 'pan'; lastX: number; lastY: number }
  | { pointerId: number; kind: 'drag'; stripId: string; offsetX: number; offsetY: number };

const STRIP_SIZES: Record<StripSize, Pick<Strip, 'w' | 'l'>> = {
  S: { w: 16, l: 46 },
  M: { w: 19, l: 54 },
  L: { w: 19, l: 92 },
  custom: { w: 20, l: 50 }
};
const DEFAULT_BED_SIZE = { x: 256, y: 256 };
export const MountingPlanner: React.FC<MountingPlannerProps> = ({
  params,
  bedSize = DEFAULT_BED_SIZE,
  lang,
  strips,
  setStrips,
  activeStripId,
  setActiveStripId
}) => {
  const t = TRANSLATIONS[lang];
  const idPrefix = useId().replaceAll(':', '');
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const [draggedStripId, setDraggedStripId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 500, height: 500 });
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      setDimensions({
        width: entry.contentRect.width || 500,
        height: entry.contentRect.height || 500
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const frame = getFramePlanDimensions(params);
  const clampX = (value: number) => {
    const limit = Math.min(STRIP_LIMITS.x.max, frame.outerBoundsWidth / 2);
    return Math.max(-limit, Math.min(limit, value));
  };
  const clampY = (value: number) => {
    const limit = Math.min(STRIP_LIMITS.y.max, frame.outerBoundsLength / 2);
    return Math.max(-limit, Math.min(limit, value));
  };
  const maxDim = Math.max(frame.outerBoundsWidth, frame.outerBoundsLength, bedSize.x, bedSize.y);
  const availableSize = Math.max(1, Math.min(dimensions.width, dimensions.height) - 100);
  const baseScale = availableSize / Math.max(1, maxDim);
  const cx = dimensions.width / 2;
  const cy = dimensions.height / 2;
  const mmToPxX = (x: number) => x * baseScale;
  const mmToPxY = (y: number) => -y * baseScale;
  const svgPointToMm = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - rect.width / 2 - panOffset.x) / (baseScale * zoom),
      y: -(clientY - rect.top - rect.height / 2 - panOffset.y) / (baseScale * zoom)
    };
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) => Math.max(0.4, Math.min(5, current * (event.deltaY < 0 ? 1.15 : 1 / 1.15))));
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, []);

  const labelForStrip = (strip: Strip) => (
    strip.size === 'custom' ? t.stripCustom : t[`strip${strip.size}` as const]
  );

  const updateStripParam = (id: string, key: StripField, value: number) => {
    if (!Number.isFinite(value)) return;
    const limits = STRIP_LIMITS[key];
    const normalizedValue = key === 'angle'
      ? ((value % 360) + 360) % 360
      : Math.max(limits.min, Math.min(limits.max, value));
    setStrips((current) => current.map((strip) => {
      if (strip.id !== id) return strip;
      const updated = { ...strip, [key]: normalizedValue };
      if (key === 'w' || key === 'l') {
        const preset = (Object.keys(STRIP_SIZES) as StripSize[]).find((size) =>
          size !== 'custom' && updated.w === STRIP_SIZES[size].w && updated.l === STRIP_SIZES[size].l
        );
        updated.size = preset ?? 'custom';
      }
      return updated;
    }));
  };

  const updatePosition = (id: string, dx: number, dy: number) => {
    setStrips((current) => current.map((strip) => strip.id === id
      ? {
          ...strip,
          x: clampX(strip.x + dx),
          y: clampY(strip.y + dy)
        }
      : strip
    ));
  };

  const deleteStrip = (id: string) => {
    setStrips((current) => current.filter((strip) => strip.id !== id));
    setDraftValues((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith(`${id}:`))
    ));
    if (activeStripId === id) setActiveStripId(null);
  };

  const addStrip = (size: StripSize) => {
    if (strips.length >= MAX_STRIPS) return;
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const offset = (strips.length * 5) % 30;
    const added: Strip = {
      id,
      ...STRIP_SIZES[size],
      x: offset - 10,
      y: offset - 10,
      size,
      angle: 0
    };
    setStrips((current) => [...current, added]);
    setActiveStripId(id);
  };

  const resetView = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const beginPan = (event: React.PointerEvent<SVGSVGElement>) => {
    const target = event.target;
    if (
      !event.isPrimary || event.button !== 0 || interactionRef.current ||
      !(target instanceof SVGElement) || !target.closest('[data-pan-surface]')
    ) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    interactionRef.current = {
      pointerId: event.pointerId,
      kind: 'pan',
      lastX: event.clientX,
      lastY: event.clientY
    };
    setIsPanning(true);
  };

  const beginStripDrag = (event: React.PointerEvent<SVGGElement>, strip: Strip) => {
    if (!event.isPrimary || event.button !== 0 || interactionRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    const point = svgPointToMm(event.clientX, event.clientY);
    svgRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = {
      pointerId: event.pointerId,
      kind: 'drag',
      stripId: strip.id,
      offsetX: point.x - strip.x,
      offsetY: point.y - strip.y
    };
    setDraggedStripId(strip.id);
    setActiveStripId(strip.id);
  };

  const movePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    if (interaction.kind === 'pan') {
      setPanOffset((current) => ({
        x: current.x + event.clientX - interaction.lastX,
        y: current.y + event.clientY - interaction.lastY
      }));
      interaction.lastX = event.clientX;
      interaction.lastY = event.clientY;
      return;
    }

    const point = svgPointToMm(event.clientX, event.clientY);
    const x = point.x - interaction.offsetX;
    const y = point.y - interaction.offsetY;
    setStrips((current) => current.map((strip) => strip.id === interaction.stripId
      ? {
          ...strip,
          x: clampX(x),
          y: clampY(y)
        }
      : strip
    ));
  };

  const endPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (interactionRef.current?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    interactionRef.current = null;
    setDraggedStripId(null);
    setIsPanning(false);
  };

  const handleStripKeyDown = (event: React.KeyboardEvent<SVGGElement>, strip: Strip) => {
    const step = event.shiftKey ? 5 : 1;
    const moveByKey: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step]
    };
    const movement = moveByKey[event.key];
    if (movement) {
      event.preventDefault();
      setActiveStripId(strip.id);
      updatePosition(strip.id, movement[0], movement[1]);
    } else if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      setActiveStripId(strip.id);
      updateStripParam(strip.id, 'angle', strip.angle + (event.shiftKey ? -15 : 15));
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      deleteStrip(strip.id);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActiveStripId(strip.id);
    }
  };

  const inputKey = (strip: Strip, field: StripField) => `${strip.id}:${field}`;
  const displayValue = (strip: Strip, field: StripField, value: number) =>
    draftValues[inputKey(strip, field)] ?? String(value);
  const setDraft = (strip: Strip, field: StripField, value: string) => {
    setDraftValues((current) => ({ ...current, [inputKey(strip, field)]: value }));
  };
  const commitDraft = (strip: Strip, field: StripField) => {
    const key = inputKey(strip, field);
    const value = Number(draftValues[key]);
    if (draftValues[key]?.trim() && Number.isFinite(value)) updateStripParam(strip.id, field, value);
    setDraftValues((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const activeStrip = strips.find((strip) => strip.id === activeStripId) ?? null;
  const gridSpacingMinor = 10 * baseScale;
  const gridSpacingMajor = 50 * baseScale;
  const gridBedWidth = bedSize.x;
  const gridBedLength = bedSize.y;
  const scaleZoom = (change: number) => setZoom((current) => Math.max(0.4, Math.min(5, current + change)));

  return (
    <div className="mounting-planner">
      <div className="mounting-canvas" ref={containerRef}>
        <div className="mounting-toolbar" aria-label={t.plannerZoomTitle}>
          <button className="icon-btn" type="button" aria-label={t.plannerZoomIn} title={t.plannerZoomIn} onClick={() => scaleZoom(0.2)}>＋</button>
          <button className="icon-btn" type="button" aria-label={t.plannerZoomOut} title={t.plannerZoomOut} onClick={() => scaleZoom(-0.2)}>−</button>
          <button className="preset-btn" type="button" onClick={resetView}>{t.plannerResetView}</button>
        </div>

        <svg
          ref={svgRef}
          className="mounting-svg"
          role="group"
          aria-label={lang === 'pl' ? 'Planer położenia pasków rzepu' : 'Tape strip placement planner'}
          onPointerDown={beginPan}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onLostPointerCapture={endPointer}
          style={{ cursor: isPanning || draggedStripId ? 'grabbing' : 'grab' }}
        >
          <defs>
            <pattern id={`${idPrefix}-grid-minor`} width={gridSpacingMinor} height={gridSpacingMinor} patternUnits="userSpaceOnUse">
              <path d={`M ${gridSpacingMinor} 0 L 0 0 0 ${gridSpacingMinor}`} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth={0.5 / zoom} />
            </pattern>
            <pattern id={`${idPrefix}-grid-major`} width={gridSpacingMajor} height={gridSpacingMajor} patternUnits="userSpaceOnUse">
              <path d={`M ${gridSpacingMajor} 0 L 0 0 0 ${gridSpacingMajor}`} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth={1.2 / zoom} />
            </pattern>
          </defs>
          <g transform={`translate(${cx + panOffset.x}, ${cy + panOffset.y}) scale(${zoom})`}>
            <rect
              data-pan-surface
              x={-gridBedWidth * baseScale / 2}
              y={-gridBedLength * baseScale / 2}
              width={gridBedWidth * baseScale}
              height={gridBedLength * baseScale}
              fill="#0d0e12"
            />
            <rect x={-gridBedWidth * baseScale / 2} y={-gridBedLength * baseScale / 2} width={gridBedWidth * baseScale} height={gridBedLength * baseScale} fill={`url(#${idPrefix}-grid-minor)`} pointerEvents="none" />
            <rect x={-gridBedWidth * baseScale / 2} y={-gridBedLength * baseScale / 2} width={gridBedWidth * baseScale} height={gridBedLength * baseScale} fill={`url(#${idPrefix}-grid-major)`} pointerEvents="none" />
            <rect x={-gridBedWidth * baseScale / 2} y={-gridBedLength * baseScale / 2} width={gridBedWidth * baseScale} height={gridBedLength * baseScale} fill="none" stroke="#657080" strokeWidth={1 / zoom} pointerEvents="none" />

            {params.shape === 'hex' ? (
              <>
                <polygon data-pan-surface points={polyPointsHex(frame.wOut)} fill="rgba(51,34,17,.55)" stroke="rgba(255,81,0,.4)" strokeWidth={2 / zoom} />
                <polygon data-pan-surface points={polyPointsHex(frame.wPocket)} fill="rgba(51,34,17,.35)" stroke="rgba(255,255,255,.15)" strokeWidth={1.5 / zoom} strokeDasharray="4,4" />
                <polygon data-pan-surface points={polyPointsHex(frame.wHole)} fill="#0d0e12" stroke="rgba(255,255,255,.08)" strokeWidth={1.5 / zoom} />
              </>
            ) : (
              <>
                <rect data-pan-surface x={-frame.wOut * baseScale / 2} y={-frame.lOut * baseScale / 2} width={frame.wOut * baseScale} height={frame.lOut * baseScale} rx={params.cornerRadius * baseScale} ry={params.cornerRadius * baseScale} fill="rgba(51,34,17,.55)" stroke="rgba(255,81,0,.4)" strokeWidth={2 / zoom} />
                <rect data-pan-surface x={-frame.wPocket * baseScale / 2} y={-frame.lPocket * baseScale / 2} width={frame.wPocket * baseScale} height={frame.lPocket * baseScale} fill="rgba(51,34,17,.35)" stroke="rgba(255,255,255,.15)" strokeWidth={1.5 / zoom} strokeDasharray="4,4" />
                <rect data-pan-surface x={-frame.wHole * baseScale / 2} y={-frame.lHole * baseScale / 2} width={frame.wHole * baseScale} height={frame.lHole * baseScale} fill="#0d0e12" stroke="rgba(255,255,255,.08)" strokeWidth={1.5 / zoom} />
              </>
            )}

            {strips.map((strip) => {
              const valid = isStripValid(params, strip);
              const selected = activeStripId === strip.id;
              const status = valid
                ? (lang === 'pl' ? 'położenie poprawne' : 'valid placement')
                : (lang === 'pl' ? 'położenie nieprawidłowe' : 'invalid placement');
              const ariaLabel = `${labelForStrip(strip)}, ${strip.w} × ${strip.l} mm, ${lang === 'pl' ? 'pozycja' : 'position'} ${strip.x.toFixed(1)}, ${strip.y.toFixed(1)} mm, ${status}`;
              return (
                <g
                  key={strip.id}
                  className="mounting-strip"
                  transform={`translate(${mmToPxX(strip.x)}, ${mmToPxY(strip.y)}) rotate(${-strip.angle})`}
                  tabIndex={0}
                  role="button"
                  aria-label={ariaLabel}
                  aria-pressed={selected}
                  aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight R Shift+R Delete Backspace"
                  onPointerDown={(event) => beginStripDrag(event, strip)}
                  onFocus={() => setActiveStripId(strip.id)}
                  onClick={() => setActiveStripId(strip.id)}
                  onKeyDown={(event) => handleStripKeyDown(event, strip)}
                >
                  <rect
                    x={-strip.w * baseScale / 2}
                    y={-strip.l * baseScale / 2}
                    width={strip.w * baseScale}
                    height={strip.l * baseScale}
                    rx={4 / zoom}
                    ry={4 / zoom}
                    fill={valid ? 'rgba(0,168,255,.7)' : 'rgba(255,81,0,.65)'}
                    stroke={selected ? '#fff' : (valid ? '#00c8ff' : '#ff5100')}
                    strokeWidth={(selected ? 2 : 1) / zoom}
                    pointerEvents="none"
                  />
                  <text x={0} y={3} fill="#fff" fontSize={Math.max(7, 7 * baseScale)} fontFamily="sans-serif" fontWeight="bold" textAnchor="middle" pointerEvents="none" transform="scale(1,-1)">
                    {strip.size === 'custom' ? 'C' : strip.size}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

      </div>

      <aside className="mounting-controls" aria-label={t.plannerSelectedTitle}>
        <section className="mounting-control-section">
          <h3>{t.plannerZoomTitle}</h3>
          <div className="mounting-zoom-row">
            <button className="preset-btn" type="button" aria-label={t.plannerZoomOut} onClick={() => scaleZoom(-0.2)}>−</button>
            <input type="range" min="0.4" max="5" step="0.1" value={zoom} aria-label={t.plannerZoomTitle} onChange={(event) => setZoom(Number(event.target.value))} />
            <button className="preset-btn" type="button" aria-label={t.plannerZoomIn} onClick={() => scaleZoom(0.2)}>＋</button>
          </div>
          <div className="mounting-zoom-meta">
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" className="mounting-text-button" onClick={resetView}>{t.plannerResetView}</button>
          </div>
        </section>

        <section className="mounting-control-section">
          <h3>{t.plannerAddTitle}</h3>
          <div className="mounting-add-buttons">
            <button className="preset-btn" type="button" disabled={strips.length >= MAX_STRIPS} onClick={() => addStrip('S')}>{t.plannerSmall}</button>
            <button className="preset-btn" type="button" disabled={strips.length >= MAX_STRIPS} onClick={() => addStrip('M')}>{t.plannerMedium}</button>
            <button className="preset-btn" type="button" disabled={strips.length >= MAX_STRIPS} onClick={() => addStrip('L')}>{t.plannerLarge}</button>
            <button className="preset-btn" type="button" disabled={strips.length >= MAX_STRIPS} onClick={() => addStrip('custom')}>{t.plannerCustom}</button>
          </div>
        </section>

        {activeStrip && (
          <section className="mounting-control-section">
            <h3>{t.plannerSelectedTitle}</h3>
            <div className="mounting-selected-name">{t.plannerSizeLabel} <b>{labelForStrip(activeStrip)}</b></div>
            <div className="mounting-fields">
              {([
                ['w', t.plannerCustomWidth, activeStrip.w],
                ['l', t.plannerCustomLength, activeStrip.l],
                ['angle', t.plannerAngle, activeStrip.angle]
              ] as const).map(([field, label, value]) => {
                const id = `${idPrefix}-${activeStrip.id}-${field}`;
                const rangeId = `${id}-range`;
                const limits = STRIP_LIMITS[field];
                return (
                  <div className="mounting-field" key={field}>
                    <div className="mounting-field-head">
                      <label htmlFor={id}>{label}</label>
                      <output htmlFor={id}>{field === 'angle' ? `${value}°` : `${value} mm`}</output>
                    </div>
                    <div className="mounting-field-controls">
                      <input
                        id={rangeId}
                        type="range"
                        min={limits.min}
                        max={limits.max}
                        value={value}
                        aria-label={`${label} ${activeStrip.size}`}
                        onChange={(event) => {
                          updateStripParam(activeStrip.id, field, Number(event.target.value));
                          setDraftValues((current) => {
                            const next = { ...current };
                            delete next[inputKey(activeStrip, field)];
                            return next;
                          });
                        }}
                      />
                      <input
                        id={id}
                        className="numeric-input"
                        type="number"
                        min={limits.min}
                        max={limits.max}
                        step={field === 'angle' ? 1 : 0.1}
                        value={displayValue(activeStrip, field, value)}
                        aria-label={label}
                        onChange={(event) => setDraft(activeStrip, field, event.target.value)}
                        onBlur={() => commitDraft(activeStrip, field)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="preset-btn mounting-delete" type="button" onClick={() => deleteStrip(activeStrip.id)}>{t.plannerDelete}</button>
          </section>
        )}

        <details className="mounting-help">
          <summary>{lang === 'pl' ? 'Pomoc i skróty klawiaturowe' : 'Controls help'}</summary>
          <div className="mounting-help-content">
            <div>{t.plannerDragTip}</div>
            <div>{t.plannerWheelTip}</div>
            <div className="mounting-invalid-hint">{t.plannerInvalidTip}</div>
          </div>
        </details>

        <button className="preset-btn mounting-clear" type="button" onClick={() => {
          setStrips([]);
          setActiveStripId(null);
          setDraftValues({});
        }}>{t.plannerClearAll}</button>
      </aside>
    </div>
  );

  function polyPointsHex(size: number) {
    const radius = size / Math.sqrt(3);
    return Array.from({ length: 6 }, (_, index) => {
      const angle = (index * Math.PI) / 3;
      return `${radius * Math.cos(angle) * baseScale},${-radius * Math.sin(angle) * baseScale}`;
    }).join(' ');
  }
};
