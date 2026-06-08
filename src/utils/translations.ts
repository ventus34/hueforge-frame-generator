export type Lang = 'pl' | 'en';

export const TRANSLATIONS = {
  pl: {
    // Header
    title: 'FrameGen 3D',
    tipTitle: 'Porada dotycząca druku 3D',
    tipDesc: 'Drukuj ramkę frontem do dołu na stole teksturowanym PEI. Nie potrzebujesz podpór (suportów). Luz ułatwia spasowanie.',
    
    // Tabs
    tab3d: '👁️ Podgląd 3D',
    tab2d: '📐 Planer montażu',
    
    // Presets
    presetsTitle: 'Szablony Rozmiarów',
    presetSquare: 'Kwadrat',
    presetPhoto: 'Zdjęcie',
    presetHex: 'Heksagon',
    presetPosterM: 'Plakat M (45x32 cm)',
    presetPosterL: 'Plakat L (67.5x48 cm)',
    presetPosterXL: 'Plakat XL (90x64 cm)',
    
    // Shape selector
    shapeTitle: 'Kształt Ramki',
    shapeRect: 'Prostokąt',
    shapeHex: 'Heksagon (Hex)',
    
    // Picture dimensions
    picDimensionsTitle: 'Wymiary Obrazka',
    picHexWidth: 'Rozmiar heksagonu (bok-bok)',
    picWidth: 'Szerokość obrazka',
    picLength: 'Długość obrazka',
    clearance: 'Luz wokół obrazka',
    
    // Frame params
    frameParamsTitle: 'Parametry Obramowania',
    borderThickness: 'Grubość obramowania',
    cornerRadius: 'Zaokrąglenie rogów',
    height: 'Wysokość całkowita',
    pocketDepth: 'Głębokość kieszeni',
    shelfWidth: 'Szerokość podparcia',
    
    // Wall mounting
    wallMountingTitle: 'Montaż ścienny',
    keyholeToggle: 'Otwory na gwoździe / haczyki',
    hangerSide: 'Bok z otworami',
    hangerSideTop: 'Góra',
    hangerSideBottom: 'Dół',
    hangerSideLeft: 'Lewo',
    hangerSideRight: 'Prawo',
    hangerCount: 'Liczba otworów',
    hangerDiameter: 'Średnica otworu',
    narrowBorderWarning: '⚠️ Średnica otworu została ograniczona szerokością obramowania.',
    
    // Visual settings
    visual3dTitle: 'Wizualizacja 3D',
    gridToggle: 'Siatka stółu (256x256)',
    colorLabel: 'Kolor filamentu:',
    customColorTitle: 'Własny kolor HEX',
    
    // Actions
    downloadStl: '💾 Pobierz plik STL',
    showSchematic: '❓ Pokaż schemat przekroju',
    
    // HUD
    hudOuterSize: 'Rozmiar zewnętrzny',
    hudHeight: 'Wysokość ramki',
    hudVolume: 'Objętość modelu',
    hudWeight: 'Szacowana waga (PLA)',
    hudHexBokBok: 'bok-bok',
    
    // Schematic modal
    modalTitle: 'Schemat Przekroju Ramki',
    modalDesc: 'Poniższy diagram pokazuje przekrój boczny (oś Z jest skierowana w górę). Domyślnie ramka drukowana jest frontem do dołu (na stole), co daje doskonałą fakturę przodu.',
    modalLabelT: 'Obramowanie',
    modalLabelS: 'Podparcie',
    modalLabelD: 'Głębokość kieszeni',
    modalLabelH: 'Wysokość',
    modalLabelW: 'Rozmiar zewnętrzny',
    modalLabelPic: 'Obrazek HueForge',
    modalGridLabel: 'STÓŁ ROBOCZY (Z=0)',
    modalLegendT: 'Grubość ścianki zewnętrznej wokół obrazka.',
    modalLegendS: 'Podparcie z przodu, które zapobiega wypadnięciu obrazka.',
    modalLegendD: 'Miejsce na obrazek (np. grubość HueForge + luz).',
    modalLegendH: 'Całkowita grubość ramki (Z). Szacuje w Z nad stołem.',
    
    // Mounting Planner
    plannerAddTitle: 'Dodaj Rzepy / Taśmy',
    plannerSmall: '➕ Mały (S)',
    plannerMedium: '➕ Średni (M)',
    plannerLarge: '➕ Duży (L)',
    plannerCustom: '➕ Niestandardowy',
    plannerSelectedTitle: 'Wybrany Pasek',
    plannerCustomWidth: 'Szerokość',
    plannerCustomLength: 'Długość',
    plannerAngle: 'Kąt obrotu',
    plannerDelete: '🗑️ Usuń pasek',
    plannerClearAll: '❌ Usuń wszystkie',
    plannerSizeLabel: 'Rozmiar:',
    plannerDragTip: '🖱️ Przeciągaj paski lewym przyciskiem myszy. Przeciągaj tło, aby przesuwać widok.',
    plannerWheelTip: '🔍 Użyj kółka myszy lub suwaka w panelu, aby przybliżać/oddalać.',
    plannerInvalidTip: '⚠️ Kolor czerwony oznacza nieprawidłowe ułożenie',
    plannerResetView: '🔄 Resetuj widok',
    plannerZoomTitle: 'Przybliżenie / Widok',
    plannerZoomIn: 'Przybliż',
    plannerZoomOut: 'Oddal',
    
    // Strip sizes
    stripS: 'Mały rzep (46x16mm)',
    stripM: 'Średni rzep (54x19mm)',
    stripL: 'Duży rzep (92x19mm)',
    stripCustom: 'Niestandardowy rzep',

    // Filament colors
    colorBlack: 'PLA Czarny',
    colorOrange: 'PLA Pomarańczowy',
    colorWhite: 'PLA Biały',
    colorGold: 'PLA Silk Złoty',
    colorGray: 'PLA Szary',

    // Splitting
    splitTitle: 'Dzielenie Ramki (Druk w częściach)',
    splitToggle: 'Włącz dzielenie ramki',
    maxPartLength: 'Maks. długość części',
    jointType: 'Typ połączenia',
    jointHalfLap: 'Na zakładkę (Half-lap)',
    jointBowtie: 'Ukośne z motylkiem (Bowtie)',
    jointDovetail: 'Jaskółczy ogon (Dovetail)',
    downloadPartsTitle: 'Pobierz części ramki',
    downloadPartBtn: 'Pobierz część',
    downloadBowtieBtn: 'Pobierz motylka (Bowtie)',
    jointTypeDesc: 'Złącza stolarskie umożliwiają precyzyjne łączenie i klejenie części po wydruku.'
  },
  en: {
    // Header
    title: 'FrameGen 3D',
    tipTitle: '3D Printing Tip',
    tipDesc: 'Print the frame face-down on a textured PEI plate. No supports needed. Clearance tolerance ensures a comfortable fit.',
    
    // Tabs
    tab3d: '👁️ 3D Preview',
    tab2d: '📐 Mounting Planner',
    
    // Presets
    presetsTitle: 'Size Templates',
    presetSquare: 'Square',
    presetPhoto: 'Photo',
    presetHex: 'Hexagon',
    presetPosterM: 'Poster M (45x32 cm)',
    presetPosterL: 'Poster L (67.5x48 cm)',
    presetPosterXL: 'Poster XL (90x64 cm)',
    
    // Shape selector
    shapeTitle: 'Frame Shape',
    shapeRect: 'Rectangle',
    shapeHex: 'Hexagon',
    
    // Picture dimensions
    picDimensionsTitle: 'Picture Dimensions',
    picHexWidth: 'Hexagon size (flat-flat)',
    picWidth: 'Picture width',
    picLength: 'Picture length',
    clearance: 'Clearance gap',
    
    // Frame params
    frameParamsTitle: 'Border Parameters',
    borderThickness: 'Border thickness',
    cornerRadius: 'Corner rounding',
    height: 'Total height',
    pocketDepth: 'Pocket depth',
    shelfWidth: 'Support shelf',
    
    // Wall mounting
    wallMountingTitle: 'Wall Mounting',
    keyholeToggle: 'Nail / hook holes',
    hangerSide: 'Hanger side',
    hangerSideTop: 'Top',
    hangerSideBottom: 'Bottom',
    hangerSideLeft: 'Left',
    hangerSideRight: 'Right',
    hangerCount: 'Hole count',
    hangerDiameter: 'Hole diameter',
    narrowBorderWarning: '⚠️ Hole diameter is constrained by the border thickness.',
    
    // Visual settings
    visual3dTitle: '3D Viewport',
    gridToggle: 'Show grid (256x256)',
    colorLabel: 'Filament color:',
    customColorTitle: 'Custom HEX color',
    
    // Actions
    downloadStl: '💾 Download STL File',
    showSchematic: '❓ Show Cross-Section Schematic',
    
    // HUD
    hudOuterSize: 'Outer dimensions',
    hudHeight: 'Frame height',
    hudVolume: 'Model volume',
    hudWeight: 'Estimated weight (PLA)',
    hudHexBokBok: 'flat-flat',
    
    // Schematic modal
    modalTitle: 'Frame Cross-Section Schematic',
    modalDesc: 'The diagram below shows the side cross-section (Z-axis points upwards). By default, the frame is printed face-down on the print bed to get a clean textured front.',
    modalLabelT: 'Border',
    modalLabelS: 'Support shelf',
    modalLabelD: 'Pocket depth',
    modalLabelH: 'Height',
    modalLabelW: 'Outer dimension',
    modalLabelPic: 'HueForge Print',
    modalGridLabel: 'PRINT BED (Z=0)',
    modalLegendT: 'Outer wall thickness surrounding the picture.',
    modalLegendS: 'Front lip supporting the picture to prevent it from falling forward.',
    modalLegendD: 'Recess space for the picture (e.g. print thickness + clearance).',
    modalLegendH: 'Total frame thickness (Z-height above the print bed).',
    
    // Mounting Planner
    plannerAddTitle: 'Add Strips / Tapes',
    plannerSmall: '➕ Small (S)',
    plannerMedium: '➕ Medium (M)',
    plannerLarge: '➕ Large (L)',
    plannerCustom: '➕ Custom',
    plannerSelectedTitle: 'Selected Strip',
    plannerCustomWidth: 'Width',
    plannerCustomLength: 'Length',
    plannerAngle: 'Rotation angle',
    plannerDelete: '🗑️ Delete strip',
    plannerClearAll: '❌ Clear all',
    plannerSizeLabel: 'Size:',
    plannerDragTip: '🖱️ Left-click and drag strips. Drag the background to pan the view.',
    plannerWheelTip: '🔍 Use the mouse wheel or the sidebar slider to zoom in/out.',
    plannerInvalidTip: '⚠️ Red indicates invalid strip placement',
    plannerResetView: '🔄 Reset View',
    plannerZoomTitle: 'Zoom / View',
    plannerZoomIn: 'Zoom In',
    plannerZoomOut: 'Zoom Out',
    
    // Strip sizes
    stripS: 'Small strip (46x16mm)',
    stripM: 'Medium strip (54x19mm)',
    stripL: 'Large strip (92x19mm)',
    stripCustom: 'Custom strip',

    // Filament colors
    colorBlack: 'PLA Black',
    colorOrange: 'PLA Orange',
    colorWhite: 'PLA White',
    colorGold: 'PLA Silk Gold',
    colorGray: 'PLA Gray',

    // Splitting
    splitTitle: 'Frame Splitting (Multi-part print)',
    splitToggle: 'Enable frame splitting',
    maxPartLength: 'Max part length',
    jointType: 'Joint type',
    jointHalfLap: 'Half-lap joint',
    jointBowtie: 'Miter with Bowtie key',
    jointDovetail: 'Dovetail joint',
    downloadPartsTitle: 'Download Frame Parts',
    downloadPartBtn: 'Download part',
    downloadBowtieBtn: 'Download Bowtie Key',
    jointTypeDesc: 'Woodworking joints allow robust connection and alignment when gluing printed parts.'
  }
};
export type TranslationType = typeof TRANSLATIONS.pl;
export type TranslationKey = keyof TranslationType;
