import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { MountingPlanner } from './components/MountingPlanner';
import type { Strip } from './components/MountingPlanner';
import { calculateFrameVolume, generateBowtieKeyGeometry, generateFrameGeometry, generateSplitFrameParts } from './utils/geometry';
import type { FrameParams } from './utils/geometry';
import { DEFAULT_PARAMS, validateFrameParams } from './utils/params';
import { downloadSTL, exportBinarySTL } from './utils/stlExporter';
import { TRANSLATIONS } from './utils/translations';
import type { Lang } from './utils/translations';
import { getPartBedFit, PRINTER_PROFILES } from './utils/printerProfiles';
import type { FootprintFit } from './utils/printerProfiles';
import { downloadZip } from './utils/zipExporter';
import type { ZipEntry } from './utils/zipExporter';
import { loadProjectFromStorageResult, MAX_PROJECT_FILE_BYTES, parseProjectText, PROJECT_SCHEMA_VERSION, saveProjectToStorage } from './utils/projectPersistence';
import type { FrameProject, ProjectStrip, StoredProjectResult } from './utils/projectPersistence';
import { bowtieKeyQuantityForClosedFrame, createBowtieKeyManifestEntry } from './utils/assemblyManifest';

const ThreePreview = lazy(() => import('./components/ThreePreview').then((module) => ({ default: module.ThreePreview })));

const FILAMENT_COLORS = [
  { key: 'colorBlack' as const, hex: '#15161a' },
  { key: 'colorOrange' as const, hex: '#ff5100' },
  { key: 'colorWhite' as const, hex: '#f9f9fb' },
  { key: 'colorGold' as const, hex: '#d4af37' },
  { key: 'colorGray' as const, hex: '#7f8c8d' }
];

const UI_TEXT = {
  en: {
    projectTitle: 'Project', saveProject: 'Export project JSON', importProject: 'Import project JSON',
    downloadRecovery: 'Download preserved backup', downloadCurrentRecovery: 'Download current unreadable project',
    saved: 'Project saved on this device', backupKept: ' A copy of the unreadable previous project was kept.', recoveryNeedsDownload: 'The previous project could not be read or backed up. It has not been overwritten; export the current project JSON after reviewing it.',
    imported: 'Project imported and saved', exported: 'Project JSON downloaded', importFailed: 'Could not import project:',
    storageFailed: 'Browser storage is unavailable; download a project file to keep a copy.',
    fileTooLarge: `Project file must be at most ${MAX_PROJECT_FILE_BYTES.toLocaleString()} bytes.`,
    printer: 'Printer bed', custom: 'Custom bed', bedX: 'Bed X (mm)', bedY: 'Bed Y (mm)', loadingPreview: 'Loading 3D preview…',
    fit: 'Bed fit', fittingParts: 'parts fit', allFit: 'All parts fit in the selected bed.',
    someDoNotFit: 'Some parts do not fit in the selected bed, even after a 90° rotation.',
    tooLarge: 'Does not fit',
    geometryFailed: 'Could not generate this model:', invalidParams: 'Fix the listed parameter errors before export.',
    downloadZip: 'Split frame and assembly manifest downloaded', downloadStl: 'STL downloaded',
    assemblyTitle: 'Assembly instructions',
    assemblySplit: 'Print all frame parts flat on the bed, then match the named joints and bond the segments. The manifest lists every part and its bed fit.',
    assemblyBowtie: (quantity: number) => `The ZIP contains one bowtie key STL template. Print ${quantity} copies, one for every frame joint, then fit a key into each matching joint.`,
    projectFile: 'framegen-project.json',
    bedGrid: 'The fit check uses each part’s axis-aligned XY footprint and allows a 90° turn. It does not account for skirts, brims, clips, or slicer margins.'
  },
  pl: {
    projectTitle: 'Projekt', saveProject: 'Eksportuj projekt JSON', importProject: 'Importuj projekt JSON',
    downloadRecovery: 'Pobierz zachowaną kopię', downloadCurrentRecovery: 'Pobierz bieżący nieczytelny projekt',
    saved: 'Projekt zapisany na tym urządzeniu', backupKept: ' Zachowano kopię nieczytelnego poprzedniego projektu.', recoveryNeedsDownload: 'Nie udało się odczytać ani skopiować poprzedniego projektu. Nie został nadpisany; po sprawdzeniu pobierz bieżący projekt JSON.',
    imported: 'Zaimportowano i zapisano projekt', exported: 'Pobrano plik projektu JSON', importFailed: 'Nie udało się zaimportować projektu:',
    storageFailed: 'Pamięć przeglądarki jest niedostępna; pobierz plik projektu, aby zachować kopię.',
    fileTooLarge: `Plik projektu może mieć maksymalnie ${MAX_PROJECT_FILE_BYTES.toLocaleString()} bajtów.`,
    printer: 'Stół drukarki', custom: 'Własny stół', bedX: 'Stół X (mm)', bedY: 'Stół Y (mm)', loadingPreview: 'Ładowanie podglądu 3D…',
    fit: 'Mieści się na stole', fittingParts: 'części pasuje', allFit: 'Wszystkie części mieszczą się na wybranym stole.',
    someDoNotFit: 'Niektóre części nie mieszczą się na wybranym stole nawet po obrocie o 90°.',
    tooLarge: 'Nie mieści się',
    geometryFailed: 'Nie udało się wygenerować modelu:', invalidParams: 'Popraw wymienione parametry przed eksportem.',
    downloadZip: 'Pobrano części ramki i manifest montażu', downloadStl: 'Pobrano STL',
    assemblyTitle: 'Instrukcja montażu',
    assemblySplit: 'Wydrukuj części płasko na stole, dopasuj nazwane połączenia i sklej segmenty. Manifest zawiera listę części i informację o dopasowaniu do stołu.',
    assemblyBowtie: (quantity: number) => `ZIP zawiera wzór STL klucza motylkowego. Wydrukuj ${quantity} kopii, po jednej na każde połączenie, a następnie osadź klucze w dopasowanych złączach.`,
    projectFile: 'framegen-project.json',
    bedGrid: 'Kontrola porównuje prostokątny obrys XY każdej części i dopuszcza obrót o 90°. Nie uwzględnia brimów, skirtów, klipsów ani marginesów slicera.'
  }
} as const;

function makeDefaultProject(): FrameProject {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    params: DEFAULT_PARAMS,
    strips: [],
    materialColor: FILAMENT_COLORS[0].hex,
    lang: 'en',
    showGrid: true,
    activeTab: '3d',
    printer: { profileId: 'bambu-256', name: '256 × 256 mm', bedX: 256, bedY: 256 }
  };
}

function readInitialProject(): StoredProjectResult {
  const fallback = makeDefaultProject();
  try {
    return loadProjectFromStorageResult(window.localStorage, fallback);
  } catch {
    return { project: fallback, recoveryEncountered: false, recoverySaved: false, recoveryRaw: null, recoveryBackup: null };
  }
}

function downloadText(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'part';
}

function App() {
  const [initialLoad] = useState<StoredProjectResult>(readInitialProject);
  const [project, setProject] = useState<FrameProject>(() => initialLoad.project);
  const [allowAutosave, setAllowAutosave] = useState(() => !initialLoad.recoveryEncountered || initialLoad.recoverySaved);
  const [projectStatus, setProjectStatus] = useState('');
  const [projectStatusIsError, setProjectStatusIsError] = useState(false);
  const [activeStripId, setActiveStripId] = useState<string | null>(null);
  const [bedXDraft, setBedXDraft] = useState<string | null>(null);
  const [bedYDraft, setBedYDraft] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const { params, materialColor, showGrid, activeTab, lang } = project;
  const t = TRANSLATIONS[lang];
  const ui = UI_TEXT[lang];
  const statusText = !allowAutosave && initialLoad.recoveryEncountered ? ui.recoveryNeedsDownload : projectStatus;
  const statusIsError = (!allowAutosave && initialLoad.recoveryEncountered) || projectStatusIsError;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (!allowAutosave) return;
    const timeout = window.setTimeout(() => {
      const saved = (() => {
        try {
          return saveProjectToStorage(window.localStorage, project);
        } catch {
          return false;
        }
      })();
      setProjectStatus(saved ? `${ui.saved}${initialLoad.recoveryEncountered && initialLoad.recoverySaved ? ui.backupKept : ''}` : ui.storageFailed);
      setProjectStatusIsError(!saved);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [allowAutosave, initialLoad.recoveryEncountered, initialLoad.recoverySaved, project, ui.backupKept, ui.saved, ui.storageFailed]);

  const parameterErrors = useMemo(() => validateFrameParams(params), [params]);
  const model = useMemo(() => {
    if (parameterErrors.length) return { geometry: null, splitParts: null, error: null as string | null };
    try {
      if (params.splitEnabled) {
        return { geometry: null, splitParts: generateSplitFrameParts(params), error: null as string | null };
      }
      return { geometry: generateFrameGeometry(params), splitParts: null, error: null as string | null };
    } catch (error) {
      return {
        geometry: null,
        splitParts: null,
        error: error instanceof Error ? error.message : 'Unknown geometry error.'
      };
    }
  }, [params, parameterErrors]);

  const bedSize = useMemo(() => ({ x: project.printer.bedX, y: project.printer.bedY }), [project.printer.bedX, project.printer.bedY]);
  const bedFits = useMemo(() => {
    if (model.error || parameterErrors.length) return { rows: [] as Array<{ name: string; fit: FootprintFit }>, error: null as string | null };
    try {
      const rows = model.splitParts
        ? model.splitParts.map((part) => ({ name: part.name, fit: getPartBedFit(part.positions, bedSize) }))
        : model.geometry
          ? [{ name: params.shape === 'hex' ? 'Hex frame' : 'Frame', fit: getPartBedFit(model.geometry.positions, bedSize) }]
          : [];
      return { rows, error: null as string | null };
    } catch (error) {
      return { rows: [] as Array<{ name: string; fit: FootprintFit }>, error: error instanceof Error ? error.message : 'Invalid geometry bounds.' };
    }
  }, [bedSize, model, parameterErrors.length, params.shape]);

  const changeProject = (updater: SetStateAction<FrameProject>) => {
    setAllowAutosave(true);
    setProject(updater);
  };
  const setParams = (newParams: FrameParams) => changeProject((current) => ({ ...current, params: newParams }));
  const setShowGrid = (value: boolean) => changeProject((current) => ({ ...current, showGrid: value }));
  const setLang = (value: Lang) => changeProject((current) => ({ ...current, lang: value }));
  const setStrips = (value: SetStateAction<Strip[]>) => {
    changeProject((current) => ({
      ...current,
      strips: (typeof value === 'function' ? value(current.strips) : value) as ProjectStrip[]
    }));
  };
  const setActiveTab = (value: '3d' | '2d') => changeProject((current) => ({ ...current, activeTab: value }));

  const reportError = (message: string) => {
    setProjectStatus(message);
    setProjectStatusIsError(true);
  };

  const handleDownload = () => {
    if (parameterErrors.length) {
      reportError(`${ui.invalidParams} ${parameterErrors.join(' ')}`);
      return;
    }
    if (model.error) {
      reportError(`${ui.geometryFailed} ${model.error}`);
      return;
    }
    try {
      if (params.splitEnabled) {
        const parts = model.splitParts ?? [];
        if (!parts.length) throw new Error('No printable parts were generated.');
        const entries: ZipEntry[] = [];
        const manifestParts: Array<Record<string, unknown>> = [];
        for (const [index, part] of parts.entries()) {
          const file = `parts/${String(index + 1).padStart(2, '0')}_${safeFilePart(part.name)}.stl`;
          const stl = exportBinarySTL(part.positions, part.normals);
          const fit = getPartBedFit(part.positions, bedSize);
          entries.push({ name: file, data: new Uint8Array(stl) });
          manifestParts.push({
            name: part.name,
            file,
            footprintMm: { x: Number(fit.width.toFixed(2)), y: Number(fit.length.toFixed(2)) },
            fitsSelectedBed: fit.fits,
            bedOrientation: fit.orientation
          });
        }
        const isBowtie = params.jointType === 'bowtie' && params.shape !== 'hex';
        const bowtieQuantity = isBowtie ? bowtieKeyQuantityForClosedFrame(parts.length) : 0;
        if (isBowtie) {
          const key = generateBowtieKeyGeometry(params);
          entries.push({ name: 'parts/bowtie_key.stl', data: new Uint8Array(exportBinarySTL(key.positions, key.normals)) });
          const fit = getPartBedFit(key.positions, bedSize);
          manifestParts.push(createBowtieKeyManifestEntry(parts.length, 'parts/bowtie_key.stl', fit));
        }
        const manifest = {
          format: 'HueForge Frame Generator printable assembly manifest',
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          frame: {
            shape: params.shape,
            outerMm: params.shape === 'hex'
              ? { x: Number((2 * (params.wPic + 2 * params.clearance + 2 * params.tBorder) / Math.sqrt(3)).toFixed(2)), y: Number((params.wPic + 2 * params.clearance + 2 * params.tBorder).toFixed(2)), z: params.height }
              : { x: Number((params.wPic + 2 * params.clearance + 2 * params.tBorder).toFixed(2)), y: Number((params.lPic + 2 * params.clearance + 2 * params.tBorder).toFixed(2)), z: params.height }
          },
          printer: { name: project.printer.name, bedMm: bedSize, fitCheck: 'axis-aligned XY footprint; 90 degree in-plane rotation allowed' },
          assembly: {
            jointType: params.jointType,
            ...(isBowtie ? { bowtieKeysRequired: bowtieQuantity } : {}),
            instructions: ui.assemblySplit,
            ...(isBowtie ? { additionalInstructions: ui.assemblyBowtie(bowtieQuantity) } : {})
          },
          parts: manifestParts
        };
        const readme = `${ui.assemblyTitle}\n\n${ui.assemblySplit}${isBowtie ? `\n\n${ui.assemblyBowtie(bowtieQuantity)}` : ''}\n\n${ui.bedGrid}\n`;
        entries.push({ name: 'assembly.txt', data: readme }, { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
        const prefix = lang === 'en' ? 'frame-parts' : 'czesci-ramki';
        downloadZip(entries, `${prefix}_${params.shape}_${params.wPic}mm.zip`);
        setProjectStatus(ui.downloadZip);
        setProjectStatusIsError(false);
      } else {
        if (!model.geometry) throw new Error('Frame geometry is unavailable.');
        const shapeStr = params.shape === 'hex' ? 'hex' : 'rect';
        const prefix = lang === 'en' ? 'frame' : 'ramka';
        const filename = `${prefix}_${shapeStr}_${params.wPic}x${params.shape === 'hex' ? params.wPic : params.lPic}mm_h${params.height}_b${params.tBorder}.stl`;
        downloadSTL(model.geometry.positions, model.geometry.normals, filename);
        setProjectStatus(ui.downloadStl);
        setProjectStatusIsError(false);
      }
    } catch (error) {
      reportError(`${ui.geometryFailed} ${error instanceof Error ? error.message : 'Unknown export error.'}`);
    }
  };

  const exportProject = () => {
    try {
      downloadText(JSON.stringify(project, null, 2), ui.projectFile, 'application/json');
      setProjectStatus(ui.exported);
      setProjectStatusIsError(false);
    } catch (error) {
      reportError(error instanceof Error ? error.message : 'Project export failed.');
    }
  };

  const exportRecoveryBackup = (raw: string, filename: string, label: string) => {
    if (!raw) {
      return;
    }
    downloadText(raw, filename, 'application/json');
    setProjectStatus(label);
    setProjectStatusIsError(false);
  };

  const importProject = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error(ui.fileTooLarge);
      const imported = parseProjectText(await file.text());
      setBedXDraft(null);
      setBedYDraft(null);
      setActiveStripId(null);
      changeProject(imported);
      setProjectStatus(ui.imported);
      setProjectStatusIsError(false);
    } catch (error) {
      reportError(`${ui.importFailed} ${error instanceof Error ? error.message : 'Unknown import error.'}`);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const selectPrinter = (profileId: string) => {
    const selected = PRINTER_PROFILES.find((profile) => profile.id === profileId);
    if (!selected) return;
    setBedXDraft(null);
    setBedYDraft(null);
    changeProject((current) => ({
      ...current,
      printer: profileId === 'custom'
        ? { ...current.printer, profileId: 'custom', name: ui.custom }
        : { profileId: selected.id, name: selected.name, bedX: selected.bed.x, bedY: selected.bed.y }
    }));
  };

  const setBedDimension = (key: 'bedX' | 'bedY', raw: string) => {
    const value = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(value) || value < 50 || value > 2000) {
      if (key === 'bedX') setBedXDraft(raw);
      else setBedYDraft(raw);
      return;
    }
    changeProject((current) => ({
      ...current,
      printer: { ...current.printer, profileId: 'custom', name: ui.custom, [key]: value }
    }));
    if (key === 'bedX') setBedXDraft(null);
    else setBedYDraft(null);
  };

  const resetBedDraft = (key: 'bedX' | 'bedY') => {
    if (key === 'bedX') setBedXDraft(null);
    else setBedYDraft(null);
  };

  const wPocket = params.wPic + 2 * params.clearance;
  const lPocket = params.shape === 'hex' ? wPocket : (params.lPic + 2 * params.clearance);
  const wOut = wPocket + 2 * params.tBorder;
  const lOut = params.shape === 'hex' ? wOut : (lPocket + 2 * params.tBorder);
  const volumeMm3 = useMemo(() => {
    if (parameterErrors.length) return 0;
    try {
      const value = calculateFrameVolume(params);
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch {
      return 0;
    }
  }, [params, parameterErrors.length]);
  const volumeCm3 = volumeMm3 / 1000;
  const massGrams = volumeCm3 * 1.24;
  const fitCount = bedFits.rows.filter((row) => row.fit.fits).length;
  const isCustomPrinter = project.printer.profileId === 'custom' || !PRINTER_PROFILES.some((profile) => profile.id === project.printer.profileId);

  return (
    <div className="app-container">
      <ControlPanel
        params={params}
        onChange={setParams}
        onDownload={handleDownload}
        showGrid={showGrid}
        setShowGrid={setShowGrid}
        lang={lang}
        setLang={setLang}
        cachedParts={model.splitParts ?? []}
        exportDisabled={Boolean(model.error) || parameterErrors.length > 0}
      />

      <div className="viewport-container">
        <div className="project-toolbar glass-panel">
          <strong>{ui.projectTitle}</strong>
          <button className="preset-btn" onClick={exportProject}>{ui.saveProject}</button>
          <button className="preset-btn" onClick={() => importInputRef.current?.click()}>{ui.importProject}</button>
          {initialLoad.recoveryBackup && <button className="preset-btn" onClick={() => exportRecoveryBackup(initialLoad.recoveryBackup!, 'framegen-recovery.json', ui.downloadRecovery)}>{ui.downloadRecovery}</button>}
          {initialLoad.recoveryRaw && (!initialLoad.recoverySaved || initialLoad.recoveryBackup !== initialLoad.recoveryRaw) && <button className="preset-btn" onClick={() => exportRecoveryBackup(initialLoad.recoveryRaw!, 'framegen-recovery-current.json', ui.downloadCurrentRecovery)}>{ui.downloadCurrentRecovery}</button>}
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            aria-label={ui.importProject}
            onChange={(event) => void importProject(event.target.files?.[0])}
            hidden
          />
          <span className={`project-status${statusIsError ? ' is-error' : ''}`} role="status" aria-live="polite">{statusText}</span>
        </div>

        <section className="printer-settings glass-panel" aria-label={ui.printer}>
          <label>
            <span>{ui.printer}</span>
            <select value={isCustomPrinter ? 'custom' : project.printer.profileId} onChange={(event) => selectPrinter(event.target.value)}>
              {PRINTER_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.id === 'custom' ? ui.custom : profile.name}</option>)}
            </select>
          </label>
          {isCustomPrinter && <>
            <label><span>{ui.bedX}</span><input type="number" min="50" max="2000" step="1" value={bedXDraft ?? String(project.printer.bedX)} onChange={(event) => setBedDimension('bedX', event.target.value)} onBlur={() => resetBedDraft('bedX')} /></label>
            <label><span>{ui.bedY}</span><input type="number" min="50" max="2000" step="1" value={bedYDraft ?? String(project.printer.bedY)} onChange={(event) => setBedDimension('bedY', event.target.value)} onBlur={() => resetBedDraft('bedY')} /></label>
          </>}
          <div className="printer-fit" aria-live="polite">
            <strong>{ui.fit}: {fitCount}/{bedFits.rows.length} {ui.fittingParts}</strong>
            {bedFits.rows.length > 0 && <span>{fitCount === bedFits.rows.length ? ui.allFit : ui.someDoNotFit}</span>}
            {bedFits.rows.some((row) => !row.fit.fits) && (
              <ul>{bedFits.rows.filter((row) => !row.fit.fits).map((row) => <li key={row.name}>{row.name}: {ui.tooLarge} ({row.fit.width.toFixed(1)} × {row.fit.length.toFixed(1)} mm)</li>)}</ul>
            )}
            {bedFits.error && <span className="is-error">{bedFits.error}</span>}
            <small>{ui.bedGrid}</small>
          </div>
        </section>

        <div className="app-tabs" role="tablist" style={{ display: 'flex', borderBottom: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.3)', zIndex: 11 }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === '3d'}
            onClick={() => setActiveTab('3d')}
            style={{ padding: '1rem 1.75rem', background: activeTab === '3d' ? 'rgba(255,255,255,0.03)' : 'none', border: 'none', borderBottom: activeTab === '3d' ? '3px solid var(--color-primary)' : '3px solid transparent', color: activeTab === '3d' ? 'var(--text-main)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, outline: 'none', transition: 'all 0.15s ease' }}
          >{t.tab3d}</button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === '2d'}
            onClick={() => setActiveTab('2d')}
            style={{ padding: '1rem 1.75rem', background: activeTab === '2d' ? 'rgba(255,255,255,0.03)' : 'none', border: 'none', borderBottom: activeTab === '2d' ? '3px solid var(--color-primary)' : '3px solid transparent', color: activeTab === '2d' ? 'var(--text-main)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, outline: 'none', transition: 'all 0.15s ease' }}
          >{t.tab2d}</button>
        </div>

        <div className="viewport-content" style={{ flexGrow: 1, position: 'relative' }}>
          {activeTab === '3d' ? <>
            <div className="toolbar">
              <div className="toolbar-panel glass-panel">
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '0.4rem' }}>{t.colorLabel}</span>
                {FILAMENT_COLORS.map((col) => <button key={col.hex} className={`color-option ${materialColor.toLowerCase() === col.hex.toLowerCase() ? 'active' : ''}`} style={{ backgroundColor: col.hex }} title={t[col.key]} aria-label={t[col.key]} onClick={() => changeProject((current) => ({ ...current, materialColor: col.hex }))} />)}
                <div style={{ display: 'flex', alignItems: 'center', marginLeft: '0.25rem', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '0.5rem' }}>
                  <input type="color" value={materialColor} onChange={(event) => changeProject((current) => ({ ...current, materialColor: event.target.value }))} title={t.customColorTitle} aria-label={t.customColorTitle} style={{ width: '24px', height: '24px', border: '2px solid rgba(255, 255, 255, 0.2)', borderRadius: '50%', cursor: 'pointer', background: 'none', padding: 0, outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            <div className="print-tip" style={{ position: 'absolute', top: '1.25rem', left: '1.25rem', zIndex: 10, pointerEvents: 'none', maxWidth: '380px' }}>
              <div className="info-banner glass-panel">
                <span className="info-banner-icon">💡</span>
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.15rem', color: 'var(--text-main)' }}>{t.tipTitle}</p>
                  <p style={{ color: 'var(--text-muted)' }}>{t.tipDesc}</p>
                </div>
              </div>
            </div>

            {parameterErrors.length > 0 && <div className="export-errors" role="alert"><strong>{ui.invalidParams}</strong><ul>{parameterErrors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></div>}
            {model.error && <div className="export-errors" role="alert">{ui.geometryFailed} {model.error}</div>}
            <Suspense fallback={<div className="preview-loading" role="status">{ui.loadingPreview}</div>}>
              {model.geometry || model.splitParts ? <ThreePreview
                params={params}
                materialColor={materialColor}
                showGrid={showGrid}
                visualizeTape={true}
                strips={project.strips}
                geometry={model.geometry ?? undefined}
                splitParts={model.splitParts}
                bedSize={bedSize}
                lang={lang}
              /> : null}
            </Suspense>
          </> : <MountingPlanner
            params={params}
            lang={lang}
            bedSize={bedSize}
            strips={project.strips}
            setStrips={setStrips}
            activeStripId={activeStripId}
            setActiveStripId={setActiveStripId}
          />}

          <div className="hud-dimensions" style={{ zIndex: 10 }}>
            <div className="hud-line"><span className="hud-label">{t.hudOuterSize}:</span><span className="hud-val">{params.shape === 'hex' ? `${(2 * wOut / Math.sqrt(3)).toFixed(1)} × ${wOut.toFixed(1)} mm (X × Y; ${t.hudHexBokBok})` : `${wOut.toFixed(1)} × ${lOut.toFixed(1)} mm`}</span></div>
            <div className="hud-line"><span className="hud-label">{t.hudHeight}:</span><span className="hud-val">{params.height.toFixed(1)} mm</span></div>
            <div className="hud-line"><span className="hud-label">{t.hudVolume}:</span><span className="hud-val">{volumeCm3.toFixed(1)} cm³</span></div>
            <div className="hud-line" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.25rem', marginTop: '0.25rem' }}><span className="hud-label">{t.hudWeight}:</span><span className="hud-val" style={{ color: 'var(--color-primary-hover)' }}>{massGrams.toFixed(1)} g</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
