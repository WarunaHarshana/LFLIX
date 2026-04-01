#!/usr/bin/env python3
"""
Simple markdown to HTML converter for LFLIX implementation plan
"""
import re
import os

def markdown_to_html(markdown_text):
    """Convert basic markdown to HTML"""
    lines = markdown_text.split('\n')
    html_lines = []
    
    in_code_block = False
    
    for line in lines:
        # Handle code blocks
        if line.startswith('```'):
            in_code_block = not in_code_block
            if in_code_block:
                html_lines.append('<pre><code>')
            else:
                html_lines.append('</code></pre>')
            continue
            
        if in_code_block:
            html_lines.append(line)
            continue
            
        # Handle headers
        if line.startswith('# '):
            html_lines.append(f'<h1>{line[2:]}</h1>')
        elif line.startswith('## '):
            html_lines.append(f'<h2>{line[3:]}</h1>')
        elif line.startswith('### '):
            html_lines.append(f'<h3>{line[4:]}</h3>')
        # Handle images
        elif re.match(r'!\[.*\]\((.*)\)', line):
            match = re.match(r'!\[.*\]\((.*)\)', line)
            html_lines.append(f'<img src="{match.group(1)}" style="max-width:100%; height:auto;">')
        # Handle empty lines
        elif line.strip() == '':
            html_lines.append('<br>')
        # Handle regular paragraphs
        else:
            html_lines.append(f'<p>{line}</p>')
    
    return '\n'.join(html_lines)

def main():
    input_file = r'G:\projects\LFLIX\docs\LFLIX_Implementation_Plan_with_images.md'
    output_file = r'G:\projects\LFLIX\docs\LFLIX_Implementation_Plan.html'
    
    # Read markdown
    with open(input_file, 'r', encoding='utf-8') as f:
        markdown_content = f.read()
    
    # Convert to HTML
    html_content = markdown_to_html(markdown_content)
    
    # Wrap in HTML template
    full_html = f'''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>LFLIX Implementation Plan</title>
    <style>
        body {{ 
            font-family: Arial, sans-serif; 
            margin: 40px; 
            line-height: 1.6; 
            color: #333;
        }}
        h1, h2, h3 {{ 
            color: #2c3e50; 
            margin-top: 30px;
        }}
        img {{
            max-width: 100%;
            height: auto;
            display: block;
            margin: 20px auto;
            border: 1px solid #ddd;
            border-radius: 4px;
        }}
        p {{
            margin-bottom: 16px;
        }}
        .page-break {{
            page-break-after: always;
        }}
    </style>
</head>
<body>
{html_content}
</body>
</html>'''
    
    # Write HTML file
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(full_html)
    
    print(f"HTML version created: {output_file}")
    print("To convert to PDF:")
    print("1. Open the HTML file in a web browser")
    print("2. Print to PDF (Ctrl+P -> Save as PDF)")
    print("3. Or use an online HTML to PDF converter")
    print("4. Or install wkhtmltopdf and run:")
    print(f"   wkhtmltopdf {output_file} LFLIX_Implementation_Plan.pdf")

if __name__ == '__main__':
    main()