@echo off
title Rclone Google Drive Mount (Z:)
echo ===================================================
echo       Mounting Google Drive to Z: (Local Disk)
echo       Cache Directory: H:\RcloneCache
echo       Remote Control Port: 5572
echo ===================================================
echo.
curl -s -X POST http://127.0.0.1:5572/core/quit >nul 2>&1
curl -s -X POST http://127.0.0.1:55720/core/quit >nul 2>&1
ping 127.0.0.1 -n 2 >nul
taskkill /IM rclone.exe /F >nul 2>&1
ping 127.0.0.1 -n 2 >nul
"C:\Rclone\rclone.exe" mount gdrive: Z: ^
  --rc ^
  --rc-no-auth ^
  --rc-addr 127.0.0.1:5572 ^
  --cache-dir "H:\RcloneCache" ^
  --vfs-cache-mode full ^
  --vfs-cache-max-size 15G ^
  --vfs-cache-max-age 6h ^
  --vfs-cache-poll-interval 1m ^
  --vfs-read-chunk-size 16M ^
  --vfs-read-chunk-size-limit 256M ^
  --vfs-handle-caching 0s ^
  --vfs-read-wait 0ms ^
  --vfs-fast-fingerprint ^
  --buffer-size 64M ^
  --drive-pacer-min-sleep 10ms ^
  --drive-pacer-burst 200 ^
  --volname "Google Drive" ^
  --poll-interval 15s ^
  --dir-cache-time 24h ^
  --attr-timeout 24h ^
  --no-modtime ^
  --no-checksum ^
  --log-file "C:\Rclone\rclone.log" ^
  --log-level NOTICE
