[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RemainingArgs
)

$binDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeExe = Join-Path $binDir "..\node.exe"
if (-not (Test-Path $nodeExe)) {
    $nodeExe = "node"
}

$jsScript = Join-Path $binDir "maxide.js"
& $nodeExe $jsScript @RemainingArgs
