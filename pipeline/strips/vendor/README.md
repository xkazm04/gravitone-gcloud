# Vendored libraries for code-rendered strips

A strip page loads nothing from the network (pipeline/strips/CONTRACT.md), so an
approach card that names a library gets these files copied into the author's
`inputs/vendor/` and must inline them. Pinned, fetched from jsDelivr on
2026-10-06; checksums in SHA256SUMS.

| File | Package | Licence | Card key |
| --- | --- | --- | --- |
| three.min.js | three@0.149.0 (last release with a UMD build) | MIT | `three` |
| d3-array.min.js | d3-array@3.2.4 (d3-geo's dependency) | ISC | `d3-geo` |
| d3-geo.min.js | d3-geo@3.1.1 | ISC | `d3-geo` |
| topojson-client.min.js | topojson-client@3.1.0 | ISC | `d3-geo` |
| countries-110m.json | world-atlas@2.0.2 (Natural Earth 1:110m, public domain) | ISC | `d3-geo` |
