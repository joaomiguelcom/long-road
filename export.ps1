<#
  Long Road - export attended concerts from setlist.fm
  Usage (PowerShell):
    $env:SETLISTFM_API_KEY = "your-key"
    powershell -ExecutionPolicy Bypass -File .\export.ps1
  Works on Windows PowerShell 5.1 and PowerShell 7 (pwsh, also on Linux for GitHub Actions).
#>
param(
  [string]$User = "ojoaomiguel",
  [string]$ApiKey = $env:SETLISTFM_API_KEY,
  [string]$OutDir = (Join-Path $PSScriptRoot "data")
)

$ErrorActionPreference = "Stop"
if (-not $ApiKey) { throw "Missing API key. Set `$env:SETLISTFM_API_KEY or pass -ApiKey." }

$utf8 = New-Object System.Text.UTF8Encoding($false)
$headers = @{ "x-api-key" = $ApiKey; "Accept" = "application/json"; "Accept-Language" = "en" }

function Get-Page([int]$Page) {
  $uri = "https://api.setlist.fm/rest/1.0/user/$User/attended?p=$Page"
  for ($try = 1; $try -le 6; $try++) {
    try {
      # Decode bytes as UTF-8 ourselves: Windows PowerShell 5.1 can mangle accents otherwise
      $resp = Invoke-WebRequest -Uri $uri -Headers $headers -UseBasicParsing
      $bytes = $resp.RawContentStream.ToArray()
      return ($utf8.GetString($bytes) | ConvertFrom-Json)
    } catch {
      $code = $null
      if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      if ($code -eq 404) { return $null }
      if ($try -eq 6 -or ($code -and $code -ne 429 -and $code -lt 500)) { throw }
      Write-Host "  page $Page failed ($code), retrying in $(2 * $try)s..."
      Start-Sleep -Seconds (2 * $try)
    }
  }
}

Write-Host "Fetching concerts of '$User' from setlist.fm..."
$raw = New-Object System.Collections.ArrayList
$first = Get-Page 1
$total = [int]$first.total
$pages = [math]::Ceiling($total / [double]$first.itemsPerPage)
[void]$raw.AddRange(@($first.setlist))
for ($p = 2; $p -le $pages; $p++) {
  Start-Sleep -Milliseconds 700   # stay well under the 2 requests/second limit
  Write-Host "  page $p of $pages"
  $page = Get-Page $p
  if ($page) { [void]$raw.AddRange(@($page.setlist)) }
}
Write-Host "Got $($raw.Count) of $total concerts."

# Flatten into a simple shape for the app
$concerts = foreach ($s in $raw) {
  $songs = New-Object System.Collections.ArrayList
  $encore = 0
  foreach ($set in @($s.sets.set)) {
    if (-not $set) { continue }
    $label = "Main"
    if ($set.encore) { $encore++; $label = "Encore $encore" }
    elseif ($set.name) { $label = $set.name }
    foreach ($song in @($set.song)) {
      if (-not $song) { continue }
      [void]$songs.Add([ordered]@{
        name  = $song.name
        set   = $label
        cover = $(if ($song.cover) { $song.cover.name } else { $null })
        tape  = [bool]$song.tape
        info  = $song.info
      })
    }
  }
  $d = [datetime]::ParseExact($s.eventDate, "dd-MM-yyyy", [Globalization.CultureInfo]::InvariantCulture)
  [ordered]@{
    id      = $s.id
    date    = $d.ToString("yyyy-MM-dd")
    artist  = $s.artist.name
    venue   = $s.venue.name
    city    = $s.venue.city.name
    country = $s.venue.city.country.name
    lat     = $(if ($s.venue.city.coords) { $s.venue.city.coords.lat } else { $null })
    lng     = $(if ($s.venue.city.coords) { $s.venue.city.coords.long } else { $null })
    tour    = $(if ($s.tour) { $s.tour.name } else { $null })
    info    = $s.info
    url     = $s.url
    songs   = @($songs)
  }
}
# Newest first; same-day concerts keep the order the API returned (Sort-Object alone is not stable)
$i = 0
$concerts = @($concerts | ForEach-Object { [pscustomobject]@{ c = $_; i = $i++ } } |
  Sort-Object @{ Expression = { $_.c.date }; Descending = $true }, @{ Expression = { $_.i }; Ascending = $true } |
  ForEach-Object { $_.c })

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
# Upcoming shows: the API has none, so read the "Upcoming Shows" list of the public attendance page
function Get-Upcoming {
  $months = @{ Jan = 1; Feb = 2; Mar = 3; Apr = 4; May = 5; Jun = 6; Jul = 7; Aug = 8; Sep = 9; Oct = 10; Nov = 11; Dec = 12 }
  $resp = Invoke-WebRequest -Uri "https://www.setlist.fm/attended/$User" -UseBasicParsing -Headers @{ "User-Agent" = "Mozilla/5.0 (Long Road backup)"; "Accept-Language" = "en" }
  $html = $utf8.GetString($resp.RawContentStream.ToArray())
  $start = $html.IndexOf("Upcoming Shows")
  if ($start -lt 0) { return @() }
  $end = $html.IndexOf("Attended Shows", $start)
  if ($end -lt 0) { $end = $html.Length }
  $section = $html.Substring($start, $end - $start)
  $list = foreach ($li in ($section -split "<li[\s>]" | Select-Object -Skip 1)) {
    $m = [regex]::Match($li, 'href="([^"]*/(?:show|upcoming)/[^"]+)"')
    if (-not $m.Success) { continue }
    $url = [Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
    if ($url.StartsWith("/")) { $url = "https://www.setlist.fm$url" }
    $text = [Net.WebUtility]::HtmlDecode(($li -replace "<[^>]+>", " ")) -replace "\s+", " "
    $d = [regex]::Match($text, "\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? (\d{1,2}) (\d{4})\b")
    if (-not $d.Success) { continue }
    $date = "{0}-{1:00}-{2:00}" -f $d.Groups[3].Value, $months[$d.Groups[1].Value], [int]$d.Groups[2].Value
    $t = [regex]::Match($li, 'title="View this (.+?) show"')
    $artist = $(if ($t.Success) { [Net.WebUtility]::HtmlDecode($t.Groups[1].Value) } else { $null })
    $rest = $text.Substring($d.Index + $d.Length)
    if ($artist) { $i = $rest.IndexOf($artist); if ($i -ge 0) { $rest = $rest.Substring($i + $artist.Length) } }
    $rest = ($rest -replace "Add a private note.*$", "" -replace "Edit private note.*$", "").Trim(" ", ",", "-")
    [ordered]@{ date = $date; artist = $artist; place = $rest; url = $url }
  }
  return @($list | Sort-Object { $_.date })
}
$upcoming = @()
try {
  $upcoming = @(Get-Upcoming)
  Write-Host "Upcoming shows: $($upcoming.Count)"
  foreach ($u in $upcoming) { Write-Host "  $($u.date) | $($u.artist) | $($u.place)" }
} catch {
  Write-Host "Could not read upcoming shows: $($_.Exception.Message)"
}

$payload = [ordered]@{ user = $User; generatedAt = $generatedAt; total = $total; concerts = $concerts; upcoming = $upcoming }
$json = ConvertTo-Json -InputObject $payload -Depth 10 -Compress

# 1) Full raw backup, exactly as the API returned it
[IO.File]::WriteAllText((Join-Path $OutDir "raw-attended.json"), (ConvertTo-Json -InputObject @($raw) -Depth 20), $utf8)
# 2) Clean JSON for other tools
[IO.File]::WriteAllText((Join-Path $OutDir "concerts.json"), $json, $utf8)
# 3) data.js so index.html works by double-click (browsers block fetch() on file://)
[IO.File]::WriteAllText((Join-Path $OutDir "data.js"), "window.LONG_ROAD = $json;", $utf8)
# 4) CSV for Excel (UTF-8 with BOM so Excel shows accents correctly)
$rows = foreach ($c in $concerts) {
  [pscustomobject]@{
    Date = $c.date; Artist = $c.artist; Venue = $c.venue; City = $c.city; Country = $c.country
    Tour = $c.tour; Songs = @($c.songs).Count; Url = $c.url
  }
}
$csv = ($rows | ConvertTo-Csv -NoTypeInformation) -join "`r`n"
[IO.File]::WriteAllText((Join-Path $OutDir "concerts.csv"), $csv, (New-Object System.Text.UTF8Encoding($true)))

Write-Host "Done. Files written to $OutDir"
