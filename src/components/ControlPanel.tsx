import React, { useEffect, useRef, useState } from 'react';
import type { FrameParams, SplitPart } from '../utils/geometry';
import { generateSplitFrameParts, generateBowtieKeyGeometry } from '../utils/geometry';
import { downloadSTL } from '../utils/stlExporter';
import { TRANSLATIONS } from '../utils/translations';
import type { Lang } from '../utils/translations';
import { getEffectiveFrameDimensions, normalizeFrameParams, validateFrameParams } from '../utils/params';
import { NumberInput } from './NumberInput';

interface ControlPanelProps {
  params: FrameParams;
  onChange: (newParams: FrameParams) => void;
  onDownload: () => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  lang: Lang;
  setLang: (lang: Lang) => void;
  cachedParts?: SplitPart[];
  exportDisabled?: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  params,
  onChange,
  onDownload,
  showGrid,
  setShowGrid,
  lang,
  setLang,
  cachedParts,
  exportDisabled = false
}) => {
  const t = TRANSLATIONS[lang];
  const [showSchematic, setShowSchematic] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showSchematic) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowSchematic(false);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeys);
    return () => {
      document.removeEventListener('keydown', handleDialogKeys);
      previousFocus?.focus();
    };
  }, [showSchematic]);

  const PRESETS = [
    { name: `${t.presetSquare} 200x200`, w: 200, l: 200, shape: 'rect' as const },
    { name: `${t.presetSquare} 100x100`, w: 100, l: 100, shape: 'rect' as const },
    { name: `${t.presetHex} 100 (Hex)`, w: 100, l: 100, shape: 'hex' as const },
    { name: `${t.presetHex} 200 (Hex)`, w: 200, l: 200, shape: 'hex' as const },
    { name: `${t.presetPhoto} 150x200`, w: 150, l: 200, shape: 'rect' as const },
    { name: `${t.presetPosterM}`, w: 320, l: 450, shape: 'rect' as const },
    { name: `${t.presetPosterL}`, w: 480, l: 675, shape: 'rect' as const },
    { name: `${t.presetPosterXL}`, w: 640, l: 900, shape: 'rect' as const }
  ];

  const updateParam = <K extends keyof FrameParams>(key: K, value: FrameParams[K]) => {
    const newParams = { ...params, [key]: value };

    if (key === 'shape') {
      if (value === 'hex') {
        newParams.cornerRadius = 0;
        newParams.hangerEnabled = false;
        if (newParams.jointType === 'bowtie') {
          newParams.jointType = 'half-lap';
        }
      }
    }

    if (key === 'height') {
      newParams.dPocket = Math.min(newParams.dPocket, newParams.height - 2);
    }

    if (key === 'splitEnabled' && value === true) {
      newParams.cornerRadius = 0;
    }

    onChange(normalizeFrameParams(newParams));
  };

  const applyPreset = (w: number, l: number, shape: 'rect' | 'hex') => {
    const newParams: FrameParams = {
      ...params,
      shape,
      wPic: w,
      lPic: l
    };

    if (shape === 'hex') {
      newParams.cornerRadius = 0;
      newParams.hangerEnabled = false;
      if (newParams.jointType === 'bowtie') {
        newParams.jointType = 'half-lap';
      }
    }

    onChange(normalizeFrameParams(newParams));
  };

  const dimensions = getEffectiveFrameDimensions(params);
  const maxShelfWidth = Math.max(1, Math.floor(Math.min(dimensions.pocketWidth, dimensions.pocketLength) / 2 - 2));
  const maxRadiusLimit = params.shape === 'rect' ? Math.min(params.tBorder, dimensions.outerWidth / 2, dimensions.outerLength / 2) : 0;
  const validationErrors = validateFrameParams(params);
  const exportBlocked = exportDisabled || validationErrors.length > 0;
  const splitParts = cachedParts ?? (validationErrors.length === 0 && params.splitEnabled ? generateSplitFrameParts(params) : []);

  return (
    <div className="sidebar glass-panel">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="logo-icon">🖼️</span>
          <h1>{t.title}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.05)', padding: '2px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={() => setLang('pl')}
            style={{
              padding: '2px 6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: lang === 'pl' ? 'var(--color-primary)' : 'none',
              border: 'none',
              borderRadius: '3px',
              color: '#fff',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            PL
          </button>
          <button
            onClick={() => setLang('en')}
            style={{
              padding: '2px 6px',
              fontSize: '0.75rem',
              fontWeight: 600,
              background: lang === 'en' ? 'var(--color-primary)' : 'none',
              border: 'none',
              borderRadius: '3px',
              color: '#fff',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            EN
          </button>
        </div>
      </div>

      <div className="control-group">
        
        {/* Preset Templates */}
        <div>
          <h2 className="section-title">{t.presetsTitle}</h2>
          <div className="presets-grid">
            {PRESETS.map((preset) => {
              const isActive = params.shape === preset.shape && params.wPic === preset.w && (preset.shape === 'hex' || params.lPic === preset.l);
              return (
                <button
                  key={preset.name}
                  type="button"
                  className={`preset-btn ${isActive ? 'active' : ''}`}
                  aria-pressed={isActive}
                  onClick={() => applyPreset(preset.w, preset.l, preset.shape)}
                >
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Frame Shape Selector */}
        <div>
          <h2 className="section-title">{t.shapeTitle}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button
              type="button"
              className={`preset-btn ${params.shape === 'rect' ? 'active' : ''}`}
              aria-pressed={params.shape === 'rect'}
              onClick={() => updateParam('shape', 'rect')}
            >
              {t.shapeRect}
            </button>
            <button
              type="button"
              className={`preset-btn ${params.shape === 'hex' ? 'active' : ''}`}
              aria-pressed={params.shape === 'hex'}
              onClick={() => updateParam('shape', 'hex')}
            >
              {t.shapeHex}
            </button>
          </div>
        </div>

        {/* Picture Dimensions */}
        <div>
          <h2 className="section-title">{t.picDimensionsTitle}</h2>
          
          {/* Picture Width */}
          <div className="form-field">
            <div className="field-header">
              <label className="field-label" htmlFor="picture-width-number">
                {params.shape === 'hex' ? t.picHexWidth : t.picWidth}
              </label>
              <span className="field-value">{params.wPic} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="50"
                max="1000"
                value={params.wPic}
                aria-label={params.shape === 'hex' ? t.picHexWidth : t.picWidth}
                onChange={(e) => updateParam('wPic', parseInt(e.target.value))}
              />
              <NumberInput
                key={params.wPic}
                id="picture-width-number"
                label={params.shape === 'hex' ? t.picHexWidth : t.picWidth}
                value={params.wPic}
                min={50}
                max={1000}
                lang={lang}
                onCommit={(value) => updateParam('wPic', value)}
              />
            </div>
          </div>

          {/* Picture Length (Only for rectangular frame) */}
          {params.shape === 'rect' && (
            <div className="form-field" style={{ marginTop: '1rem' }}>
              <div className="field-header">
                <label className="field-label" htmlFor="picture-length-number">{t.picLength}</label>
                <span className="field-value">{params.lPic} mm</span>
              </div>
              <div className="slider-container">
                <input
                  type="range"
                  min="50"
                  max="1000"
                  value={params.lPic}
                  aria-label={t.picLength}
                  onChange={(e) => updateParam('lPic', parseInt(e.target.value))}
                />
                <NumberInput
                  key={params.lPic}
                  id="picture-length-number"
                  label={t.picLength}
                  value={params.lPic}
                  min={50}
                  max={1000}
                  lang={lang}
                  onCommit={(value) => updateParam('lPic', value)}
                />
              </div>
            </div>
          )}

          {/* Clearance Tolerance */}
          <div className="form-field" style={{ marginTop: '1rem' }}>
            <div className="field-header">
              <label className="field-label" htmlFor="clearance-number">{t.clearance}</label>
              <span className="field-value">{params.clearance} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={params.clearance}
                aria-label={t.clearance}
                onChange={(e) => updateParam('clearance', parseFloat(e.target.value))}
              />
              <NumberInput
                key={params.clearance}
                id="clearance-number"
                label={t.clearance}
                value={params.clearance}
                min={0}
                max={2}
                step={0.1}
                lang={lang}
                onCommit={(value) => updateParam('clearance', value)}
              />
            </div>
          </div>
        </div>

        {/* Frame Outer Design Parameters */}
        <div>
          <h2 className="section-title">{t.frameParamsTitle}</h2>

          {/* Border Thickness */}
          <div className="form-field">
            <div className="field-header">
              <label className="field-label" htmlFor="border-thickness-number">{t.borderThickness}</label>
              <span className="field-value">{params.tBorder} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="3"
                max="30"
                value={params.tBorder}
                aria-label={t.borderThickness}
                onChange={(e) => updateParam('tBorder', parseInt(e.target.value))}
              />
              <NumberInput
                key={params.tBorder}
                id="border-thickness-number"
                label={t.borderThickness}
                value={params.tBorder}
                min={3}
                max={30}
                lang={lang}
                onCommit={(value) => updateParam('tBorder', value)}
              />
            </div>
          </div>

          {/* Corner Radius (Only for rectangle) */}
          {params.shape === 'rect' && (
            <div className="form-field" style={{ marginTop: '1rem' }}>
              <div className="field-header">
                <label className="field-label" htmlFor="corner-radius-number">{t.cornerRadius}</label>
                <span className="field-value">{params.cornerRadius} mm</span>
              </div>
              <div className="slider-container">
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, Math.floor(maxRadiusLimit))}
                  value={params.cornerRadius}
                  aria-label={t.cornerRadius}
                  disabled={params.splitEnabled}
                  onChange={(e) => updateParam('cornerRadius', parseInt(e.target.value))}
                />
                <NumberInput
                  key={params.cornerRadius}
                  id="corner-radius-number"
                  label={t.cornerRadius}
                  value={params.cornerRadius}
                  min={0}
                  max={Math.max(0, Math.floor(maxRadiusLimit))}
                  lang={lang}
                  disabled={params.splitEnabled}
                  onCommit={(value) => updateParam('cornerRadius', value)}
                />
              </div>
              {params.splitEnabled && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: '1.3' }}>
                  {lang === 'pl'
                    ? 'Zaokrąglenia są wyłączone przy dzieleniu ramki; promień ustawiono na 0 mm.'
                    : 'Corner rounding is disabled while the frame is split; the radius is set to 0 mm.'}
                </p>
              )}
            </div>
          )}

          {/* Total Height */}
          <div className="form-field" style={{ marginTop: '1rem' }}>
            <div className="field-header">
              <label className="field-label" htmlFor="height-number">{t.height}</label>
              <span className="field-value">{params.height} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="4"
                max="40"
                value={params.height}
                aria-label={t.height}
                onChange={(e) => updateParam('height', parseInt(e.target.value))}
              />
              <NumberInput
                key={params.height}
                id="height-number"
                label={t.height}
                value={params.height}
                min={4}
                max={40}
                lang={lang}
                onCommit={(value) => updateParam('height', value)}
              />
            </div>
          </div>

          {/* Pocket Depth */}
          <div className="form-field" style={{ marginTop: '1rem' }}>
            <div className="field-header">
              <label className="field-label" htmlFor="pocket-depth-number">{t.pocketDepth}</label>
              <span className="field-value">{params.dPocket} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="1"
                max={params.height - 2}
                value={params.dPocket}
                aria-label={t.pocketDepth}
                onChange={(e) => updateParam('dPocket', parseInt(e.target.value))}
              />
              <NumberInput
                key={`${params.height}:${params.dPocket}`}
                id="pocket-depth-number"
                label={t.pocketDepth}
                value={params.dPocket}
                min={1}
                max={params.height - 2}
                lang={lang}
                onCommit={(value) => updateParam('dPocket', value)}
              />
            </div>
          </div>

          {/* Support Shelf Width */}
          <div className="form-field" style={{ marginTop: '1rem' }}>
            <div className="field-header">
              <label className="field-label" htmlFor="shelf-width-number">{t.shelfWidth}</label>
              <span className="field-value">{params.sShelf} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="1"
                max={Math.max(1, Math.floor(maxShelfWidth))}
                value={params.sShelf}
                aria-label={t.shelfWidth}
                onChange={(e) => updateParam('sShelf', parseInt(e.target.value))}
              />
              <NumberInput
                key={`${params.wPic}:${params.lPic}:${params.clearance}:${params.sShelf}`}
                id="shelf-width-number"
                label={t.shelfWidth}
                value={params.sShelf}
                min={1}
                max={Math.max(1, Math.floor(maxShelfWidth))}
                lang={lang}
                onCommit={(value) => updateParam('sShelf', value)}
              />
            </div>
          </div>
        </div>

        {/* Wall Mounting Options (Rectangle only) */}
        {params.shape === 'rect' && (
          <div>
            <h2 className="section-title">{t.wallMountingTitle}</h2>
            
            {/* Wall Hanger slot toggle */}
            <label className="toggle-field">
              <span className="field-label">{t.keyholeToggle}</span>
              <input
                type="checkbox"
                checked={params.hangerEnabled}
                onChange={(e) => updateParam('hangerEnabled', e.target.checked)}
              />
              <div className="toggle-switch"></div>
            </label>

            {params.hangerEnabled && (
              <div style={{ marginTop: '0.75rem', paddingLeft: '0.75rem', borderLeft: '2px solid var(--color-primary)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                
                {/* Hanger Side Select */}
                <div className="form-field">
                  <div className="field-header">
                    <label className="field-label" htmlFor="hanger-side-select">{t.hangerSide}</label>
                  </div>
                  <select
                    id="hanger-side-select"
                    value={params.hangerSide}
                    onChange={(e) => updateParam('hangerSide', e.target.value as FrameParams['hangerSide'])}
                    style={{
                      width: '100%',
                      padding: '0.4rem',
                      background: '#1a1d24',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '4px',
                      color: 'var(--text-main)',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="top">{t.hangerSideTop}</option>
                    <option value="bottom">{t.hangerSideBottom}</option>
                    <option value="left">{t.hangerSideLeft}</option>
                    <option value="right">{t.hangerSideRight}</option>
                  </select>
                </div>

                {/* Hole Count Selector */}
                <div className="form-field">
                  <div className="field-header">
                    <span className="field-label">{t.hangerCount}</span>
                  </div>
                  <div role="group" aria-label={t.hangerCount} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`preset-btn ${params.hangerCount === 1 ? 'active' : ''}`}
                      aria-pressed={params.hangerCount === 1}
                      onClick={() => updateParam('hangerCount', 1)}
                    >
                      1
                    </button>
                    <button
                      type="button"
                      className={`preset-btn ${params.hangerCount === 2 ? 'active' : ''}`}
                      aria-pressed={params.hangerCount === 2}
                      onClick={() => updateParam('hangerCount', 2)}
                    >
                      2
                    </button>
                  </div>
                </div>

                {/* Hole Diameter Slider */}
                <div className="form-field">
                  <div className="field-header">
              <label className="field-label" htmlFor="hanger-diameter-number">{t.hangerDiameter}</label>
                    <span className="field-value">{params.hangerDiameter} mm</span>
                  </div>
                  <div className="slider-container">
                    <input
                      type="range"
                      min="3"
                      max="15"
                      value={params.hangerDiameter}
                      aria-label={t.hangerDiameter}
                      onChange={(e) => updateParam('hangerDiameter', parseInt(e.target.value))}
                    />
                    <NumberInput
                      key={params.hangerDiameter}
                      id="hanger-diameter-number"
                      label={t.hangerDiameter}
                      value={params.hangerDiameter}
                      min={3}
                      max={15}
                      lang={lang}
                      onCommit={(value) => updateParam('hangerDiameter', value)}
                    />
                  </div>
                </div>

                {/* Warning if border is narrow */}
                {params.tBorder < params.hangerDiameter + 2 && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-primary-hover)',
                    backgroundColor: 'rgba(255, 81, 0, 0.08)',
                    border: '1px solid rgba(255, 81, 0, 0.2)',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    lineHeight: '1.3'
                  }}>
                    {t.narrowBorderWarning}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Frame Splitting Options */}
        <div>
          <h2 className="section-title">{t.splitTitle}</h2>
          
          {/* Split toggle */}
          <label className="toggle-field">
            <span className="field-label">{t.splitToggle}</span>
            <input
              type="checkbox"
              checked={params.splitEnabled}
              onChange={(e) => updateParam('splitEnabled', e.target.checked)}
            />
            <div className="toggle-switch"></div>
          </label>

          {params.splitEnabled && (
            <div style={{ marginTop: '0.75rem', paddingLeft: '0.75rem', borderLeft: '2px solid var(--color-primary)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              
              {/* Max Part Length */}
              <div className="form-field">
                <div className="field-header">
                  <label className="field-label" htmlFor="max-part-length-number">{t.maxPartLength}</label>
                  <span className="field-value">{params.maxPartLength} mm</span>
                </div>
                <div className="slider-container">
                  <input
                    type="range"
                    min="100"
                    max="400"
                    value={params.maxPartLength}
                    aria-label={t.maxPartLength}
                    onChange={(e) => updateParam('maxPartLength', parseInt(e.target.value))}
                  />
                  <NumberInput
                    key={params.maxPartLength}
                    id="max-part-length-number"
                    label={t.maxPartLength}
                    value={params.maxPartLength}
                    min={100}
                    max={400}
                    lang={lang}
                    onCommit={(value) => updateParam('maxPartLength', value)}
                  />
                </div>
              </div>

              {/* Joint Type Select */}
              <div className="form-field">
                <div className="field-header">
                  <label className="field-label" htmlFor="joint-type-select">{t.jointType}</label>
                </div>
                <select
                  id="joint-type-select"
                  value={params.jointType}
                  onChange={(e) => updateParam('jointType', e.target.value as FrameParams['jointType'])}
                  style={{
                    width: '100%',
                    padding: '0.4rem',
                    background: '#1a1d24',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '4px',
                    color: 'var(--text-main)',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="half-lap">{t.jointHalfLap}</option>
                  {params.shape !== 'hex' && <option value="bowtie">{t.jointBowtie}</option>}
                  <option value="dovetail">{t.jointDovetail}</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: '1.3' }}>
                  {t.jointTypeDesc}
                </p>
              </div>

              {/* Dynamic Download Parts List */}
              <div style={{ marginTop: '0.5rem' }}>
                <span className="field-label" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                  {t.downloadPartsTitle}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                  {splitParts.map((part) => (
                    <button
                      key={part.name}
                      type="button"
                      className="preset-btn"
                      disabled={exportBlocked}
                      style={{ width: '100%', padding: '0.4rem', fontSize: '0.8rem', justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}
                      onClick={() => {
                        const prefix = lang === 'en' ? 'part' : 'czesc';
                        const cleanName = part.name.toLowerCase().replace(/\s+/g, '_');
                        downloadSTL(part.positions, part.normals, `${prefix}_${cleanName}.stl`);
                      }}
                    >
                      <span>{part.name}</span>
                      <span>💾</span>
                    </button>
                  ))}
                  {params.jointType === 'bowtie' && (
                    <button
                      type="button"
                      className="preset-btn"
                      disabled={exportBlocked}
                      style={{ width: '100%', padding: '0.4rem', fontSize: '0.8rem', justifyContent: 'space-between', display: 'flex', alignItems: 'center', borderColor: 'var(--color-primary)', color: 'var(--color-primary-hover)' }}
                      onClick={() => {
                        const keyGeom = generateBowtieKeyGeometry(params);
                        downloadSTL(keyGeom.positions, keyGeom.normals, `bowtie_key.stl`);
                      }}
                    >
                      <span>{t.downloadBowtieBtn}</span>
                      <span>💾</span>
                    </button>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Viewport Helpers */}
        <div>
          <h2 className="section-title">{t.visual3dTitle}</h2>
          <label className="toggle-field">
            <span className="field-label">{t.gridToggle}</span>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
            <div className="toggle-switch"></div>
          </label>
        </div>

        {validationErrors.length > 0 && (
          <div role="alert" style={{ marginTop: '0.75rem', color: 'var(--color-primary-hover)', fontSize: '0.8rem', lineHeight: '1.4' }}>
            <p>{lang === 'pl' ? 'Popraw parametry przed eksportem:' : 'Correct these parameters before exporting:'}</p>
            <ul style={{ marginTop: '0.25rem', paddingLeft: '1.25rem' }}>
              {validationErrors.map((error) => (
                <li key={error}>
                  {lang === 'pl' && error.startsWith('The selected hanger side has no safe split seam')
                    ? 'Po tej stronie ramy nie ma bezpiecznego miejsca podziału między narożnymi złączami motylkowymi. Zwiększ jej wymiar, zmniejsz średnicę lub liczbę otworów albo wybierz inne złącze.'
                    : error}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button className="download-btn" onClick={onDownload} disabled={exportBlocked}>
          {params.splitEnabled
            ? (lang === 'pl' ? 'Pobierz wszystkie części (ZIP)' : 'Download all parts (ZIP)')
            : t.downloadStl}
        </button>

        <button 
          type="button"
          className="preset-btn" 
          style={{ width: '100%', marginTop: '0.25rem' }} 
          aria-haspopup="dialog"
          aria-controls="schematic-dialog"
          onClick={() => setShowSchematic(true)}
        >
          {t.showSchematic}
        </button>
      </div>

      {/* Schematic Modal Dialog */}
      {showSchematic && (
        <div
          ref={dialogRef}
          id="schematic-dialog"
          className="overlay-dialog glass-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schematic-dialog-title"
          aria-describedby="schematic-dialog-description"
          tabIndex={-1}
        >
          <button ref={closeButtonRef} type="button" className="overlay-close" aria-label={lang === 'pl' ? 'Zamknij schemat' : 'Close schematic'} onClick={() => setShowSchematic(false)}>✕</button>
          <h2 id="schematic-dialog-title" style={{ fontSize: '1.25rem', marginBottom: '0.75rem', fontWeight: 600 }}>{t.modalTitle}</h2>
          <p id="schematic-dialog-description" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            {t.modalDesc}
          </p>
          
          <svg viewBox="0 0 400 200" className="schematic-svg" aria-hidden="true">
            {/* Background Grid lines */}
            <line x1="20" y1="180" x2="380" y2="180" stroke="#333" strokeWidth="2" />
            <text x="350" y="195" fill="#666" fontSize="10" fontFamily="monospace">{t.modalGridLabel}</text>

            {/* Frame Cross section (Left profile) */}
            <path d="M 40,180 L 100,180 L 100,100 L 70,100 L 70,20 L 40,20 Z" fill="#332211" stroke="#ff5100" strokeWidth="2" />
            {/* Frame Cross section (Right profile) */}
            <path d="M 360,180 L 300,180 L 300,100 L 330,100 L 330,20 L 360,20 Z" fill="#332211" stroke="#ff5100" strokeWidth="2" />

            {/* Picture (HueForge) sitting in pocket */}
            <rect x="100" y="80" width="200" height="20" fill="rgba(0, 200, 255, 0.4)" stroke="#00c8ff" strokeWidth="1" strokeDasharray="3,3" />
            <text x="200" y="94" fill="#00c8ff" fontSize="10" textAnchor="middle" fontWeight="bold">{t.modalLabelPic}</text>

            {/* Height H Indicator */}
            <line x1="25" y1="180" x2="25" y2="20" stroke="#aaa" strokeWidth="1" markerEnd="url(#arrow)" />
            <line x1="25" y1="20" x2="25" y2="180" stroke="#aaa" strokeWidth="1" markerEnd="url(#arrow)" />
            <text x="15" y="105" fill="#aaa" fontSize="10" textAnchor="middle" transform="rotate(-90, 15, 105)">{t.modalLabelH}</text>

            {/* Border thickness T_border Indicator */}
            <line x1="40" y1="12" x2="70" y2="12" stroke="#aaa" strokeWidth="1" markerEnd="url(#arrow)" />
            <line x1="70" y1="12" x2="40" y2="12" stroke="#aaa" strokeWidth="1" markerEnd="url(#arrow)" />
            <text x="55" y="8" fill="#aaa" fontSize="8" textAnchor="middle">{t.modalLabelT}</text>

            {/* Shelf width S Indicator */}
            <line x1="70" y1="112" x2="100" y2="112" stroke="#aaa" strokeWidth="1" markerEnd="url(#arrow)" />
            <line x1="100" y1="112" x2="70" y2="112" stroke="#aaa" strokeWidth="1" markerEnd="url(#arrow)" />
            <text x="85" y="123" fill="#aaa" fontSize="8" textAnchor="middle">{t.modalLabelS}</text>

            {/* Pocket depth D_pocket Indicator */}
            <line x1="375" y1="20" x2="375" y2="100" stroke="#aaa" strokeWidth="1" markerEnd="url(#arrow)" />
            <line x1="375" y1="100" x2="375" y2="20" stroke="#aaa" strokeWidth="1" markerEnd="url(#arrow)" />
            <text x="385" y="65" fill="#aaa" fontSize="9" transform="rotate(90, 385, 65)" textAnchor="middle">{t.modalLabelD}</text>

            {/* Bounding width W_out */}
            <line x1="40" y1="168" x2="360" y2="168" stroke="#ff5100" strokeWidth="0.75" />
            <text x="200" y="163" fill="#ff5100" fontSize="9" textAnchor="middle">{t.modalLabelW}</text>

            {/* SVG Definitions for arrows */}
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#aaa" />
              </marker>
            </defs>
          </svg>

          <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div>• <b>{t.modalLabelT}:</b> {t.modalLegendT}</div>
            <div>• <b>{t.modalLabelS}:</b> {t.modalLegendS}</div>
            <div>• <b>{t.modalLabelD}:</b> {t.modalLegendD}</div>
            <div>• <b>{t.modalLabelH}:</b> {t.modalLegendH}</div>
          </div>
        </div>
      )}
    </div>
  );
};
