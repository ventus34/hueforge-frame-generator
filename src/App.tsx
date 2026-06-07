import { useState } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { ThreePreview } from './components/ThreePreview';
import { MountingPlanner } from './components/MountingPlanner';
import type { Strip } from './components/MountingPlanner';
import { generateFrameGeometry, calculateFrameVolume } from './utils/geometry';
import type { FrameParams } from './utils/geometry';
import { downloadSTL } from './utils/stlExporter';
import { TRANSLATIONS } from './utils/translations';
import type { Lang } from './utils/translations';

const DEFAULT_PARAMS: FrameParams = {
  shape: 'rect',
  wPic: 200,
  lPic: 200,
  clearance: 0.2,
  tBorder: 8,
  height: 12,
  dPocket: 3,
  sShelf: 4,
  cornerRadius: 0,
  hangerEnabled: false,
  hangerSide: 'top',
  hangerCount: 1,
  hangerDiameter: 8
};

const FILAMENT_COLORS = [
  { key: 'colorBlack' as const, hex: '#15161a' },
  { key: 'colorOrange' as const, hex: '#ff5100' },
  { key: 'colorWhite' as const, hex: '#f9f9fb' },
  { key: 'colorGold' as const, hex: '#d4af37' },
  { key: 'colorGray' as const, hex: '#7f8c8d' }
];

function App() {
  const [params, setParams] = useState<FrameParams>(DEFAULT_PARAMS);
  const [materialColor, setMaterialColor] = useState<string>(FILAMENT_COLORS[0].hex);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'3d' | '2d'>('3d');
  const [lang, setLang] = useState<Lang>('en');
  
  // Lifted mounting planner state
  const [strips, setStrips] = useState<Strip[]>([]);
  const [activeStripId, setActiveStripId] = useState<string | null>(null);

  const t = TRANSLATIONS[lang];

  // Bounding box dimensions
  const wPocket = params.wPic + 2 * params.clearance;
  const lPocket = params.shape === 'hex' ? wPocket : (params.lPic + 2 * params.clearance);
  const wOut = wPocket + 2 * params.tBorder;
  const lOut = params.shape === 'hex' ? wOut : (lPocket + 2 * params.tBorder);

  // Volume & weight calculations
  const volumeMm3 = calculateFrameVolume(params);
  const volumeCm3 = volumeMm3 / 1000;
  const weightGrams = volumeCm3 * 1.24; // Standard PLA density

  const handleDownload = () => {
    const { positions, normals } = generateFrameGeometry(params);
    const shapeStr = params.shape === 'hex' ? 'hex' : 'rect';
    const prefix = lang === 'en' ? 'frame' : 'ramka';
    const filename = `${prefix}_${shapeStr}_${params.wPic}x${params.shape === 'hex' ? params.wPic : params.lPic}mm_h${params.height}_b${params.tBorder}.stl`;
    downloadSTL(positions, normals, filename);
  };

  return (
    <div className="app-container">
      {/* Control Panel (Left Column) */}
      <ControlPanel
        params={params}
        onChange={setParams}
        onDownload={handleDownload}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        lang={lang}
        setLang={setLang}
      />

      {/* Viewport / Planner Container (Right Column) */}
      <div className="viewport-container">
        
        {/* Tab Selection Bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.3)', zIndex: 11 }}>
          <button
            onClick={() => setActiveTab('3d')}
            style={{
              padding: '1rem 1.75rem',
              background: activeTab === '3d' ? 'rgba(255,255,255,0.03)' : 'none',
              border: 'none',
              borderBottom: activeTab === '3d' ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeTab === '3d' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
          >
            {t.tab3d}
          </button>
          <button
            onClick={() => setActiveTab('2d')}
            style={{
              padding: '1rem 1.75rem',
              background: activeTab === '2d' ? 'rgba(255,255,255,0.03)' : 'none',
              border: 'none',
              borderBottom: activeTab === '2d' ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeTab === '2d' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 600,
              outline: 'none',
              transition: 'all 0.15s ease'
            }}
          >
            {t.tab2d}
          </button>
        </div>

        {/* Content area based on selected tab */}
        <div style={{ flexGrow: 1, position: 'relative', height: 'calc(100% - 53px)' }}>
          {activeTab === '3d' ? (
            <>
              {/* Filament Colors Toolbar (Top Right) */}
              <div className="toolbar">
                <div className="toolbar-panel glass-panel">
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '0.4rem' }}>
                    {t.colorLabel}
                  </span>
                  {FILAMENT_COLORS.map((col) => (
                    <button
                      key={col.hex}
                      className={`color-option ${materialColor.toLowerCase() === col.hex.toLowerCase() ? 'active' : ''}`}
                      style={{ backgroundColor: col.hex }}
                      title={t[col.key]}
                      onClick={() => setMaterialColor(col.hex)}
                    />
                  ))}
                  
                  {/* Custom Color Picker input */}
                  <div style={{ display: 'flex', alignItems: 'center', marginLeft: '0.25rem', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '0.5rem' }}>
                    <input
                      type="color"
                      value={materialColor}
                      onChange={(e) => setMaterialColor(e.target.value)}
                      style={{
                        width: '24px',
                        height: '24px',
                        border: '2px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        background: 'none',
                        padding: 0,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                      title={t.customColorTitle}
                    />
                  </div>
                </div>
              </div>

              {/* Info / Print tip banner (Top Left HUD style) */}
              <div style={{ position: 'absolute', top: '1.25rem', left: '1.25rem', zIndex: 10, pointerEvents: 'none', maxWidth: '380px' }}>
                <div className="info-banner glass-panel">
                  <span className="info-banner-icon">💡</span>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.15rem', color: 'var(--text-main)' }}>
                      {t.tipTitle}
                    </p>
                    <p style={{ color: 'var(--text-muted)' }}>
                      {t.tipDesc}
                    </p>
                  </div>
                </div>
              </div>

              {/* 3D Canvas */}
              <ThreePreview
                params={params}
                materialColor={materialColor}
                showGrid={showGrid}
                visualizeTape={true}
                strips={strips}
              />
            </>
          ) : (
            /* 2D Mounting Planner canvas */
            <MountingPlanner
              params={params}
              lang={lang}
              strips={strips}
              setStrips={setStrips}
              activeStripId={activeStripId}
              setActiveStripId={setActiveStripId}
            />
          )}

          {/* Bounding Box HUD (Bottom Right, visible in both tabs) */}
          <div className="hud-dimensions" style={{ zIndex: 10 }}>
            <div className="hud-line">
              <span className="hud-label">{t.hudOuterSize}:</span>
              <span className="hud-val">
                {params.shape === 'hex' 
                  ? `${wOut.toFixed(1)} mm (${t.hudHexBokBok})` 
                  : `${wOut.toFixed(1)} x ${lOut.toFixed(1)} mm`
                }
              </span>
            </div>
            <div className="hud-line">
              <span className="hud-label">{t.hudHeight}:</span>
              <span className="hud-val">{params.height.toFixed(1)} mm</span>
            </div>
            <div className="hud-line">
              <span className="hud-label">{t.hudVolume}:</span>
              <span className="hud-val">{volumeCm3.toFixed(1)} cm³</span>
            </div>
            <div className="hud-line" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.25rem', marginTop: '0.25rem' }}>
              <span className="hud-label">{t.hudWeight}:</span>
              <span className="hud-val" style={{ color: 'var(--color-primary-hover)' }}>{weightGrams.toFixed(1)} g</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
