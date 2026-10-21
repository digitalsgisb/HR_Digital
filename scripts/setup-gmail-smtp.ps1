param(
  [ValidateSet('local', 'docker')][string]$Target = 'local',
  [string]$Sender,
  [string]$Recipient
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$configPath = if ($Target -eq 'docker') { Join-Path $projectRoot '.env' } else { Join-Path $projectRoot 'server/.env' }

Write-Host 'HR Digital - Google Workspace / Gmail SMTP setup'
Write-Host 'Enable Google 2-Step Verification and create an App Password named HR Digital.'
Write-Host 'https://myaccount.google.com/apppasswords'
Write-Host 'Use an App Password here, not your normal Google password.'
Write-Host "Settings will be saved in: $configPath"
if (-not $Sender) { $Sender = Read-Host 'Google sender email address' }
if (-not $Recipient) {
  $Recipient = Read-Host "Test recipient email address (Enter for $Sender)"
  if (-not $Recipient) { $Recipient = $Sender }
}
foreach ($address in @($Sender, $Recipient)) {
  if ($address -notmatch '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$') { throw 'Enter one valid email address for each field.' }
}
$Sender = $Sender.Trim().ToLowerInvariant()
$Recipient = $Recipient.Trim().ToLowerInvariant()
$secret = Read-Host 'Google App Password (hidden)' -AsSecureString
$secretPointer = [IntPtr]::Zero
try {
  $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  $appPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer) -replace '\s', ''
  if ($appPassword -notmatch '^[a-zA-Z0-9]{16}$') { throw 'Google App Passwords contain 16 characters. Copy the full App Password and try again.' }
  $settings = [ordered]@{
    EMAIL_TRANSPORT = 'smtp'
    SMTP_HOST = 'smtp.gmail.com'
    SMTP_PORT = '587'
    SMTP_SECURE = 'false'
    SMTP_REQUIRE_TLS = 'true'
    SMTP_USER = $Sender
    SMTP_PASSWORD = $appPassword
    SMTP_FROM = "HR Digital <$Sender>"
    SMTP_TEST_RECIPIENTS = $Recipient
  }
  $config = if (Test-Path -LiteralPath $configPath) { [IO.File]::ReadAllText($configPath) } else { '' }
  foreach ($key in $settings.Keys) {
    $line = $key + '=' + '"' + $settings[$key] + '"'
    $pattern = '(?m)^\s*(?:export\s+)?' + [regex]::Escape($key) + '\s*=.*$'
    if ([regex]::IsMatch($config, $pattern)) {
      $replacement = $line
      $config = [regex]::Replace($config, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $replacement })
    } else { $config = $config.TrimEnd() + "`n" + $line + "`n" }
  }
  [IO.File]::WriteAllText($configPath, $config.TrimStart() + "`n", [Text.UTF8Encoding]::new($false))
} finally {
  if ($secretPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer) }
  $appPassword = $null
  $settings = $null
  $config = $null
  $secret.Dispose()
}
Write-Host 'Gmail SMTP settings saved. The password was not printed.'
if ($Target -eq 'docker') {
  Write-Host 'On your deployment server, recreate the app: docker compose up -d --build app'
} else {
  Write-Host 'Restart the API, then run: npm run smtp:check'
}
Write-Host 'In HR Digital open Training > Email automation > Check connection, then Send test email.'
