import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import db from '@/lib/db';
import {
  isAutoOrganizeEnabled,
  getTvShowsDirectory,
  getMoviesDirectory,
  formatSeasonFolderName,
  sanitizeFolderName,
  organizeTvEpisodeFile,
  organizeMovieFile,
  organizeDownloadedItem,
  organizeLooseTvShowsInDownloads,
  organizeLooseMoviesInDownloads,
  organizeLooseMediaInDownloads,
  cleanupJunkDirectory,
  cleanupEmptyMediaDirectories,
} from '@/lib/mediaOrganizer';

describe('mediaOrganizer', () => {
  let tempDir: string;
  let originalAutoOrganize: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lflix-test-'));
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('autoOrganize') as { value: string } | undefined;
    originalAutoOrganize = row?.value;
  });

  afterEach(() => {
    if (originalAutoOrganize !== undefined) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoOrganize', originalAutoOrganize);
    } else {
      db.prepare('DELETE FROM settings WHERE key = ?').run('autoOrganize');
    }
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

    it('returns the directory itself if it is already named TV Shows', () => {
      const existing = path.join(tempDir, 'TV Shows');
      fs.mkdirSync(existing, { recursive: true });

      const tvShowsDir = getTvShowsDirectory(existing);
      expect(path.resolve(tvShowsDir)).toBe(path.resolve(existing));
    });
  });

  describe('getMoviesDirectory', () => {
    it('creates Movies directory inside the base download folder if it does not exist', () => {
      const moviesDir = getMoviesDirectory(tempDir);
      expect(fs.existsSync(moviesDir)).toBe(true);
      expect(path.basename(moviesDir)).toBe('Movies');
    });

    it('reuses existing movies folder with different casing', () => {
      const existing = path.join(tempDir, 'movies');
      fs.mkdirSync(existing, { recursive: true });

      const moviesDir = getMoviesDirectory(tempDir);
      expect(path.resolve(moviesDir)).toBe(path.resolve(existing));
    });

    it('returns the directory itself if it is already named Movies', () => {
      const existing = path.join(tempDir, 'Movies');
      fs.mkdirSync(existing, { recursive: true });

      const moviesDir = getMoviesDirectory(existing);
      expect(path.resolve(moviesDir)).toBe(path.resolve(existing));
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

  describe('organizeMovieFile', () => {
    it('moves a loose movie video file into Movies/<Movie Title (Year)>/<file>', async () => {
      const movieFile = path.join(tempDir, 'Inception.2010.1080p.mkv');
      fs.writeFileSync(movieFile, 'mock video content');

      const result = await organizeMovieFile(movieFile, { baseDownloadPath: tempDir });

      expect(result.moved).toBe(true);
      expect(result.movieTitle).toBe('Inception');
      expect(result.year).toBe(2010);
      expect(result.newPath).toBeDefined();

      const expectedPath = path.join(tempDir, 'Movies', 'Inception (2010)', 'Inception (2010).mkv');
      expect(path.resolve(result.newPath!)).toBe(path.resolve(expectedPath));
      expect(fs.existsSync(expectedPath)).toBe(true);
      expect(fs.existsSync(movieFile)).toBe(false);
    });

    it('moves a movie without a year into Movies/<Movie Title>/<file>', async () => {
      const movieFile = path.join(tempDir, 'Interstellar.1080p.mkv');
      fs.writeFileSync(movieFile, 'mock video');

      const result = await organizeMovieFile(movieFile, { baseDownloadPath: tempDir });

      expect(result.moved).toBe(true);
      expect(result.movieTitle).toBe('Interstellar');
      const expectedPath = path.join(tempDir, 'Movies', 'Interstellar', 'Interstellar.mkv');
      expect(path.resolve(result.newPath!)).toBe(path.resolve(expectedPath));
      expect(fs.existsSync(expectedPath)).toBe(true);
    });

    it('moves companion subtitle files alongside the movie', async () => {
      const movieFolder = path.join(tempDir, 'Gladiator.II.2024.1080p');
      fs.mkdirSync(movieFolder, { recursive: true });
      const movieFile = path.join(movieFolder, 'Gladiator.II.2024.mkv');
      const srtFile = path.join(movieFolder, 'Gladiator.II.2024.en.srt');
      fs.writeFileSync(movieFile, 'video');
      fs.writeFileSync(srtFile, 'subtitles');

      const result = await organizeMovieFile(movieFile, {
        baseDownloadPath: tempDir,
        deleteSourceFolderIfEmpty: true,
      });

      expect(result.moved).toBe(true);
      const targetDir = path.join(tempDir, 'Movies', 'Gladiator II (2024)');
      expect(fs.existsSync(path.join(targetDir, 'Gladiator II (2024).mkv'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'Gladiator II (2024).en.srt'))).toBe(true);
      expect(fs.existsSync(movieFolder)).toBe(false);
    });

    it('moves subtitles from a Subs subfolder alongside the movie', async () => {
      const movieFolder = path.join(tempDir, 'Dune.Part.Two.2024');
      const subsFolder = path.join(movieFolder, 'Subs');
      fs.mkdirSync(subsFolder, { recursive: true });
      const movieFile = path.join(movieFolder, 'Dune.Part.Two.2024.mkv');
      const srtFile = path.join(subsFolder, '2_English.srt');
      fs.writeFileSync(movieFile, 'video');
      fs.writeFileSync(srtFile, 'subtitles');

      const result = await organizeMovieFile(movieFile, {
        baseDownloadPath: tempDir,
        deleteSourceFolderIfEmpty: true,
      });

      expect(result.moved).toBe(true);
      const targetDir = path.join(tempDir, 'Movies', 'Dune Part Two (2024)');
      expect(fs.existsSync(path.join(targetDir, 'Dune Part Two (2024).mkv'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'Subs', 'Dune Part Two (2024).srt'))).toBe(true);
      expect(fs.existsSync(movieFolder)).toBe(false);
    });

    it('does not move TV show episodes or sample clips', async () => {
      const tvFile = path.join(tempDir, 'Breaking.Bad.S01E01.mkv');
      fs.writeFileSync(tvFile, 'tv video');
      const tvResult = await organizeMovieFile(tvFile, { baseDownloadPath: tempDir });
      expect(tvResult.moved).toBe(false);
      expect(fs.existsSync(tvFile)).toBe(true);

      const sampleFile = path.join(tempDir, 'Inception.sample.mkv');
      fs.writeFileSync(sampleFile, 'sample');
      const sampleResult = await organizeMovieFile(sampleFile, { baseDownloadPath: tempDir });
      expect(sampleResult.moved).toBe(false);
    });

    it('does not move a movie that is already organized inside Movies/<Title (Year)>/', async () => {
      const organizedDir = path.join(tempDir, 'Movies', 'The Matrix (1999)');
      fs.mkdirSync(organizedDir, { recursive: true });
      const organizedFile = path.join(organizedDir, 'The.Matrix.1999.mkv');
      fs.writeFileSync(organizedFile, 'matrix video');

      const result = await organizeMovieFile(organizedFile, { baseDownloadPath: tempDir });
      expect(result.moved).toBe(false);
      expect(fs.existsSync(organizedFile)).toBe(true);
    });

    it('organizes a movie from a raw scene release subfolder inside Movies and deletes the source folder', async () => {
      const moviesDir = path.join(tempDir, 'Movies');
      fs.mkdirSync(moviesDir, { recursive: true });
      const sceneFolder = path.join(moviesDir, 'Motor.City.2026.2160p.iT.WEB-DL.DDP5.1.H.265-TRB');
      fs.mkdirSync(sceneFolder, { recursive: true });
      const movieFile = path.join(sceneFolder, 'Motor.City.2026.2160p.iT.WEB-DL.DDP5.1.H.265-TRB.mkv');
      const nfoFile = path.join(sceneFolder, 'release.nfo');
      fs.writeFileSync(movieFile, 'video-bytes');
      fs.writeFileSync(nfoFile, 'nfo-bytes');

      const result = await organizeMovieFile(movieFile, {
        baseDownloadPath: moviesDir,
        deleteSourceFolderIfEmpty: true,
      });

      expect(result.moved).toBe(true);
      expect(result.movieTitle).toBe('Motor City');
      expect(result.year).toBe(2026);

      const targetPath = path.join(moviesDir, 'Motor City (2026)', 'Motor City (2026).mkv');
      expect(fs.existsSync(targetPath)).toBe(true);
      expect(fs.existsSync(sceneFolder)).toBe(false);
    });

    it('moves companion artwork while ignoring ad and promotional files', async () => {
      const moviesDir = path.join(tempDir, 'Movies');
      fs.mkdirSync(moviesDir, { recursive: true });
      const sceneFolder = path.join(moviesDir, 'The Mongoose 2026.1080p.WEB.H264');
      fs.mkdirSync(sceneFolder, { recursive: true });
      const movieFile = path.join(sceneFolder, 'The.Mongoose.2026.mkv');
      const posterFile = path.join(sceneFolder, 'folder.jpg');
      const backdropFile = path.join(sceneFolder, 'backdrop.jpg');
      const logoFile = path.join(sceneFolder, 'logo.png');
      const adFile = path.join(sceneFolder, '【更多无水印电影请访问 www.BBQDDQ.com】.png');

      fs.writeFileSync(movieFile, 'video');
      fs.writeFileSync(posterFile, 'poster');
      fs.writeFileSync(backdropFile, 'backdrop');
      fs.writeFileSync(logoFile, 'logo');
      fs.writeFileSync(adFile, 'ad');

      const result = await organizeMovieFile(movieFile, {
        baseDownloadPath: moviesDir,
        deleteSourceFolderIfEmpty: true,
      });

      expect(result.moved).toBe(true);
      const targetDir = path.join(moviesDir, 'The Mongoose (2026)');
      expect(fs.existsSync(path.join(targetDir, 'The Mongoose (2026).mkv'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'folder.jpg'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'backdrop.jpg'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, 'logo.png'))).toBe(true);
      expect(fs.existsSync(path.join(targetDir, '【更多无水印电影请访问 www.BBQDDQ.com】.png'))).toBe(false);
      expect(fs.existsSync(sceneFolder)).toBe(false);
    });
  });

  describe('organizeDownloadedItem', () => {
    it('moves TV video files from a torrent subfolder and deletes the torrent directory containing junk files', async () => {
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

    it('moves movie video files from a torrent subfolder and deletes the torrent directory containing junk files', async () => {
      const torrentFolder = path.join(tempDir, 'Oppenheimer.2023.1080p.BluRay-GROUP');
      fs.mkdirSync(torrentFolder, { recursive: true });

      const videoFile = path.join(torrentFolder, 'Oppenheimer.2023.1080p.mkv');
      const nfoFile = path.join(torrentFolder, 'release.nfo');
      const txtFile = path.join(torrentFolder, 'torrent-info.txt');

      fs.writeFileSync(videoFile, 'movie-video');
      fs.writeFileSync(nfoFile, 'nfo');
      fs.writeFileSync(txtFile, 'txt');

      const result = await organizeDownloadedItem(tempDir, 'Oppenheimer.2023.1080p.BluRay-GROUP');

      expect(result.organizedFiles.length).toBe(1);
      const expectedDestination = path.join(tempDir, 'Movies', 'Oppenheimer (2023)', 'Oppenheimer (2023).mkv');
      expect(path.resolve(result.organizedFiles[0])).toBe(path.resolve(expectedDestination));
      expect(fs.existsSync(expectedDestination)).toBe(true);

      // Original torrent directory and junk files cleaned up
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
      expect(fs.existsSync(movieFile)).toBe(true); // Movies remain untouched in root by TV organizer
    });
  });

  describe('organizeLooseMoviesInDownloads', () => {
    it('automatically sorts loose movie files into Movies/<Movie Title (Year)>/', async () => {
      const movie1 = path.join(tempDir, 'Interstellar.2014.1080p.mkv');
      const movie2 = path.join(tempDir, 'Parasite.2019.mkv');
      const tvFile = path.join(tempDir, 'Breaking.Bad.S01E01.mkv');

      fs.writeFileSync(movie1, 'movie1-data');
      fs.writeFileSync(movie2, 'movie2-data');
      fs.writeFileSync(tvFile, 'tv-data');

      const result = await organizeLooseMoviesInDownloads(tempDir);

      expect(result.organized).toBe(2);

      const target1 = path.join(tempDir, 'Movies', 'Interstellar (2014)', 'Interstellar (2014).mkv');
      const target2 = path.join(tempDir, 'Movies', 'Parasite (2019)', 'Parasite (2019).mkv');

      expect(fs.existsSync(target1)).toBe(true);
      expect(fs.existsSync(target2)).toBe(true);
      expect(fs.existsSync(tvFile)).toBe(true); // TV file untouched by movie organizer
    });

    it('organizes subfolders inside a root folder named Movies and cleans up duplicate empty Movies folder', async () => {
      const moviesRoot = path.join(tempDir, 'Movies');
      fs.mkdirSync(moviesRoot, { recursive: true });

      // Duplicate empty Movies folder
      const dupMovies = path.join(moviesRoot, 'Movies');
      fs.mkdirSync(dupMovies, { recursive: true });

      // Scene subfolder
      const sceneFolder = path.join(moviesRoot, 'Motor.City.2026.2160p.iT.WEB-DL.DDP5.1.H.265-TRB');
      fs.mkdirSync(sceneFolder, { recursive: true });
      const movieFile = path.join(sceneFolder, 'Motor.City.2026.2160p.iT.WEB-DL.DDP5.1.H.265-TRB.mkv');
      fs.writeFileSync(movieFile, 'video');

      const result = await organizeLooseMoviesInDownloads(moviesRoot);

      expect(result.organized).toBe(1);
      const organizedPath = path.join(moviesRoot, 'Motor City (2026)', 'Motor City (2026).mkv');
      expect(fs.existsSync(organizedPath)).toBe(true);
      expect(fs.existsSync(sceneFolder)).toBe(false);
      expect(fs.existsSync(dupMovies)).toBe(false);
    });
  });

  describe('organizeLooseMediaInDownloads', () => {
    it('automatically sorts both loose TV shows and loose movies in a single pass', async () => {
      const movieFile = path.join(tempDir, 'Inception.2010.mkv');
      const tvFile = path.join(tempDir, 'Severance.S01E02.mkv');

      fs.writeFileSync(movieFile, 'movie-content');
      fs.writeFileSync(tvFile, 'tv-content');

      const result = await organizeLooseMediaInDownloads(tempDir);

      expect(result.organizedMovies).toBe(1);
      expect(result.organizedShows).toBe(1);

      const targetMovie = path.join(tempDir, 'Movies', 'Inception (2010)', 'Inception (2010).mkv');
      const targetTv = path.join(tempDir, 'TV Shows', 'Severance', 'Season 1', 'Severance.S01E02.mkv');

      expect(fs.existsSync(targetMovie)).toBe(true);
      expect(fs.existsSync(targetTv)).toBe(true);
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
      expect(res.cleanedDirs.length).toBe(1);
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

  describe('autoOrganize setting', () => {
    it('isAutoOrganizeEnabled defaults to true when setting is absent or set to true', () => {
      db.prepare('DELETE FROM settings WHERE key = ?').run('autoOrganize');
      expect(isAutoOrganizeEnabled()).toBe(true);

      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoOrganize', 'true');
      expect(isAutoOrganizeEnabled()).toBe(true);

      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoOrganize', '1');
      expect(isAutoOrganizeEnabled()).toBe(true);
    });

    it('isAutoOrganizeEnabled returns false when setting is false or 0', () => {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoOrganize', 'false');
      expect(isAutoOrganizeEnabled()).toBe(false);

      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoOrganize', '0');
      expect(isAutoOrganizeEnabled()).toBe(false);
    });

    it('does not organize movies when autoOrganize is disabled', async () => {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoOrganize', 'false');

      const movieFile = path.join(tempDir, 'Gladiator.2000.1080p.mkv');
      fs.writeFileSync(movieFile, 'video');

      const result = await organizeMovieFile(movieFile, { baseDownloadPath: tempDir });
      expect(result.moved).toBe(false);
      expect(result.error).toContain('disabled');
      expect(fs.existsSync(movieFile)).toBe(true);
    });

    it('does not organize TV episodes when autoOrganize is disabled', async () => {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoOrganize', 'false');

      const tvFile = path.join(tempDir, 'Severance.S01E01.1080p.mkv');
      fs.writeFileSync(tvFile, 'video');

      const result = await organizeTvEpisodeFile(tvFile, { baseDownloadPath: tempDir });
      expect(result.moved).toBe(false);
      expect(result.error).toContain('disabled');
      expect(fs.existsSync(tvFile)).toBe(true);
    });

    it('leaves downloaded torrent files and folders untouched when autoOrganize is disabled', async () => {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoOrganize', 'false');

      const torrentFolder = path.join(tempDir, 'Inception.2010.1080p');
      fs.mkdirSync(torrentFolder, { recursive: true });
      const video = path.join(torrentFolder, 'Inception.2010.1080p.mkv');
      const junk = path.join(torrentFolder, 'torrent.nfo');
      fs.writeFileSync(video, 'video');
      fs.writeFileSync(junk, 'junk');

      const result = await organizeDownloadedItem(tempDir, 'Inception.2010.1080p');
      expect(result.organizedFiles.length).toBe(0);
      expect(result.deletedFolders.length).toBe(0);
      expect(fs.existsSync(video)).toBe(true);
      expect(fs.existsSync(torrentFolder)).toBe(true);
    });

    it('does not touch loose media in downloads when autoOrganize is disabled', async () => {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('autoOrganize', 'false');

      const movieFile = path.join(tempDir, 'Interstellar.2014.mkv');
      const tvFile = path.join(tempDir, 'Severance.S01E03.mkv');
      fs.writeFileSync(movieFile, 'movie');
      fs.writeFileSync(tvFile, 'tv');

      const result = await organizeLooseMediaInDownloads(tempDir);
      expect(result.organizedMovies).toBe(0);
      expect(result.organizedShows).toBe(0);
      expect(fs.existsSync(movieFile)).toBe(true);
      expect(fs.existsSync(tvFile)).toBe(true);
    });
  });
});
