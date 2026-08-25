$pokedexUrl = "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts"
$pokedexRaw = (Invoke-WebRequest -Uri $pokedexUrl -UseBasicParsing).Content

$idx = $pokedexRaw.IndexOf("ursaluna:")
Write-Host $pokedexRaw.Substring($idx, 900)
