@echo off
REM Simple HTML to PDF conversion using wkhtmltopdf if available, otherwise create HTML version

echo Converting LFLIX Implementation Plan to PDF format...

REM First, convert markdown to HTML
type G:\projects\LFLIX\docs\LFLIX_Implementation_Plan_with_images.md > temp.md

REM Create HTML wrapper
echo <!DOCTYPE html> > temp.html
echo <html> >> temp.html
echo <head> >> temp.html
echo <meta charset="utf-8"> >> temp.html
echo <title>LFLIX Implementation Plan</title> >> temp.html
echo <style> >> temp.html
echo body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; } >> temp.html
echo h1, h2, h3 { color: #333; } >> temp.html
echo img { max-width: 100%; height: auto; margin: 20px 0; } >> temp.html
echo .page-break { page-break-after: always; } >> temp.html
echo </style> >> temp.html
echo </head> >> temp.html
echo <body> >> temp.html

REM Convert markdown to HTML (basic conversion)
powershell -Command "& {Get-Content temp.md | ForEach-Object { if ($_ -match '^# (.*)') { '<h1>' + $matches[1] + '</h1>' } elseif ($_ -match '^## (.*)') { '<h2>' + $matches[1] + '</h2>' } elseif ($_ -match '^### (.*)') { '<h3>' + $matches[1] + '</h3>' } elseif ($_ -match '^!\[.*\]\((.*)\)') { '<img src="" + $matches[1] + """>'} elseif ($_ -eq '') { '<p></p>' } else { '<p>' + $_ + '</p>' } } | Set-Content temp.html -Append"

echo </body> >> temp.html
echo </html> >> temp.html

REM Try to convert to PDF if wkhtmltopdf is available
where wkhtmltopdf >nul 2>&1
if not errorlevel 1 (
    wkhtmltopdf temp.html LFLIX_Implementation_Plan.pdf
    if not errorlevel 1 (
        echo PDF created successfully: LFLIX_Implementation_Plan.pdf
    ) else (
        echo wkhtmltopdf failed, HTML version created: temp.html
    )
) else (
    echo wkhtmltopdf not found, HTML version created: temp.html
    echo To convert to PDF, install wkhtmltopdf and run: wkhtmltopdf temp.html LFLIX_Implementation_Plan.pdf
)

REM Cleanup
del temp.md temp.html 2>nul