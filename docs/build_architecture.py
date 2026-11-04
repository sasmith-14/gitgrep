"""Render ARCHITECTURE.md with optional, isolated documentation dependencies."""
import html
import math
import re
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon

ROOT = Path(__file__).resolve().parent.parent
NAVY = colors.HexColor('#13283f')
TEAL = colors.HexColor('#127b83')
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='GuideTitle', fontName='Helvetica-Bold', fontSize=32, leading=37, textColor=NAVY, spaceAfter=24))
styles.add(ParagraphStyle(name='Chapter', fontName='Helvetica-Bold', fontSize=22, leading=27, textColor=NAVY, spaceAfter=18))
styles.add(ParagraphStyle(name='GuideBody', fontName='Helvetica', fontSize=11, leading=16, textColor=NAVY, spaceAfter=13))


def diagram(source):
    nodes = dict(re.findall(r'([A-Z])\[([^\]]+)\]', source))
    edges = re.findall(r'([A-Z])(?:\[[^\]]+\])?\s*-->\s*([A-Z])', source)
    keys = list(nodes)
    cols = 3 if len(keys) > 3 else len(keys)
    height = ((len(keys) + cols - 1) // cols) * 95 + 18
    drawing = Drawing(475, height)
    positions = {key: ((i % cols if i // cols % 2 == 0 else cols - 1 - i % cols) * 160 + 3,
                       height - 72 - (i // cols) * 95) for i, key in enumerate(keys)}
    for a, b in edges:
        ax, ay = positions[a]
        bx, by = positions[b]
        if ay == by:
            x1, y1, x2, y2 = (ax + 145, ay + 24, bx, by + 24) if bx > ax else (ax, ay + 24, bx + 145, by + 24)
        else:
            x1, y1, x2, y2 = (ax + 72, ay, bx + 72, by + 48) if by < ay else (ax + 72, ay + 48, bx + 72, by)
        drawing.add(Line(x1, y1, x2, y2, strokeColor=TEAL, strokeWidth=1.5))
        angle = math.atan2(y2-y1, x2-x1)
        drawing.add(Polygon([x2, y2, x2-7*math.cos(angle-.45), y2-7*math.sin(angle-.45),
                             x2-7*math.cos(angle+.45), y2-7*math.sin(angle+.45)], fillColor=TEAL, strokeColor=TEAL))
    for key, (x, y) in positions.items():
        drawing.add(Rect(x, y, 145, 48, rx=7, ry=7, fillColor=colors.HexColor('#edf6f7'), strokeColor=TEAL, strokeWidth=.8))
        lines, line = [], ''
        for word in nodes[key].split():
            if len(line+' '+word) > 22:
                lines.append(line)
                line = word
            else:
                line = (line+' '+word).strip()
        lines.append(line)
        for n, label in enumerate(lines):
            drawing.add(String(x+72.5, y+27+(len(lines)-1)*5-n*11, label, textAnchor='middle', fontName='Helvetica-Bold', fontSize=9, fillColor=NAVY))
    return drawing


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(TEAL)
    canvas.line(56, 48, 539, 48)
    canvas.setFont('Helvetica', 9)
    canvas.setFillColor(NAVY)
    canvas.drawString(56, 33, 'GITGREP  /  Architecture and search concepts')
    canvas.drawRightString(539, 33, str(doc.page))
    canvas.restoreState()


def build():
    story = []
    for block in re.split(r'\n\s*\n', (ROOT/'ARCHITECTURE.md').read_text()):
        block = block.strip()
        if not block:
            continue
        if block.startswith('```mermaid'):
            story.extend([diagram(block), Spacer(1, 16)])
        elif block.startswith('# '):
            story.extend([Spacer(1, 80), Paragraph(html.escape(block[2:]), styles['GuideTitle']), Spacer(1, 30)])
        elif block.startswith('## '):
            story.extend([PageBreak(), Paragraph(html.escape(block[3:]), styles['Chapter'])])
        else:
            story.append(Paragraph(html.escape(block).replace('\n', ' '), styles['GuideBody']))
    doc = SimpleDocTemplate(str(ROOT/'Gitgrep-Architecture.pdf'), pagesize=(595.28, 841.89), leftMargin=56, rightMargin=56,
                            topMargin=58, bottomMargin=65, title='Gitgrep: architecture and search concepts', author='Gitgrep project')
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == '__main__':
    build()
