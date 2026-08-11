$path = 'src/components/SchedulePage/ScheduleCell.tsx'
$lines = Get-Content $path -Encoding UTF8
for ($i = 224; $i -lt $lines.Length; $i++) {
    $l = $lines[$i]
    $l = $l -replace 'text-\[15px\]', 'text-[18px]'
    $l = $l -replace 'text-\[14px\]', 'text-[17px]'
    $l = $l -replace 'text-\[13px\]', 'text-[16px]'
    $l = $l -replace 'text-\[12px\]', 'text-[15px]'
    $l = $l -replace 'text-\[11px\]', 'text-[14px]'
    $l = $l -replace 'text-\[10px\]', 'text-[13px]'
    $l = $l -replace 'text-\[9px\]', 'text-[12px]'
    $l = $l -replace 'text-\[8px\]', 'text-[11px]'
    $l = $l -replace 'text-xs\b', 'text-[15px]'
    $l = $l -replace 'text-sm\b', 'text-[17px]'
    $lines[$i] = $l
}
$lines | Set-Content $path -Encoding UTF8
Write-Host 'Done'
