@echo off
echo Creating HTML version of LFLIX Implementation Plan...
type NUL > temp.md
type G:\projects\LFLIX\docs\LFLIX_Implementation_Plan_with_images.md > temp.md
echo <!DOCTYPE html> > output.html
echo <html> >> output.html
echo <head> >> output.html
echo <meta charset="utf-8"> >> output.html
echo <title>LFLIX Implementation Plan</title> >> output.html
echo <style> >> output.html
echo body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; } >> output.html
echo h1, h2, h3 { color: #333; } >> output.html
echo img { max-width: 100%; height: auto; margin: 20px 0; } >> output.html
echo </style> >> output.html
echo </head> >> output.html
echo <body> >> output.html
powershell -Command "& {Get-Content temp.md | ForEach-Object { if ($_ -match '^# (.*)') { '<h1>' + $matches[1] + '</h1>' } elseif ($_ -match '^## (.*)') { '<h2>' + $matches[1] + '</h2>' } elseif ($_ -match '^### (.*)') { '<h3>' + $matches[1] + '</h3>' } elseif ($_ -match '^!\[.*\]\((.*)\)') { '<img src="" + $matches[1] + """>'} elseif ($_ -eq '') { '<p></p>' } else { '<p>' + $_ + '</p>' } } | Set-Content output.html -Append"
echo </body> >> output.html
echo </html> >> output.html
del temp.md
echo HTML version created: output.html
echo To convert to PDF, you can:
echo 1. Open output.html in browser and print to PDF
echo 2. Use an online HTML to PDF converter
echo 3. Install wkhtmltopdf and run: wkhtmltopdf output.html LFLIX_Implementation_Plan.pdf