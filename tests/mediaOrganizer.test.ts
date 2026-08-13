import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getTvShowsDirectory,
  formatSeasonFolderName,
  sanitizeFolderName,
  organizeTvEpisodeFile,
  organizeDownloadedItem,
  organizeLooseTvShowsInDownloads,
  cleanupJunkDirectory,
  cleanupEmptyMediaDirectories,
} from '@/lib/mediaOrganizer';

describe('mediaOrganizer', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lflix-test-'));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch { /* ignore */ }
  });

  describe('getTvShowsDirectory', () => {
    it('creates TV Shows directory inside the base download folder if it does not exist', () => {
      const tvShowsDir = getTvShowsDirectory(tempDir);
      expect(fs.existsSync(tvShowsDir)).toBe(true);
      expect(path.basename(tvShowsDir)).toBe('TV Shows');
    });

    it('reuses existing TV shows folder with different casing', () => {
      const existing = path.join(tempDir, 'tv shows');
      fs.mkdirSync(existing, { recursive: true });

      const tvShowsDir = getTvShowsDirectory(tempDir);
      expect(path.resolve(tvShowsDir)).toBe(path.resolve(existing));
    });
  });

  describe('formatSeasonFolderName', () => {
    it('defaults to "Season X" format', () => {
      const showDir = path.join(tempDir, 'Breaking Bad');
      expect(formatSeasonFolderName(showDir, 1)).toBe('Season 1');
      expect(formatSeasonFolderName(showDir, 5)).toBe('Season 5');
    });

    it('matches "Season 01" two-digit format if already used in the show directory', () => {
      const showDir = path.join(tempDir, 'Breaking Bad');
      fs.mkdirSync(path.join(showDir, 'Season 01'), { recursive: true });

      expect(formatSeasonFolderName(showDir, 2)).toBe('Season 02');
    });
  });

  describe('sanitizeFolderName', () => {
    it('removes invalid filesystem characters and extra spaces', () => {
      expect(sanitizeFolderName('What/If...? <2021>: Season')).toBe('WhatIf... 2021 Season');
      expect(sanitizeFolderName('Show: Name *Special*')).toBe('Show Name Special');
    });
  });

  describe('organizeTvEpisodeFile', () => {
    it('moves a loose TV show video file into TV Shows/<Show Name>/Season <N>/<file>', async () => {
      const episodeFile = path.join(tempDir, 'Breaking.Bad.S02E05.1080p.mkv');
      fs.writeFileSync(episodeFile, 'mock video content');

      const result = await organizeTvEpisodeFile(episodeFile, { baseDownloadPath: tempDir });

      expect(result.moved).toBe(true);
      expect(result.showTitle).toBe('Breaking Bad');
      expect(result.seasonNumber).toBe(2);
      expect(result.newPath).toBeDefined();

      const expectedPath = path.join(tempDir, 'TV Shows', 'Breaking Bad', 'Season 2', 'Breaking.Bad.S02E05.1080p.mkv');
      expect(path.resolve(result.newPath!)).toBe(path.resolve(expectedPath));
      expect(fs.existsSync(expectedPath)).toBe(true);
      expect(fs.existsSync(episodeFile)).toBe(false);
    });

    it('does not move non-TV files or sample clips', async () => {
      const movieFile = path.join(tempDir, 'Inception.2010.1080p.mkv');
      fs.writeFileSync(movieFile, 'mock video');

      const result = await organizeTvEpisodeFile(movieFile, { baseDownloadPath: tempDir });
      expect(result.moved).toBe(false);
      expect(fs.existsSync(movieFile)).toBe(true);

      const sampleFile = path.join(tempDir, 'Breaking.Bad.S01E01.sample.mkv');
      fs.writeFileSync(sampleFile, 'mock sample');
      const sampleResult = await organizeTvEpisodeFile(sampleFile, { baseDownloadPath: tempDir });
      expect(sampleResult.moved).toBe(false);
    });
  });

  describe('organizeDownloadedItem', () => {
    it('moves video files from a torrent subfolder and deletes the torrent directory containing junk files', async () => {
      const torrentFolder = path.join(tempDir, 'Severance.S01E01.1080p.WEB-DL-GROUP');
      fs.mkdirSync(torrentFolder, { recursive: true });

      const videoFile = path.join(torrentFolder, 'Severance.S01E01.mkv');
      const nfoFile = path.join(torrentFolder, 'release.nfo');
      const txtFile = path.join(torrentFolder, 'torrent-info.txt');

      fs.writeFileSync(videoFile, 'video-data');
      fs.writeFileSync(nfoFile, 'nfo-data');
      fs.writeFileSync(txtFile, 'txt-data');

      const result = await organizeDownloadedItem(tempDir, 'Severance.S01E01.1080p.WEB-DL-GROUP');

      expect(result.organizedFiles.length).toBe(1);
      const expectedDestination = path.join(tempDir, 'TV Shows', 'Severance', 'Season 1', 'Severance.S01E01.mkv');
      expect(path.resolve(result.organizedFiles[0])).toBe(path.resolve(expectedDestination));
      expect(fs.existsSync(expectedDestination)).toBe(true);

      // The original torrent folder and junk files should be deleted
      expect(fs.existsSync(torrentFolder)).toBe(false);
    });
  });

  describe('organizeLooseTvShowsInDownloads', () => {
    it('automatically sorts loose TV show files placed randomly in the downloads root', async () => {
      const looseEp1 = path.join(tempDir, 'Succession.S04E01.mkv');
      const looseEp2 = path.join(tempDir, 'The.Last.of.Us.S01E03.mkv');
      const movieFile = path.join(tempDir, 'The.Matrix.1999.mkv');

      fs.writeFileSync(looseEp1, 'ep1-data');
      fs.writeFileSync(looseEp2, 'ep2-data');
      fs.writeFileSync(movieFile, 'movie-data');

      const result = await organizeLooseTvShowsInDownloads(tempDir);

      expect(result.organized).toBe(2);

      const targetEp1 = path.join(tempDir, 'TV Shows', 'Succession', 'Season 4', 'Succession.S04E01.mkv');
      const targetEp2 = path.join(tempDir, 'TV Shows', 'The Last of Us', 'Season 1', 'The.Last.of.Us.S01E03.mkv');

      expect(fs.existsSync(targetEp1)).toBe(true);
      expect(fs.existsSync(targetEp2)).toBe(true);
      expect(fs.existsSync(movieFile)).toBe(true); // Movies remain untouched in root
    });
  });

  describe('cleanupEmptyMediaDirectories', () => {
    it('deletes empty movie directory when movie is removed', () => {
      const movieFolder = path.join(tempDir, 'Inception (2010)');
      fs.mkdirSync(movieFolder, { recursive: true });
      const movieFile = path.join(movieFolder, 'Inception.mkv');
      // No video file exists (simulating already unlinked)
      const nfoFile = path.join(movieFolder, 'movie.nfo');
      fs.writeFileSync(nfoFile, 'junk');

      const res = cleanupEmptyMediaDirectories(movieFile);
      expect(res.cleanedDirs.length).toBe(1);
      expect(fs.existsSync(movieFolder)).toBe(false);
    });

    it('deletes empty Season and Show folders when the only episode is deleted', () => {
      const showFolder = path.join(tempDir, 'TV Shows', 'Severance');
      const seasonFolder = path.join(showFolder, 'Season 1');
      fs.mkdirSync(seasonFolder, { recursive: true });
      const epFile = path.join(seasonFolder, 'Severance.S01E01.mkv');

      const res = cleanupEmptyMediaDirectories(epFile);
      expect(res.cleanedDirs.length).toBe(2);
      expect(fs.existsSync(seasonFolder)).toBe(false);
      expect(fs.existsSync(showFolder)).toBe(false);
      // Protected TV Shows root remains
      expect(fs.existsSync(path.join(tempDir, 'TV Shows'))).toBe(true);
    });

    it('retains show folder if other episodes still exist in other seasons', () => {
      const showFolder = path.join(tempDir, 'TV Shows', 'Breaking Bad');
      const season1Folder = path.join(showFolder, 'Season 1');
      const season2Folder = path.join(showFolder, 'Season 2');
      fs.mkdirSync(season1Folder, { recursive: true });
      fs.mkdirSync(season2Folder, { recursive: true });

      const ep1 = path.join(season1Folder, 'BB.S01E01.mkv'); // unlinked / deleted
      const ep2 = path.join(season2Folder, 'BB.S02E01.mkv');
      fs.writeFileSync(ep2, 'video content');

      const res = cleanupEmptyMediaDirectories(ep1);
      expect(fs.existsSync(season1Folder)).toBe(false);
      expect(fs.existsSync(season2Folder)).toBe(true);
      expect(fs.existsSync(showFolder)).toBe(true);
    });

    it('never deletes root download folder or TV Shows folder', () => {
      const tvShowsDir = path.join(tempDir, 'TV Shows');
      fs.mkdirSync(tvShowsDir, { recursive: true });

      expect(cleanupJunkDirectory(tempDir, tempDir)).toBe(false);
      expect(cleanupJunkDirectory(tvShowsDir, tempDir)).toBe(false);
      expect(fs.existsSync(tvShowsDir)).toBe(true);
    });
  });
});
