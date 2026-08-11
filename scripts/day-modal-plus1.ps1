$path = 'src/components/DayTimelineModal/DayTimelineModal.tsx'
$content = Get-Content $path -Raw -Encoding UTF8
# Reverse-order replace: bigger first (avoid double replace)
$content = $content -replace 'text-\[16px\]', 'text-[17px]'
$content = $content -replace 'text-\[15px\]', 'text-[16px]'
$content = $content -replace 'text-\[14px\]', 'text-[15px]'
$content = $content -replace 'text-\[13px\]', 'text-[14px]'
$content = $content -replace 'text-\[12px\]', 'text-[13px]'
$content = $content -replace 'text-\[11px\]', 'text-[12px]'
$content = $content -replace 'text-\[10px\]', 'text-[11px]'
$content | Set-Content $path -Encoding UTF8 -NoNewline
Write-Host 'Done'
