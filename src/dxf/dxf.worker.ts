import DxfParser from 'dxf-parser';
import type { IDxf } from 'dxf-parser';
import { rawTagScan, type RawTagScanResult } from './rawTagScan';
import { resolveAllColors } from './resolveColors';
import { ACI_COLORS } from './aciColorIndex';

export interface WorkerParseRequest {
  type: 'parse';
  text: string;
  fileName: string;
}

export interface WorkerSuccessResponse {
  type: 'success';
  dxfData: IDxf;
  unknownReport: RawTagScanResult;
  rawFileText: string;
  fileName: string;
}

export interface WorkerErrorResponse {
  type: 'error';
  message: string;
}

self.onmessage = (event: MessageEvent<WorkerParseRequest>) => {
  const { type, text, fileName } = event.data;
  if (type !== 'parse') return;

  try {
    const parser = new DxfParser();
    const dxfData = parser.parseSync(text);

    if (!dxfData) {
      const response: WorkerErrorResponse = {
        type: 'error',
        message: 'DXF parser returned no data. The file may be empty or malformed.',
      };
      self.postMessage(response);
      return;
    }

    const unknownReport = rawTagScan(text);

    const layers = dxfData.tables?.layer?.layers ?? {};
    resolveAllColors(dxfData.entities, layers, ACI_COLORS, dxfData.blocks);

    const response: WorkerSuccessResponse = {
      type: 'success',
      dxfData,
      unknownReport,
      rawFileText: text,
      fileName,
    };
    self.postMessage(response);
  } catch (error) {
    const response: WorkerErrorResponse = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown parsing error.',
    };
    self.postMessage(response);
  }
};
