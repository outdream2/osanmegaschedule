$path = 'src/components/DayTimelineModal/DayTimelineModal.tsx'
$content = Get-Content $path -Raw -Encoding UTF8
# Reverse-order replace: bigger first
$content = $content -replace 'text-\[13px\]', 'text-[15px]'
$content = $content -replace 'text-\[12px\]', 'text-[14px]'
$content = $content -replace 'text-\[11px\]', 'text-[13px]'
$content = $content -replace 'text-\[10px\]', 'text-[12px]'
$content = $content -replace 'text-\[9px\]', 'text-[11px]'
$content = $content -replace 'text-\[8px\]', 'text-[10px]'
$content = $content -replace 'text-xs\b', 'text-[14px]'
$content = $content -replace 'text-sm\b', 'text-[16px]'
$content | Set-Content $path -Encoding UTF8 -NoNewline
Write-Host 'Done'
