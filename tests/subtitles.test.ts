import { describe, expect, it } from 'vitest';

describe('Subtitle WebVTT conversion and script detection', () => {
  function srtToVtt(srt: string): string {
    let vtt = 'WEBVTT\n\n';
    const clean = srt.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    const lines = clean.split('\n');
    for (const line of lines) {
      vtt += (line.includes('-->') ? line.replace(/,/g, '.') : line) + '\n';
    }
    return vtt;
  }

  function detectScriptLanguage(sample: string): string {
    if (/[\u0D40-\u0DFF]/.test(sample)) return 'si'; // Sinhala
    if (/[\u0B80-\u0BFF]/.test(sample)) return 'ta'; // Tamil
    if (/[\u0900-\u097F]/.test(sample)) return 'hi'; // Hindi
    if (/[\u0600-\u06FF]/.test(sample)) return 'ar'; // Arabic
    if (/[\u4E00-\u9FFF]/.test(sample)) return 'zh'; // Chinese
    return '';
  }

  it('strips UTF-8 BOM from start of SRT and formats WebVTT header cleanly', () => {
    const srtWithBom = '\uFEFF1\n00:01:23,456 --> 00:01:25,789\nHello world\n';
    const vtt = srtToVtt(srtWithBom);
    expect(vtt.startsWith('WEBVTT\n\n1\n00:01:23.456 --> 00:01:25.789\nHello world')).toBe(true);
    expect(vtt.includes('\uFEFF')).toBe(false);
  });

  it('detects Sinhala script accurately', () => {
    const sinhalaText = '\u0DB8\u0DD9\u0DB8 \u0DC0\u0DD2\u0DA9\u0DD2\u0DBA\u0DDD';
    expect(detectScriptLanguage(sinhalaText)).toBe('si');
  });

  it('detects Tamil script accurately', () => {
    const tamilText = '\u0BB5\u0BA3\u0B95\u0BCD\u0B95\u0BAE\u0BCD';
    expect(detectScriptLanguage(tamilText)).toBe('ta');
  });

  it('returns empty string for plain Latin text without non-latin scripts', () => {
    const latinText = 'Just standard English text';
    expect(detectScriptLanguage(latinText)).toBe('');
  });
});