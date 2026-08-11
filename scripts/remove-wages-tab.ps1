$path='src/components/SettingsModal/SettingsModal.tsx'
$lines = Get-Content $path -Encoding UTF8
# 0-index: lines 591..772 (1-indexed 592..773) → wages tab block
$before = $lines[0..590]
$after = $lines[773..($lines.Count-1)]
($before + $after) | Set-Content $path -Encoding UTF8
Write-Host 'done'
