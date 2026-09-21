import { describe, expect, it, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import db from '@/lib/db';
import { DELETE } from '@/app/api/delete/route';

describe('DELETE /api/delete', () => {
  const downloadsDir = path.join(process.cwd(), 'downloads');

  beforeEach(() => {
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }
  });

  it('rejects requests missing type or id with 400', async () => {
    const req = new Request('http://localhost/api/delete?type=movie');
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing type or id');
  });

  it('rejects invalid type with 400', async () => {
    const req = new Request('http://localhost/api/delete?type=unknown&id=999');
    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid type');
  });

  it('returns 404 when movie does not exist', async () => {
    const req = new Request('http://localhost/api/delete?type=movie&id=999999');
    const res = await DELETE(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Movie not found');
  });

  it('removes movie from DB but keeps file on disk when deleteFile=0', async () => {
    const testFile = path.join(downloadsDir, `test_movie_keep_${Date.now()}.mkv`);
    fs.writeFileSync(testFile, 'keep me');

    const info = db.prepare(`
      INSERT INTO movies (filePath, fileName, title, year)
      VALUES (?, ?, ?, ?)
    `).run(testFile, path.basename(testFile), 'Test Keep', 2026);
    const movieId = Number(info.lastInsertRowid);

    const req = new Request(`http://localhost/api/delete?type=movie&id=${movieId}&deleteFile=0`);
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.filesDeleted).toBe(0);

    // DB row is gone
    const row = db.prepare('SELECT id FROM movies WHERE id = ?').get(movieId);
    expect(row).toBeUndefined();

    // File still on disk
    expect(fs.existsSync(testFile)).toBe(true);
    fs.unlinkSync(testFile);
  });

  it('deletes file from disk and removes DB row when deleteFile=1', async () => {
    const testFile = path.join(downloadsDir, `test_movie_delete_${Date.now()}.mkv`);
    fs.writeFileSync(testFile, 'delete me');

    const info = db.prepare(`
      INSERT INTO movies (filePath, fileName, title, year)
      VALUES (?, ?, ?, ?)
    `).run(testFile, path.basename(testFile), 'Test Delete', 2026);
    const movieId = Number(info.lastInsertRowid);

    const req = new Request(`http://localhost/api/delete?type=movie&id=${movieId}&deleteFile=1`);
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.filesDeleted).toBe(1);

    // DB row is gone
    const row = db.prepare('SELECT id FROM movies WHERE id = ?').get(movieId);
    expect(row).toBeUndefined();

    // File is removed from disk
    expect(fs.existsSync(testFile)).toBe(false);
  });

  it('does NOT delete DB row and returns 409 when file is locked on disk', async () => {
    const testFile = path.join(downloadsDir, `test_movie_locked_${Date.now()}.mkv`);
    fs.writeFileSync(testFile, 'locked file');

    const info = db.prepare(`
      INSERT INTO movies (filePath, fileName, title, year)
      VALUES (?, ?, ?, ?)
    `).run(testFile, path.basename(testFile), 'Test Locked', 2026);
    const movieId = Number(info.lastInsertRowid);

    // Mock fs.rmSync to simulate EBUSY lock failure
    const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {
      const err = new Error("EBUSY: resource busy or locked, unlink '...'") as Error & { code: string };
      err.code = 'EBUSY';
      throw err;
    });

    try {
      const req = new Request(`http://localhost/api/delete?type=movie&id=${movieId}&deleteFile=1`);
      const res = await DELETE(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('File is locked by another process');

      // CRUCIAL: Database record must remain intact so it is not orphaned
      const row = db.prepare('SELECT id FROM movies WHERE id = ?').get(movieId);
      expect(row).toBeDefined();
    } finally {
      rmSpy.mockRestore();
      db.prepare('DELETE FROM movies WHERE id = ?').run(movieId);
      if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    }
  });

  it('allows DB row deletion if file already does not exist on disk', async () => {
    const missingFile = path.join(downloadsDir, `missing_${Date.now()}.mkv`);

    const info = db.prepare(`
      INSERT INTO movies (filePath, fileName, title, year)
      VALUES (?, ?, ?, ?)
    `).run(missingFile, path.basename(missingFile), 'Missing File', 2026);
    const movieId = Number(info.lastInsertRowid);

    const req = new Request(`http://localhost/api/delete?type=movie&id=${movieId}&deleteFile=1`);
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // DB row is deleted
    const row = db.prepare('SELECT id FROM movies WHERE id = ?').get(movieId);
    expect(row).toBeUndefined();
  });
});
