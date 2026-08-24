/**
 * AutoCAD Color Index (ACI) — 256-entry lookup table mapping ACI index (0-255)
 * to a hex RGB color string. Index 1 = red, index 7 = white, etc.
 *
 * Copied verbatim from dxf-parser's own (not publicly exported) AutoCadColorIndex
 * table (node_modules/dxf-parser/dist/AutoCadColorIndex.js), converted from decimal
 * 0xRRGGBB integers to hex strings. Index 0 and 256 are reserved for BYBLOCK/BYLAYER
 * inheritance sentinels in AutoCAD and should not be used for direct color lookups —
 * see src/dxf/resolveColors.ts for how those sentinels are handled.
 */
export const ACI_COLORS: string[] = [
  "#000000", "#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF", "#FFFFFF",
  "#808080", "#C0C0C0", "#FF0000", "#FF7F7F", "#CC0000", "#CC6666", "#990000", "#994C4C",
  "#7F0000", "#7F3F3F", "#4C0000", "#4C2626", "#FF3F00", "#FF9F7F", "#CC3300", "#CC7F66",
  "#992600", "#995F4C", "#7F1F00", "#7F4F3F", "#4C1300", "#4C2F26", "#FF7F00", "#FFBF7F",
  "#CC6600", "#CC9966", "#994C00", "#99724C", "#7F3F00", "#7F5F3F", "#4C2600", "#4C3926",
  "#FFBF00", "#FFDF7F", "#CC9900", "#CCB266", "#997200", "#99854C", "#7F5F00", "#7F6F3F",
  "#4C3900", "#4C4226", "#FFFF00", "#FFFF7F", "#CCCC00", "#CCCC66", "#989800", "#98984C",
  "#7F7F00", "#7F7F3F", "#4C4C00", "#4C4C26", "#BFFF00", "#DFFF7F", "#99CC00", "#B2CC66",
  "#729800", "#85984C", "#5F7F00", "#6F7F3F", "#394C00", "#424C26", "#7FFF00", "#BFFF7F",
  "#66CC00", "#99CC66", "#4C9800", "#72984C", "#3F7F00", "#5F7F3F", "#264C00", "#394C26",
  "#3FFF00", "#9FFF7F", "#33CC00", "#7FCC66", "#269800", "#5F984C", "#1F7F00", "#4F7F3F",
  "#134C00", "#2F4C26", "#00FF00", "#7FFF7F", "#00CC00", "#66CC66", "#009800", "#4C984C",
  "#007F00", "#3F7F3F", "#004C00", "#264C26", "#00FF3F", "#7FFF9F", "#00CC33", "#66CC7F",
  "#009826", "#4C985F", "#007F1F", "#3F7F4F", "#004C13", "#264C2F", "#00FF7F", "#7FFFBF",
  "#00CC66", "#66CC99", "#00984C", "#4C9872", "#007F3F", "#3F7F5F", "#004C26", "#264C39",
  "#00FFBF", "#7FFFDF", "#00CC99", "#66CCB2", "#009872", "#4C9885", "#007F5F", "#3F7F6F",
  "#004C39", "#264C42", "#00FFFF", "#7FFFFF", "#00CCCC", "#66CCCC", "#009898", "#4C9898",
  "#007F7F", "#3F7F7F", "#004C4C", "#264C4C", "#00BFFF", "#7FDFFF", "#0099CC", "#66B2CC",
  "#007298", "#4C8598", "#005F7F", "#3F6F7F", "#00394C", "#26424C", "#007FFF", "#7FBFFF",
  "#0066CC", "#6699CC", "#004C98", "#4C7298", "#003F7F", "#3F5F7F", "#00264C", "#26394C",
  "#003FFF", "#7F9FFF", "#0033CC", "#667FCC", "#002698", "#4C5F98", "#001F7F", "#3F4F7F",
  "#00134C", "#262F4C", "#0000FF", "#7F7FFF", "#0000CC", "#6666CC", "#000098", "#4C4C98",
  "#00007F", "#3F3F7F", "#00004C", "#26264C", "#3F00FF", "#9F7FFF", "#3300CC", "#7F66CC",
  "#260098", "#5F4C98", "#1F007F", "#4F3F7F", "#13004C", "#2F264C", "#7F00FF", "#BF7FFF",
  "#6600CC", "#9966CC", "#4C0098", "#724C98", "#3F007F", "#5F3F7F", "#26004C", "#39264C",
  "#BF00FF", "#DF7FFF", "#9900CC", "#B266CC", "#720098", "#854C98", "#5F007F", "#6F3F7F",
  "#39004C", "#42264C", "#FF00FF", "#FF7FFF", "#CC00CC", "#CC66CC", "#980098", "#984C98",
  "#7F007F", "#7F3F7F", "#4C004C", "#4C264C", "#FF00BF", "#FF7FDF", "#CC0099", "#CC66B2",
  "#980072", "#984C85", "#7F005F", "#7F3F6F", "#4C0039", "#4C2642", "#FF007F", "#FF7FBF",
  "#CC0066", "#CC6699", "#98004C", "#984C72", "#7F003F", "#7F3F5F", "#4C0026", "#4C2639",
  "#FF003F", "#FF7F9F", "#CC0033", "#CC667F", "#980026", "#984C5F", "#7F001F", "#7F3F4F",
  "#4C0013", "#4C262F", "#333333", "#5B5B5B", "#848484", "#ADADAD", "#D6D6D6", "#FFFFFF",
];

/**
 * Look up a hex RGB color string for an ACI color index. Returns white (#FFFFFF)
 * for out-of-range indices (defensive fallback — should not happen for valid DXF).
 */
export function aciToHex(colorIndex: number): string {
  return ACI_COLORS[colorIndex] ?? '#FFFFFF';
}
