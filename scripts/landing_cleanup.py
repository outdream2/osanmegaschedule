import re
import sys

path = 'src/components/LandingPage/LandingPage.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove wrapper divs containing ChevronRight action indicators
pattern = re.compile(
    r'\s*<div className="flex items-center gap-1 mt-2 text-[a-z]+-\d{3} text-xs font-bold">\s*'
    r'<span className="text-\[11px\] sm:text-xs">[^<]*</span>\s*'
    r'<ChevronRight size=\{11\} className="[^"]*" />\s*'
    r'</div>',
    re.MULTILINE
)
new_content, n = pattern.subn('', content)
print(f'Removed {n} wrapper divs')

# Expand description text-[10px] to text-[11px]
new_content = new_content.replace(
    'className="text-slate-400 text-[10px] leading-tight',
    'className="text-slate-400 text-[11px] sm:text-[13px] leading-tight'
)
new_content = re.sub(
    r'text-\[10px\] sm:text-xs leading-tight sm:leading-relaxed',
    'text-[11px] sm:text-[13px] leading-tight sm:leading-relaxed',
    new_content
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print('Done')
