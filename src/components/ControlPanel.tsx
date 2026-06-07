import React, { useState } from 'react';
import type { FrameParams } from '../utils/geometry';
import { TRANSLATIONS } from '../utils/translations';
import type { Lang } from '../utils/translations';

interface ControlPanelProps {
  params: FrameParams;
  onChange: (newParams: FrameParams) => void;
  onDownload: () => void;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  params,
  onChange,
  onDownload,
  showGrid,
  setShowGrid,
  lang,
  setLang
}) => {
  const t = TRANSLATIONS[lang];
  const [showSchematic, setShowSchematic] = useState(false);

  const PRESETS = [
    { name: `${t.presetSquare} 200x200`, w: 200, l: 200, shape: 'rect' as const },
    { name: `${t.presetSquare} 100x100`, w: 100, l: 100, shape: 'rect' as const },
    { name: `${t.presetHex} 100 (Hex)`, w: 100, l: 100, shape: 'hex' as const },
    { name: `${t.presetHex} 200 (Hex)`, w: 200, l: 200, shape: 'hex' as const },
    { name: `${t.presetPhoto} 100x150`, w: 100, l: 150, shape: 'rect' as const },
    { name: `${t.presetPhoto} 150x200`, w: 150, l: 200, shape: 'rect' as const }
  ];

  const updateParam = <K extends keyof FrameParams>(key: K, value: FrameParams[K]) => {
    const newParams = { ...params, [key]: value };

    if (key === 'shape') {
      if (value === 'hex') {
        newParams.cornerRadius = 0;
        newParams.hangerEnabled = false;
      }
    }

    if (key === 'height') {
      const hVal = value as number;
      if (newParams.dPocket >= hVal) {
        newParams.dPocket = Math.max(1, hVal - 2); // Leave 2mm shelf
      }
    }
    if (key === 'dPocket') {
      const dpVal = value as number;
      if (dpVal >= newParams.height) {
        newParams.dPocket = Math.max(1, newParams.height - 2);
      }
    }

    const wPocket = newParams.wPic + 2 * newParams.clearance;
    const lPocket = newParams.shape === 'hex' ? wPocket : (newParams.lPic + 2 * newParams.clearance);
    const maxShelf = Math.min(wPocket, lPocket) / 2 - 2;
    if (newParams.sShelf > maxShelf) {
      newParams.sShelf = Math.max(1, Math.floor(maxShelf));
    }

    if (newParams.shape === 'rect') {
      const wOut = wPocket + 2 * newParams.tBorder;
      const lOut = lPocket + 2 * newParams.tBorder;
      const maxRadius = Math.min(newParams.tBorder, wOut / 2, lOut / 2);
      if (newParams.cornerRadius > maxRadius) {
        newParams.cornerRadius = Math.floor(maxRadius);
      }
    }

    onChange(newParams);
  };

  const applyPreset = (w: number, l: number, shape: 'rect' | 'hex') => {
    const newParams = {
      ...params,
      shape,
      wPic: w,
      lPic: l
    };

    if (shape === 'hex') {
      newParams.cornerRadius = 0;
      newParams.hangerEnabled = false;
    }

    const wPocket = w + 2 * params.clearance;
    const lPocket = shape === 'hex' ? wPocket : (l + 2 * params.clearance);
    const maxShelf = Math.min(wPocket, lPocket) / 2 - 2;
    if (newParams.sShelf > maxShelf) {
      newParams.sShelf = Math.max(1, Math.floor(maxShelf));
    }

    onChange(newParams);
  };

  const wPocket = params.wPic + 2 * params.clearance;
  const lPocket = params.shape === 'hex' ? wPocket : (params.lPic + 2 * params.clearance);
  const maxShelfWidth = Math.min(wPocket, lPocket) / 2 - 2;

  // Outer bounds
  const wOut = wPocket + 2 * params.tBorder;
  const lOut = lPocket + 2 * params.tBorder;
  const maxRadiusLimit = params.shape === 'rect' ? Math.min(params.tBorder, wOut / 2, lOut / 2) : 0;

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
                  className={`preset-btn ${isActive ? 'active' : ''}`}
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
              className={`preset-btn ${params.shape === 'rect' ? 'active' : ''}`}
              onClick={() => updateParam('shape', 'rect')}
            >
              {t.shapeRect}
            </button>
            <button
              className={`preset-btn ${params.shape === 'hex' ? 'active' : ''}`}
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
              <span className="field-label">
                {params.shape === 'hex' ? t.picHexWidth : t.picWidth}
              </span>
              <span className="field-value">{params.wPic} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="50"
                max="400"
                value={params.wPic}
                onChange={(e) => updateParam('wPic', parseInt(e.target.value))}
              />
              <input
                type="number"
                className="numeric-input"
                min="50"
                max="400"
                value={params.wPic}
                onChange={(e) => updateParam('wPic', parseInt(e.target.value) || 50)}
              />
            </div>
          </div>

          {/* Picture Length (Only for rectangular frame) */}
          {params.shape === 'rect' && (
            <div className="form-field" style={{ marginTop: '1rem' }}>
              <div className="field-header">
                <span className="field-label">{t.picLength}</span>
                <span className="field-value">{params.lPic} mm</span>
              </div>
              <div className="slider-container">
                <input
                  type="range"
                  min="50"
                  max="400"
                  value={params.lPic}
                  onChange={(e) => updateParam('lPic', parseInt(e.target.value))}
                />
                <input
                  type="number"
                  className="numeric-input"
                  min="50"
                  max="400"
                  value={params.lPic}
                  onChange={(e) => updateParam('lPic', parseInt(e.target.value) || 50)}
                />
              </div>
            </div>
          )}

          {/* Clearance Tolerance */}
          <div className="form-field" style={{ marginTop: '1rem' }}>
            <div className="field-header">
              <span className="field-label">{t.clearance}</span>
              <span className="field-value">{params.clearance} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={params.clearance}
                onChange={(e) => updateParam('clearance', parseFloat(e.target.value))}
              />
              <input
                type="number"
                className="numeric-input"
                min="0"
                max="2"
                step="0.1"
                value={params.clearance}
                onChange={(e) => updateParam('clearance', parseFloat(e.target.value) || 0)}
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
              <span className="field-label">{t.borderThickness}</span>
              <span className="field-value">{params.tBorder} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="3"
                max="30"
                value={params.tBorder}
                onChange={(e) => updateParam('tBorder', parseInt(e.target.value))}
              />
              <input
                type="number"
                className="numeric-input"
                min="3"
                max="30"
                value={params.tBorder}
                onChange={(e) => updateParam('tBorder', parseInt(e.target.value) || 3)}
              />
            </div>
          </div>

          {/* Corner Radius (Only for rectangle) */}
          {params.shape === 'rect' && (
            <div className="form-field" style={{ marginTop: '1rem' }}>
              <div className="field-header">
                <span className="field-label">{t.cornerRadius}</span>
                <span className="field-value">{params.cornerRadius} mm</span>
              </div>
              <div className="slider-container">
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, Math.floor(maxRadiusLimit))}
                  value={params.cornerRadius}
                  onChange={(e) => updateParam('cornerRadius', parseInt(e.target.value))}
                />
                <input
                  type="number"
                  className="numeric-input"
                  min="0"
                  max={Math.max(0, Math.floor(maxRadiusLimit))}
                  value={params.cornerRadius}
                  onChange={(e) => updateParam('cornerRadius', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          )}

          {/* Total Height */}
          <div className="form-field" style={{ marginTop: '1rem' }}>
            <div className="field-header">
              <span className="field-label">{t.height}</span>
              <span className="field-value">{params.height} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="4"
                max="40"
                value={params.height}
                onChange={(e) => updateParam('height', parseInt(e.target.value))}
              />
              <input
                type="number"
                className="numeric-input"
                min="4"
                max="40"
                value={params.height}
                onChange={(e) => updateParam('height', parseInt(e.target.value) || 4)}
              />
            </div>
          </div>

          {/* Pocket Depth */}
          <div className="form-field" style={{ marginTop: '1rem' }}>
            <div className="field-header">
              <span className="field-label">{t.pocketDepth}</span>
              <span className="field-value">{params.dPocket} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="1"
                max={params.height - 2}
                value={params.dPocket}
                onChange={(e) => updateParam('dPocket', parseInt(e.target.value))}
              />
              <input
                type="number"
                className="numeric-input"
                min="1"
                max={params.height - 2}
                value={params.dPocket}
                onChange={(e) => updateParam('dPocket', parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          {/* Support Shelf Width */}
          <div className="form-field" style={{ marginTop: '1rem' }}>
            <div className="field-header">
              <span className="field-label">{t.shelfWidth}</span>
              <span className="field-value">{params.sShelf} mm</span>
            </div>
            <div className="slider-container">
              <input
                type="range"
                min="1"
                max={Math.max(1, Math.floor(maxShelfWidth))}
                value={params.sShelf}
                onChange={(e) => updateParam('sShelf', parseInt(e.target.value))}
              />
              <input
                type="number"
                className="numeric-input"
                min="1"
                max={Math.max(1, Math.floor(maxShelfWidth))}
                value={params.sShelf}
                onChange={(e) => updateParam('sShelf', parseInt(e.target.value) || 1)}
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
                    <span className="field-label">{t.hangerSide}</span>
                  </div>
                  <select
                    value={params.hangerSide}
                    onChange={(e) => updateParam('hangerSide', e.target.value as any)}
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`preset-btn ${params.hangerCount === 1 ? 'active' : ''}`}
                      onClick={() => updateParam('hangerCount', 1)}
                    >
                      1
                    </button>
                    <button
                      type="button"
                      className={`preset-btn ${params.hangerCount === 2 ? 'active' : ''}`}
                      onClick={() => updateParam('hangerCount', 2)}
                    >
                      2
                    </button>
                  </div>
                </div>

                {/* Hole Diameter Slider */}
                <div className="form-field">
                  <div className="field-header">
                    <span className="field-label">{t.hangerDiameter}</span>
                    <span className="field-value">{params.hangerDiameter} mm</span>
                  </div>
                  <div className="slider-container">
                    <input
                      type="range"
                      min="3"
                      max="15"
                      value={params.hangerDiameter}
                      onChange={(e) => updateParam('hangerDiameter', parseInt(e.target.value))}
                    />
                    <input
                      type="number"
                      className="numeric-input"
                      min="3"
                      max="15"
                      value={params.hangerDiameter}
                      onChange={(e) => updateParam('hangerDiameter', parseInt(e.target.value) || 3)}
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

        <button className="download-btn" onClick={onDownload}>
          {t.downloadStl}
        </button>

        <button 
          className="preset-btn" 
          style={{ width: '100%', marginTop: '0.25rem' }} 
          onClick={() => setShowSchematic(true)}
        >
          {t.showSchematic}
        </button>
      </div>

      {/* Schematic Modal Dialog */}
      {showSchematic && (
        <div className="overlay-dialog glass-panel">
          <button className="overlay-close" onClick={() => setShowSchematic(false)}>✕</button>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.75rem', fontWeight: 600 }}>{t.modalTitle}</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            {t.modalDesc}
          </p>
          
          <svg viewBox="0 0 400 200" className="schematic-svg">
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
