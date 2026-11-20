# aGIS Raster Toolbox

This module adds local raster processing for the `agis-from-scratch` Android/Web build.

## Implemented processing paths

| Tool | Engine | Notes |
|---|---|---|
| Clip Raster | GDAL `gdalwarp` | Extent values are interpreted in the source CRS unless an extent CRS is supplied. |
| Extract by Mask | GDAL `gdalwarp -cutline` | Uses a polygon layer converted to GeoJSON in the GDAL virtual filesystem. |
| Project Raster | GDAL `gdalwarp` | EPSG target CRS. |
| Resample Raster | GDAL `gdalwarp` | Nearest, bilinear, cubic, average or mode. |
| Align Raster Grid | GDAL `gdalwarp` | Uses the selected reference raster's CRS, extent and pixel size; rotated grids are rejected. |
| Raster Calculator | GeoTIFF.js typed-array engine | Arithmetic (+, -, *, /, parentheses, unary signs); input dimensions, pixel size and origin must match. Variables A, B, C… follow selection order. |
| Reclassify | GeoTIFF.js typed-array engine | Inclusive min/max/new-value rules. Unmatched values become -9999. |
| Slope | GeoTIFF.js typed-array engine | Horn 3×3 derivative; degrees. |
| Aspect | GeoTIFF.js typed-array engine | Horn 3×3 derivative; degrees clockwise from north. |
| Hillshade | GeoTIFF.js typed-array engine | Analytical hillshade, azimuth 315°, altitude 45°. |
| D8 Flow Direction | Custom D8 graph engine | ESRI direction codes; steepest downslope neighbour. |
| D8 Flow Accumulation | Custom D8 graph engine | Upstream contributing-cell count. |
| Stream Extraction | Custom D8 graph engine | Threshold on contributing-cell count. |
| Topographic Wetness Index | Custom D8 graph engine | ln(contributing area / tan(slope)).
| Raster Information | GeoTIFF.js | Dimensions, bands, origin, resolution, bounds and EPSG metadata. |

## Output

All processing outputs are GeoTIFF. The UI also offers a FileGDB export attempt. FileGDB raster output is only available when the bundled GDAL raster driver advertises write support and the export operation produces a valid archive; this is not guaranteed by vector FileGDB support.

## Mobile safety limits

The raster calculator is capped at 16 million cells, reclassification at 20 million cells, and terrain derivatives at 12 million cells, and D8 hydrology at 8.5 million cells to reduce Android WebView out-of-memory failures. Large inputs should be clipped or resampled before analysis.

## Not yet implemented

The full toolbox roadmap still includes multi-input mosaic/merge, virtual raster building, polygonization, rasterization, contours, watershed delineation, NoData editing, statistics/overviews, and persistent FileGDB raster update workflows. These must not be presented as operational until their algorithms and output validation are added.
