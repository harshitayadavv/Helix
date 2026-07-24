$files = @(
  "src\app\dashboard\analysis\page.tsx",
  "src\app\dashboard\chat\page.tsx",
  "src\app\dashboard\compare\page.tsx",
  "src\app\dashboard\docs\page.tsx",
  "src\app\dashboard\graph\page.tsx",
  "src\app\dashboard\impact\page.tsx",
  "src\app\dashboard\page.tsx",
  "src\app\dashboard\performance\page.tsx",
  "src\app\dashboard\search\page.tsx",
  "src\app\dashboard\settings\page.tsx",
  "src\app\dashboard\timeline\page.tsx",
  "src\app\repo\[id]\layout.tsx"
)

foreach ($f in $files) {
  $content = Get-Content -LiteralPath $f -Raw
  $new = $content -replace '(?s)<TopBar\s+breadcrumbs=\{\[.*?\]\}\s*/>', '<TopBar />'
  Set-Content -LiteralPath $f -Value $new -NoNewline
  if ($content -ne $new) {
    Write-Host "Fixed: $f"
  } else {
    Write-Host "NO MATCH (check manually): $f"
  }
}